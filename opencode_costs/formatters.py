"""Rich terminal output formatters."""

import json
import sqlite3
from typing import Any

from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from .models import (
    SessionNode,
    flatten_tree,
    format_cost,
    format_timestamp,
    format_tokens,
    duration_str,
    parse_model,
)


def print_session(roots: list[SessionNode], console: Console) -> None:
    """Print session cost breakdown with rich formatting."""
    all_nodes = flatten_tree(roots)
    if not all_nodes:
        console.print("[yellow]No session data found.[/yellow]")
        return

    root = roots[0]

    # Header
    header = Text()
    header.append("COST REPORT", style="bold cyan")
    header.append(f"  {root.id}", style="dim")
    if root.title:
        header.append(f"  {root.title}", style="italic")
    console.print(Panel(header, border_style="cyan"))

    # Summary totals
    total_cost = root.aggregate_cost()
    total_tokens = root.aggregate_tokens()

    summary = Table(show_header=False, box=None, padding=(0, 2))
    summary.add_column("Label", style="bold")
    summary.add_column("Value", justify="right")
    summary.add_row("Cost Total", Text(format_cost(total_cost), style="bold green"))
    summary.add_row("Tokens Input", format_tokens(total_tokens["input"]))
    summary.add_row("Tokens Output", format_tokens(total_tokens["output"]))
    summary.add_row("Reasoning", format_tokens(total_tokens["reasoning"]))
    summary.add_row("Cache Read", format_tokens(total_tokens["cache_read"]))
    summary.add_row("Cache Write", format_tokens(total_tokens["cache_write"]))
    summary.add_row("Duration", duration_str(root.time_created, root.time_updated))
    summary.add_row("Messages", str(len(all_nodes)))

    console.print(Panel(summary, title="[bold]RESUMEN TOTAL[/bold]", border_style="green"))

    # Agent breakdown table
    table = Table(
        title="DESGLOSE POR AGENTE",
        box=box.ROUNDED,
        show_lines=True,
        title_style="bold magenta",
    )
    table.add_column("Agente", style="cyan", min_width=25)
    table.add_column("Sesiones", justify="center", width=8)
    table.add_column("Costo", justify="right", style="green", width=12)
    table.add_column("%", justify="right", width=6)
    table.add_column("Tokens In", justify="right", width=10)
    table.add_column("Tokens Out", justify="right", width=10)
    table.add_column("Modelo", style="dim", min_width=15)

    # Group by agent
    agent_stats: dict[str, dict] = {}
    for node in all_nodes:
        key = node.agent
        if key not in agent_stats:
            agent_stats[key] = {
                "sessions": 0,
                "cost": 0.0,
                "tokens_in": 0,
                "tokens_out": 0,
                "model": node.model_name,
                "provider": node.provider_name,
                "depth": node.depth,
            }
        agent_stats[key]["sessions"] += 1
        agent_stats[key]["cost"] += node.cost
        agent_stats[key]["tokens_in"] += node.tokens_input
        agent_stats[key]["tokens_out"] += node.tokens_output

    # Sort by cost descending
    sorted_agents = sorted(agent_stats.items(), key=lambda x: x[1]["cost"], reverse=True)

    for agent_name, stats in sorted_agents:
        pct = (stats["cost"] / total_cost * 100) if total_cost > 0 else 0
        indent = "  " * stats["depth"]
        table.add_row(
            f"{indent}{agent_name}",
            str(stats["sessions"]),
            format_cost(stats["cost"]),
            f"{pct:.1f}%",
            format_tokens(stats["tokens_in"]),
            format_tokens(stats["tokens_out"]),
            stats["model"],
        )

    # Total row
    table.add_row(
        Text("TOTAL", style="bold"),
        str(len(all_nodes)),
        Text(format_cost(total_cost), style="bold green"),
        "100%",
        format_tokens(total_tokens["input"]),
        format_tokens(total_tokens["output"]),
        "",
        end_section=True,
    )

    console.print(table)

    # Footer
    console.print(
        f"\n[dim]Iniciada: {format_timestamp(root.time_created)} | "
        f"Modelo principal: {root.model_name} ({root.provider_name})[/dim]"
    )


def print_all_stats(console: Console, conn: sqlite3.Connection) -> None:
    """Print global statistics."""
    row = conn.execute(
        "SELECT COUNT(*) as total_sessions,"
        "SUM(CASE WHEN parent_id IS NULL THEN 1 ELSE 0 END) as root_sessions,"
        "SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END) as child_sessions,"
        "SUM(cost) as total_cost,"
        "SUM(tokens_input) as total_input,"
        "SUM(tokens_output) as total_output,"
        "SUM(tokens_reasoning) as total_reasoning,"
        "SUM(tokens_cache_read) as total_cache_read,"
        "SUM(tokens_cache_write) as total_cache_write,"
        "MIN(time_created) as first_session,"
        "MAX(time_updated) as last_session"
        " FROM session"
    ).fetchone()

    agent_rows = conn.execute(
        "SELECT agent, COUNT(*) as sessions, SUM(cost) as total_cost,"
        "SUM(tokens_input) as total_input, SUM(tokens_output) as total_output,"
        "SUM(tokens_reasoning) as total_reasoning"
        " FROM session WHERE agent IS NOT NULL AND agent != ''"
        " GROUP BY agent ORDER BY total_cost DESC"
    ).fetchall()

    console.print(Panel("[bold cyan]OPENCODE — ESTADISTICAS GLOBALES[/bold cyan]", border_style="cyan"))

    summary = Table(show_header=False, box=None, padding=(0, 2))
    summary.add_column("Label", style="bold")
    summary.add_column("Value", justify="right")
    summary.add_row("Costo Total", Text(format_cost(row["total_cost"]), style="bold green"))
    summary.add_row("Sesiones Totales", str(row["total_sessions"]))
    summary.add_row("  Raiz", str(row["root_sessions"]))
    summary.add_row("  Sub-agentes", str(row["child_sessions"]))
    summary.add_row("Tokens Input", format_tokens(row["total_input"]))
    summary.add_row("Tokens Output", format_tokens(row["total_output"]))
    summary.add_row("Reasoning", format_tokens(row["total_reasoning"]))
    summary.add_row("Cache Read", format_tokens(row["total_cache_read"]))
    summary.add_row("Cache Write", format_tokens(row["total_cache_write"]))
    if row["first_session"] and row["last_session"]:
        summary.add_row("Primera sesion", format_timestamp(row["first_session"]))
        summary.add_row("Ultima sesion", format_timestamp(row["last_session"]))

    console.print(Panel(summary, title="[bold]RESUMEN[/bold]", border_style="green"))

    # Agent table
    table = Table(
        title="COSTO POR AGENTE",
        box=box.ROUNDED,
        show_lines=True,
        title_style="bold magenta",
    )
    table.add_column("Agente", style="cyan", min_width=25)
    table.add_column("Sesiones", justify="center", width=8)
    table.add_column("Costo", justify="right", style="green", width=12)
    table.add_column("%", justify="right", width=6)
    table.add_column("Tokens In", justify="right", width=10)
    table.add_column("Tokens Out", justify="right", width=10)

    total = row["total_cost"] or 0
    for r in agent_rows:
        cost = r["total_cost"] or 0
        pct = (cost / total * 100) if total > 0 else 0
        table.add_row(
            r["agent"],
            str(r["sessions"]),
            format_cost(cost),
            f"{pct:.1f}%",
            format_tokens(r["total_input"]),
            format_tokens(r["total_output"]),
        )

    console.print(table)


def print_last_n(console: Console, conn: sqlite3.Connection, n: int) -> None:
    """Print summary for last N sessions."""
    rows = conn.execute(
        "SELECT id, parent_id, agent, model, cost,"
        "tokens_input, tokens_output, tokens_reasoning,"
        "tokens_cache_read, tokens_cache_write,"
        "time_created, time_updated, title"
        " FROM session WHERE parent_id IS NULL"
        " ORDER BY time_updated DESC LIMIT ?",
        (n,),
    ).fetchall()

    console.print(Panel(f"[bold cyan]ULTIMAS {n} SESIONES[/bold cyan]", border_style="cyan"))

    table = Table(box=box.ROUNDED, show_lines=True)
    table.add_column("ID", style="dim", max_width=20)
    table.add_column("Agente", style="cyan", min_width=20)
    table.add_column("Costo", justify="right", style="green", width=10)
    table.add_column("Tokens In", justify="right", width=10)
    table.add_column("Tokens Out", justify="right", width=10)
    table.add_column("Modelo", style="dim", min_width=15)
    table.add_column("Fecha", width=16)

    total_cost = 0
    for r in rows:
        cost = r["cost"] or 0
        total_cost += cost
        model = parse_model(r["model"])
        table.add_row(
            r["id"][:20],
            r["agent"] or "N/A",
            format_cost(cost),
            format_tokens(r["tokens_input"]),
            format_tokens(r["tokens_output"]),
            model.get("id", "?"),
            format_timestamp(r["time_updated"]),
        )

    table.add_section()
    table.add_row("", Text("TOTAL", style="bold"), Text(format_cost(total_cost), style="bold green"), "", "", "", "")

    console.print(table)
