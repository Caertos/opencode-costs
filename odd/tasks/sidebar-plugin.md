# opencode-costs 2.0 — sidebar TUI plugin (npm only)

Objective: replace the 1.x CLI with a collapsible, self-refreshing sidebar panel that shows the active session and its subagents, shipped as a single npm package.
Delivery: `main`, tag `v2.0.0` publishes to npm · Tests: `npm test` (`node --test`)

## Specs

- **S1 — Panel content.** The panel MUST show the active session plus every descendant session with a per-agent breakdown: agent, share of the family total, cost, and an indent that mirrors depth. The header MUST show the family total cost; the footer MUST show session count and aggregate input/output/reasoning tokens.
- **S2 — Data source.** All numbers MUST come from OpenCode's session store (`context.data.session.list/get/root/sync`); the panel MUST build the tree from `parentID` and MUST NOT open the SQLite database or spawn a process.
- **S3 — Collapse and refresh.** The header MUST toggle between `▾` and `▸` on click, MUST persist the state in `context.storage.store`, and the panel MUST refresh on `session.updated` plus a 30 s safety sync.
- **S4 — Distribution.** The plugin MUST be published as the npm package `opencode-costs-tui` and installed with `opencode plugin add opencode-costs-tui`. Local `.tsx` files, `tui.json` entries and `plugins/` files MUST NOT be part of the install path.
- **S5 — Retired surface.** The Python engine, the `costs` CLI, `pyproject.toml` and the PyPI workflow MUST be removed; `install.sh` MUST install through the npm plugin registry.
- **S6 — CI.** On a `v*` tag the workflow MUST verify the tag matches `package.json`, run the tests and publish with provenance; it MUST NOT publish to PyPI.
- **S7 — Docs.** `README.md` and `README_es.md` MUST explain the rewrite, the installation, and include a real sidebar screenshot under `docs/images/`.
- **S8 — Degradation.** A missing session, theme token or failed sync MUST degrade to `loading…` or muted text and MUST NOT break the sidebar. Only strings and RGBA objects may be passed as colors.

## Tasks

| ID | Specs | Route | Status | Evidence |
| --- | --- | --- | --- | --- |
| T1 | S1, S2, S8 | inline | done | `src/report.ts`, `src/tui.tsx`, 7 node tests |
| T2 | S3 | inline | done | panel toggle + `storage.store`; verified live |
| T3 | S4, S5 | inline | done | `package.json`, `install.sh`, `cli.json` registration |
| T4 | S6 | inline | done | `.github/workflows/publish.yml` |
| T5 | S7 | inline | done | `README.md`, `README_es.md`, `docs/images/sidebar.png` |

## Log

**L1 (user, verbatim)** — "actualmente opencode-costs no está funcionando con opencode 2.0, quiero que funcione pero sin dejar de lado la version 1... si hago un !costs solo lee la sesion activa sin los subagentes de esa sesion como antes hacía... veamos las causas y las posibles soluciones"

**L2 (user, verbatim)** — "Y si lo hacemos distinto? con una tabla desplegable donde se vaya actualizando cada cierto tiempo? que vaya en el sidebar?"

**L3 (user, verbatim)** — "termina los diagnosticos y actualicemos para V1 y V2 a el plugin sidebar, lo que hará cambiar totalmente el proyecto, pero creo que lo mejor es mantenerlo en python por temas de despliegue y descarga no? y borrar los comandos de la CLI, que funcione totalmente como plugin, explicar todo el cambio en los readme"

**L4 (user, verbatim)** — "habria que actualizar entonces el github actions, tumbar la publicacion en pip y hacer un nuevo flujo de despliegue no?"

**L5 (user, verbatim)** — "al terminar y actualizr los readme, incluye capturas de pantalla del sidebar"

**Diagnosis.** The 1.x CLI read `session`/`message`/`part`; OpenCode 2.x writes to `session_v2`/`session_message`. The legacy tables stopped receiving rows on 2026-11-05, so `!costs` fell back to the newest legacy session. `session_v2` keeps `parent_id`, `cost` and `tokens_*` consistent with its messages, so the data was never lost.

**Loading experiments (evidence).** On OpenCode 2.4.0: a `.tsx` in `tui.json` is ignored; a file in `~/.config/opencode/plugins/` is loaded as a *server* plugin and fails the `{id, effect|setup}` schema; absolute paths and `file://` in `cli.json` never reach `prepare`; a `git+file://` package loads but the **legacy** `{id, tui}` export never reaches `setup`; the **V2** `Plugin.define({ id, setup })` export does reach `setup` and renders in `sidebar.content`. Decision: npm package + V2 API only (user choice, L4).

**Runtime findings.** `context.theme` is `{ text: { base, muted, ... }, border: { base }, diff: {...} }`; passing the `border` object as `fg` made the whole panel render blank. `palette()` now accepts only strings or RGBA objects. The panel was captured live in a standalone TUI on session `ses_ee2cab301ffe48raKnam4QdqHY` (14 sessions, $0.867).

**Pending.** First `npm publish` (tag `v2.0.0`) and `NPM_TOKEN` secret; until then the panel cannot be installed from the registry.
