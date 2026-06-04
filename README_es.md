# opencode-costs

[![PyPI version](https://img.shields.io/pypi/v/opencode-costs.svg)](https://pypi.org/project/opencode-costs/)
[![Downloads](https://img.shields.io/pypi/dm/opencode-costs.svg)](https://pypi.org/project/opencode-costs/)
[![License](https://img.shields.io/pypi/l/opencode-costs.svg)](https://github.com/Caertos/opencode-costs/blob/main/LICENSE)
[![Python](https://img.shields.io/pypi/pyversions/opencode-costs.svg)](https://pypi.org/project/opencode-costs/)

> **Read in [English](README.md)**

Reportador de costos para [OpenCode](https://opencode.ai) — desglose detallado por agente y sub-agente.

La TUI de OpenCode solo muestra el costo del agente principal. Esta herramienta muestra el ** panorama completo**: agente principal + todos los sub-agentes con sus costos, tokens y modelos individuales.

## ¿Por qué?

Cuando usas OpenCode con orquestadores SDD o tareas delegadas, el costo real está oculto. Una sesión puede mostrar $0.50 pero los sub-agentes en realidad gastaron $5.00. `opencode-costs` te muestra la verdad.

## Instalación

```bash
# Desde GitHub
pip install git+https://github.com/caertos/opencode-costs.git

# O clonar e instalar
git clone https://github.com/caertos/opencode-costs.git
cd opencode-costs
pip install .
```

## Uso dentro de OpenCode

**Este es el caso de uso principal.** Dentro de OpenCode, presiona `!` para ejecutar comandos de terminal:

```
!costs
```

Eso es todo. Verás el desglose completo de costos de la **sesión actual** incluyendo todos los sub-agentes.

> **Auto-detección**: Al ejecutar dentro de OpenCode, la herramienta detecta automáticamente tu sesión actual comparando el directorio de trabajo. No necesitas pasar IDs de sesión manualmente.

### Referencia rápida

| Comando | Qué hace |
|---------|----------|
| `!costs` | Desglose de costos de la sesión actual |
| `!costs --all` | Estadísticas globales de todas las sesiones |
| `!costs --last 5` | Resumen de las últimas 5 sesiones |
| `!costs --session ID` | Sesión específica por ID |
| `!costs --agent sdd-apply` | Filtrar por nombre de agente |
| `!costs --json` | Salida JSON para procesamiento |

## Uso fuera de OpenCode

Desde un terminal normal:

```bash
# Sesión más reciente
costs

# Últimas 10 sesiones
costs --last 10

# Estadísticas globales
costs --all

# JSON para procesamiento adicional
costs --json | jq '.summary.total_cost'
```

## Ejemplo de salida

```
╭──────────────────────────────────────────────────────────────────────╮
│ COST REPORT  ses_abc123  Mi título de sesión                        │
╰──────────────────────────────────────────────────────────────────────╯
╭─────────────────────────────── RESUMEN TOTAL ────────────────────────╮
│   Cost Total         $2.52                                           │
│   Tokens Input      574.9K                                           │
│   Tokens Output      16.2K                                           │
│   Reasoning           6.1K                                           │
│   Duración         31m 38s                                           │
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

## Cómo funciona

Lee directamente la base de datos SQLite de OpenCode en `~/.local/share/opencode/opencode.db`. No necesita claves API, servicios externos ni rastreo.

## Requisitos

- Python 3.10+
- `rich` (se instala automáticamente)

## Licencia

MIT
