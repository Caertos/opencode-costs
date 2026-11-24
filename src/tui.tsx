// @ts-nocheck
/** @jsxImportSource @opentui/solid */
/**
 * opencode-costs-tui — sidebar cost panel for OpenCode 2.x.
 *
 * Shows the active session and every subagent below it (recursively) with a
 * per-agent breakdown: cost, share of the family total, sessions and aggregate
 * tokens. All numbers come from OpenCode's own session store, so there is no
 * database access and no external process.
 *
 * The header is clickable and collapses the table; the state is kept in the
 * plugin's durable store. Data refreshes on every session event the host
 * pushes, plus a 30 s safety sync.
 */
import { Plugin } from "@opencode/plugin/tui";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { buildFamily, formatCost, formatTokens, summarize } from "./report.ts";

const id = "opencode-costs-tui";
const REFRESH_MS = 30_000;

/** Theme tokens moved between releases; only strings and RGBA objects are colors. */
function color(candidate: any): any {
  if (candidate == null) return undefined;
  if (typeof candidate === "string") return candidate;
  if (typeof candidate === "object" && "r" in candidate) return candidate;
  return undefined;
}

function palette(theme: any) {
  return {
    text: color(theme?.text?.base) ?? color(theme?.text),
    muted: color(theme?.text?.muted),
    success: color(theme?.increase) ?? color(theme?.diff?.added?.fg) ?? color(theme?.text?.base),
    border: color(theme?.border?.subtle) ?? color(theme?.border?.base),
  };
}

function AgentLine(props: { row: any; total: number; theme: any }) {
  const colors = () => palette(props.theme);
  const label = () => {
    const indent = "  ".repeat(Math.min(props.row.depth ?? 0, 2));
    const raw = props.row.agent || "unknown";
    const name = raw.length > 17 ? `${raw.slice(0, 16)}…` : raw;
    return `${indent}${name}`.padEnd(20);
  };
  const percent = () => (props.total > 0 ? `${Math.round((props.row.cost / props.total) * 100)}%` : "0%");

  return (
    <box flexDirection="row">
      <text fg={colors().text}>{label()}</text>
      <text fg={colors().success}>{formatCost(props.row.cost).padStart(8)}</text>
      <text fg={colors().muted}>{percent().padStart(5)}</text>
    </box>
  );
}

function CostsPanel(props: { context: any; sessionID: string; expanded: boolean; onToggle: () => void }) {
  const [revision, setRevision] = createSignal(0);

  const family = createMemo(() => {
    revision();
    const sessions = props.context.data.session.list?.() ?? [];
    const rootID = props.context.data.session.root?.(props.sessionID) ?? props.sessionID;
    const nodes = buildFamily(sessions, props.sessionID, rootID);
    if (nodes.length > 0) return nodes;
    const single = props.context.data.session.get?.(props.sessionID);
    return single ? [{ ...single, depth: 0 }] : [];
  });
  const summary = createMemo(() => summarize(family()));
  const colors = createMemo(() => palette(props.context.theme));

  async function refresh() {
    const sync = props.context.data.session.sync;
    const rootID = props.context.data.session.root?.(props.sessionID) ?? props.sessionID;
    if (typeof sync === "function") {
      try {
        await sync.call(props.context.data.session, rootID);
      } catch {
        // a failed refresh must never break the sidebar
      }
    }
    setRevision((value) => value + 1);
  }

  onMount(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    const stop = props.context.data.on?.("session.updated", () => setRevision((value) => value + 1));
    onCleanup(() => {
      clearInterval(timer);
      if (stop) stop();
    });
  });

  const header = () => {
    if (summary().sessions === 0) return "Costs · …";
    return `Costs · ${formatCost(summary().total)}`;
  };

  return (
    <box flexDirection="column" marginBottom={1}>
      <box flexDirection="row" justifyContent="space-between" onMouseDown={() => props.onToggle()}>
        <text fg={colors().text}>{header()}</text>
        <text fg={colors().muted}>{props.expanded ? "▾" : "▸"}</text>
      </box>
      <Show when={props.expanded}>
        <Show when={summary().sessions > 0} fallback={<text fg={colors().muted}>loading…</text>}>
          <For each={summary().rows}>
            {(row) => <AgentLine row={row} total={summary().total} theme={props.context.theme} />}
          </For>
          <text fg={colors().border}>{"─".repeat(24)}</text>
          <text fg={colors().muted}>{`${summary().sessions} sessions`}</text>
          <text fg={colors().muted}>
            {`In ${formatTokens(summary().tokens.input)} · Out ${formatTokens(
              summary().tokens.output,
            )} · Rsn ${formatTokens(summary().tokens.reasoning)}`}
          </text>
        </Show>
      </Show>
    </box>
  );
}

export default Plugin.define({
  id,
  setup(context: any) {
    const [settings, updateSettings] = context.storage.store("panel", { initial: { expanded: true } });

    const toggle = () => {
      void updateSettings((draft: any) => {
        draft.expanded = !draft.expanded;
      });
    };

    const unregister = context.ui.slot({
      prepend: "sidebar.content",
      render: ({ sessionID }: { sessionID: string }) => (
        <Show when={sessionID}>
          <CostsPanel
            context={context}
            sessionID={sessionID}
            expanded={settings.expanded}
            onToggle={toggle}
          />
        </Show>
      ),
    });

    return () => {
      unregister();
    };
  },
});
