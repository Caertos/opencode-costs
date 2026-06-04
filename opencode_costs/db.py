"""Database queries for OpenCode session costs."""

import sqlite3
from pathlib import Path

DB_PATH = Path.home() / ".local" / "share" / "opencode" / "opencode.db"

QUERY_RECENT_SESSION = """
SELECT id, parent_id, agent, model, cost,
       tokens_input, tokens_output, tokens_reasoning,
       tokens_cache_read, tokens_cache_write,
       time_created, time_updated, title
FROM session
WHERE parent_id IS NULL
ORDER BY time_updated DESC
LIMIT 1
"""

QUERY_RECENT_SESSION_BY_DIR = """
SELECT id, parent_id, agent, model, cost,
       tokens_input, tokens_output, tokens_reasoning,
       tokens_cache_read, tokens_cache_write,
       time_created, time_updated, title
FROM session
WHERE parent_id IS NULL AND directory = ?
ORDER BY time_updated DESC
LIMIT 1
"""

QUERY_SESSION_BY_ID = """
SELECT id, parent_id, agent, model, cost,
       tokens_input, tokens_output, tokens_reasoning,
       tokens_cache_read, tokens_cache_write,
       time_created, time_updated, title
FROM session
WHERE id = ?
"""

QUERY_SESSION_TREE = """
WITH RECURSIVE session_tree AS (
    SELECT id, parent_id, agent, model, cost,
           tokens_input, tokens_output, tokens_reasoning,
           tokens_cache_read, tokens_cache_write,
           time_created, time_updated, title, 0 as depth,
           id as root_id
    FROM session
    WHERE id = ?

    UNION ALL

    SELECT s.id, s.parent_id, s.agent, s.model, s.cost,
           s.tokens_input, s.tokens_output, s.tokens_reasoning,
           s.tokens_cache_read, s.tokens_cache_write,
           s.time_created, s.time_updated, s.title, st.depth + 1,
           st.root_id
    FROM session s
    JOIN session_tree st ON s.parent_id = st.id
)
SELECT * FROM session_tree
ORDER BY depth, cost DESC
"""

QUERY_LAST_N = """
SELECT id, parent_id, agent, model, cost,
       tokens_input, tokens_output, tokens_reasoning,
       tokens_cache_read, tokens_cache_write,
       time_created, time_updated, title
FROM session
WHERE parent_id IS NULL
ORDER BY time_updated DESC
LIMIT ?
"""

QUERY_ALL_STATS = """
SELECT
    COUNT(*) as total_sessions,
    SUM(CASE WHEN parent_id IS NULL THEN 1 ELSE 0 END) as root_sessions,
    SUM(CASE WHEN parent_id IS NOT NULL THEN 1 ELSE 0 END) as child_sessions,
    SUM(cost) as total_cost,
    SUM(tokens_input) as total_input,
    SUM(tokens_output) as total_output,
    SUM(tokens_reasoning) as total_reasoning,
    SUM(tokens_cache_read) as total_cache_read,
    SUM(tokens_cache_write) as total_cache_write,
    MIN(time_created) as first_session,
    MAX(time_updated) as last_session
FROM session
"""

QUERY_BY_AGENT = """
SELECT agent, COUNT(*) as sessions, SUM(cost) as total_cost,
       SUM(tokens_input) as total_input, SUM(tokens_output) as total_output,
       SUM(tokens_reasoning) as total_reasoning
FROM session
WHERE agent IS NOT NULL AND agent != ''
GROUP BY agent
ORDER BY total_cost DESC
"""


def get_db(db_path: Path | None = None) -> sqlite3.Connection:
    """Get a connection to the OpenCode database."""
    path = db_path or DB_PATH
    if not path.exists():
        raise FileNotFoundError(f"Database not found at {path}")
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    return conn
