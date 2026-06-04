# opencode-costs

[![PyPI version](https://img.shields.io/pypi/v/opencode-costs.svg)](https://pypi.org/project/opencode-costs/)
[![Downloads](https://img.shields.io/pypi/dm/opencode-costs.svg)](https://pypi.org/project/opencode-costs/)
[![License](https://img.shields.io/pypi/l/opencode-costs.svg)](https://github.com/Caertos/opencode-costs/blob/main/LICENSE)
[![Python](https://img.shields.io/pypi/pyversions/opencode-costs.svg)](https://pypi.org/project/opencode-costs/)

> **Leer en [español](README_es.md)**

Cost reporter for [OpenCode](https://opencode.ai) — detailed cost breakdown per agent and sub-agent.

OpenCode's TUI only shows the main agent's cost. This tool reveals the **full picture**: main agent + all sub-agents with their individual costs, tokens, and models.

## Why?

When you use OpenCode with SDD orchestrators or delegated tasks, the real cost is hidden. A session might show $0.50 but the sub-agents actually spent $5.00. `opencode-costs` shows you the truth.

## Installation

```bash
# From GitHub
pip install git+https://github.com/caertos/opencode-costs.git

# Or clone and install
git clone https://github.com/caertos/opencode-costs.git
cd opencode-costs
pip install .
```

## Usage inside OpenCode

**This is the primary use case.** Inside OpenCode, press `!` to run terminal commands:

```
!costs
```

That's it. You'll see the full cost breakdown of the current session including all sub-agents.

### Quick reference

| Command | What it does |
|---------|-------------|
| `!costs` | Cost breakdown of the current session |
| `!costs --all` | Global statistics across all sessions |
| `!costs --last 5` | Last 5 sessions summary |
| `!costs --session ID` | Specific session by ID |
| `!costs --agent sdd-apply` | Filter by agent name |
| `!costs --json` | JSON output for piping |

### Separate terminal window

If the output gets truncated in OpenCode's terminal, open it in a separate window:

```
!costs --window
```

This opens a new terminal window with the full, untruncated report. You can also use the shortcut:

```
!costs-window
```

## Usage outside OpenCode

From a regular terminal:

```bash
# Most recent session
costs

# Last 10 sessions
costs --last 10

# Global stats
costs --all

# JSON for further processing
costs --json | jq '.summary.total_cost'

# Open in separate window
costs --window
```

## Example output

```
╭──────────────────────────────────────────────────────────────────────╮
│ COST REPORT  ses_abc123  My session title                           │
╰──────────────────────────────────────────────────────────────────────╯
╭─────────────────────────────── RESUMEN TOTAL ────────────────────────╮
│   Cost Total         $2.52                                           │
│   Tokens Input      574.9K                                           │
│   Tokens Output      16.2K                                           │
│   Reasoning           6.1K                                           │
│   Duration         31m 38s                                           │
╰──────────────────────────────────────────────────────────────────────╯
                                        DESGLOSE POR AGENTE
╭───────────────────────────┬──────────┬──────────────┬────────╮
│ Agente                    │ Sesiones │        Costo │      % │
├───────────────────────────┼──────────┼──────────────┼────────┤
│ sdd-orchestrator-copilot  │    1     │        $0.98 │  38.8% │
│   sdd-explore-copilot     │    2     │        $1.00 │  39.6% │
│   sdd-apply-copilot       │    1     │        $0.54 │  21.6% │
├───────────────────────────┼──────────┼──────────────┼────────┤
│ TOTAL                     │    4     │        $2.52 │  100%  │
╰───────────────────────────┴──────────┴──────────────┴────────╯
```

## How it works

Reads directly from OpenCode's SQLite database at `~/.local/share/opencode/opencode.db`. No API keys, no external services, no tracking.

## Requirements

- Python 3.10+
- `rich` (installed automatically)

## License

MIT
