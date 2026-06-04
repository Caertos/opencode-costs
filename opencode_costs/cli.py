"""CLI entry point for opencode-costs."""

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from rich.console import Console

from . import __version__
from .db import (
    DB_PATH,
    QUERY_RECENT_SESSION,
    QUERY_RECENT_SESSION_BY_DIR,
    QUERY_SESSION_BY_ID,
    QUERY_SESSION_TREE,
    get_db,
)
from .formatters import print_all_stats, print_last_n, print_session
from .models import SessionNode, build_tree


def main() -> None:
    """Main entry point."""
    parser = argparse.ArgumentParser(
        prog="costs",
        description="OpenCode cost reporter — detailed cost breakdown per agent",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  costs                        Most recent session
  costs --session ses_abc      Specific session
  costs --last 5               Last 5 sessions
  costs --all                  Global statistics
  costs --json                 JSON output
  costs --agent sdd-apply      Filter by agent
        """,
    )
    parser.add_argument("--version", "-v", action="version", version=f"%(prog)s {__version__}")
    parser.add_argument("--session", "-s", help="Session ID to analyze")
    parser.add_argument("--last", "-n", type=int, help="Show last N sessions")
    parser.add_argument("--all", "-a", action="store_true", help="Show global statistics")
    parser.add_argument("--agent", help="Filter by agent name")
    parser.add_argument("--json", "-j", action="store_true", help="Output as JSON")
    parser.add_argument("--db", help="Path to database", default=str(DB_PATH))

    args = parser.parse_args()

    db_path = Path(args.db)
    try:
        conn = get_db(db_path)
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        if args.all:
            if args.json:
                _print_all_json(conn)
            else:
                console = Console()
                print_all_stats(console, conn)
            return

        if args.last:
            if args.json:
                _print_last_n_json(conn, args.last)
            else:
                console = Console()
                print_last_n(console, conn, args.last)
            return

        # Single session mode
        if args.session:
            row = conn.execute(QUERY_SESSION_BY_ID, (args.session,)).fetchone()
            if not row:
                print(f"Error: Session {args.session} not found", file=sys.stderr)
                sys.exit(1)
        else:
            # When inside opencode, filter by current directory
            if os.environ.get("OPENCODE") == "1":
                cwd = os.getcwd()
                row = conn.execute(QUERY_RECENT_SESSION_BY_DIR, (cwd,)).fetchone()
                if not row:
                    # Fallback to global recent session with data
                    row = conn.execute(QUERY_RECENT_SESSION).fetchone()
            else:
                row = conn.execute(QUERY_RECENT_SESSION).fetchone()
            if not row:
                print("Error: No sessions found", file=sys.stderr)
                sys.exit(1)

        # Get full tree
        tree_rows = conn.execute(QUERY_SESSION_TREE, (row["id"],)).fetchall()
        roots = build_tree(tree_rows)

        # Filter by agent if specified
        if args.agent:
            roots = _filter_by_agent(roots, args.agent)

        if args.json:
            print(json.dumps([r.to_dict() for r in roots], indent=2, default=str))
        else:
            console = Console()
            print_session(roots, console)

    finally:
        conn.close()


def _filter_by_agent(roots: list[SessionNode], agent: str) -> list[SessionNode]:
    """Filter session tree to only show nodes matching agent name."""
    agent_lower = agent.lower()

    def _filter(nodes: list[SessionNode]) -> list[SessionNode]:
        filtered = []
        for node in nodes:
            node.children = _filter(node.children)
            if agent_lower in node.agent.lower():
                filtered.append(node)
            elif node.children:
                filtered.append(node)
        return filtered

    return _filter(roots)


def _print_all_json(conn: Any) -> None:
    """Print global stats as JSON."""
    from .db import QUERY_ALL_STATS, QUERY_BY_AGENT

    stats_row = conn.execute(QUERY_ALL_STATS).fetchone()
    agent_rows = conn.execute(QUERY_BY_AGENT).fetchall()
    print(json.dumps({
        "summary": dict(stats_row),
        "by_agent": [dict(r) for r in agent_rows],
    }, indent=2, default=str))


def _print_last_n_json(conn: Any, n: int) -> None:
    """Print last N sessions as JSON."""
    from .db import QUERY_LAST_N

    rows = conn.execute(QUERY_LAST_N, (n,)).fetchall()
    print(json.dumps([dict(r) for r in rows], indent=2, default=str))


if __name__ == "__main__":
    main()
