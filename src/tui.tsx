// @ts-nocheck
/** @jsxImportSource @opentui/solid */
/**
 * opencode-costs-tui — sidebar cost panel for OpenCode 2.x.
 *
 * Shows the active session and every subagent below it (recursively), one row
 * per session so finished subagents stay visible. All numbers come from
 * OpenCode's own session store, so there is no database access and no external
 * process.
 *
 * When the family reports no money (unpriced or free models), the value column
 * switches to tokens instead of showing a column of $0.00.
 *
 * The header is clickable and collapses the panel; the state is kept in the
 * plugin's durable store. Data refreshes on every session event the host
 * pushes, plus a 30 s safety sync.
 */
import { Plugin } from "@opencode/plugin/tui";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { buildFamily, formatTokens, formatValue, summarize } from "./report.ts";

const id = "opencode-costs-tui";
const REFRESH_MS = 10_000;

/** Every host event that can change tokens, cost or the session tree. */
const EVENTS = [
  "session.created",
  "session.deleted",
  "session.idle",
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.message.content.updated",
  "session.metadata.updated",
];

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

function SessionLine(props: { row: any; metric: "cost" | "tokens"; theme: any }) {
  const colors = () => palette(props.theme);
  const label = () => `${"  ".repeat(Math.min(props.row.depth ?? 0, 2))}${props.row.label ?? ""}`.slice(0, 20).padEnd(20);
  const percent = () => `${Math.round(props.row.percent ?? 0)}%`;

  return (
    <box flexDirection="row">
      <text fg={colors().text}>{label()}</text>
      <text fg={colors().success}>{formatValue(props.row.value, props.metric).padStart(8)}</text>
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

  // Repaint first, then ask the host to refresh data in the background:
  // awaiting session.sync() can hang on an idle session and would freeze the panel.
  function refresh() {
    setRevision((value) => value + 1);
    const sync = props.context.data.session.sync;
    if (typeof sync !== "function") return;
    for (const node of family().slice(0, 20)) {
      try {
        void Promise.resolve(sync.call(props.context.data.session, node.id)).catch(() => {});
      } catch {
        // a failed sync must never break the sidebar
      }
    }
  }

  onMount(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const unsubscribers = EVENTS.map((type) => {
      try {
        return props.context.data.on?.(type, () => setRevision((value) => value + 1));
      } catch {
        return undefined;
      }
    }).filter(Boolean);
    onCleanup(() => {
      clearInterval(timer);
      for (const stop of unsubscribers) stop?.();
    });
  });

  const header = () => {
    if (summary().sessions === 0) return "Costs · …";
    if (summary().metric === "tokens") return `Costs · ${formatTokens(summary().total)} tok`;
    return `Costs · ${formatValue(summary().total, "cost")}`;
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
            {(row) => <SessionLine row={row} metric={summary().metric} theme={props.context.theme} />}
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
