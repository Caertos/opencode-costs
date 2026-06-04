"""Data models for OpenCode sessions."""

import json
import sqlite3
from datetime import datetime, timezone
from typing import Any


def parse_model(model_str: str | None) -> dict:
    """Parse the JSON model string."""
    if not model_str:
        return {"id": "unknown", "providerID": "unknown"}
    try:
        return json.loads(model_str)
    except (json.JSONDecodeError, TypeError):
        return {"id": model_str, "providerID": "unknown"}


def format_tokens(n: int | None) -> str:
    """Format token count with K/M suffix."""
    if n is None or n == 0:
        return "0"
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def format_cost(c: float | None) -> str:
    """Format cost in USD."""
    if c is None or c == 0:
        return "$0.00"
    if c < 0.01:
        return f"${c:.4f}"
    return f"${c:.2f}"


def format_timestamp(ts: int | None) -> str:
    """Format Unix timestamp (ms) to readable date."""
    if ts is None:
        return "N/A"
    dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M")


def duration_str(start_ms: int | None, end_ms: int | None) -> str:
    """Calculate duration between two timestamps."""
    if not start_ms or not end_ms:
        return "N/A"
    secs = (end_ms - start_ms) / 1000
    if secs < 60:
        return f"{secs:.0f}s"
    mins = secs / 60
    if mins < 60:
        return f"{mins:.0f}m {secs % 60:.0f}s"
    hours = mins / 60
    return f"{hours:.0f}h {mins % 60:.0f}m"


class SessionNode:
    """A session with its children (sub-agents)."""

    def __init__(self, row: sqlite3.Row):
        self.id = row["id"]
        self.parent_id = row["parent_id"]
        self.agent = row["agent"] or "unknown"
        self.model = parse_model(row["model"])
        self.cost = row["cost"] or 0.0
        self.tokens_input = row["tokens_input"] or 0
        self.tokens_output = row["tokens_output"] or 0
        self.tokens_reasoning = row["tokens_reasoning"] or 0
        self.tokens_cache_read = row["tokens_cache_read"] or 0
        self.tokens_cache_write = row["tokens_cache_write"] or 0
        self.time_created = row["time_created"]
        self.time_updated = row["time_updated"]
        self.title = row["title"]
        self.depth = row["depth"] if "depth" in row.keys() else 0
        self.children: list["SessionNode"] = []

    @property
    def total_tokens(self) -> int:
        return self.tokens_input + self.tokens_output + self.tokens_reasoning

    @property
    def model_name(self) -> str:
        return self.model.get("id", "unknown")

    @property
    def provider_name(self) -> str:
        return self.model.get("providerID", "unknown")

    def aggregate_cost(self) -> float:
        """Total cost including all children recursively."""
        return self.cost + sum(c.aggregate_cost() for c in self.children)

    def aggregate_tokens(self) -> dict:
        """Total tokens including all children recursively."""
        result = {
            "input": self.tokens_input,
            "output": self.tokens_output,
            "reasoning": self.tokens_reasoning,
            "cache_read": self.tokens_cache_read,
            "cache_write": self.tokens_cache_write,
        }
        for child in self.children:
            child_tokens = child.aggregate_tokens()
            for key in result:
                result[key] += child_tokens[key]
        return result

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return {
            "id": self.id,
            "agent": self.agent,
            "model": self.model,
            "cost": self.cost,
            "tokens": {
                "input": self.tokens_input,
                "output": self.tokens_output,
                "reasoning": self.tokens_reasoning,
                "cache_read": self.tokens_cache_read,
                "cache_write": self.tokens_cache_write,
            },
            "duration_ms": (self.time_updated - self.time_created) if self.time_created and self.time_updated else None,
            "time_created": self.time_created,
            "time_updated": self.time_updated,
            "title": self.title,
            "depth": self.depth,
            "aggregate_cost": self.aggregate_cost(),
            "aggregate_tokens": self.aggregate_tokens(),
            "children": [c.to_dict() for c in self.children],
        }


def build_tree(rows: list[sqlite3.Row]) -> list[SessionNode]:
    """Build a tree of SessionNode from flat query results."""
    nodes = {row["id"]: SessionNode(row) for row in rows}
    roots = []
    for node in nodes.values():
        if node.parent_id and node.parent_id in nodes:
            nodes[node.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


def flatten_tree(nodes: list[SessionNode]) -> list[SessionNode]:
    """Flatten tree into a list preserving depth order."""
    result = []
    for node in nodes:
        result.append(node)
        result.extend(flatten_tree(node.children))
    return result
