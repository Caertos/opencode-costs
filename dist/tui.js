// src/tui.tsx
import { Plugin } from "@opencode/plugin/tui";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";

// src/report.ts
var LABEL_MAX = 20;
function zeroTokens() {
  return { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 };
}
function sessionTokens(session) {
  const tokens = session?.tokens ?? {};
  const cache = tokens.cache ?? {};
  return {
    input: Number(tokens.input) || 0,
    output: Number(tokens.output) || 0,
    reasoning: Number(tokens.reasoning) || 0,
    cache_read: Number(cache.read) || 0,
    cache_write: Number(cache.write) || 0
  };
}
function addTokens(target, source) {
  target.input += source.input;
  target.output += source.output;
  target.reasoning += source.reasoning;
  target.cache_read += source.cache_read;
  target.cache_write += source.cache_write;
}
function tokenTotal(tokens) {
  return tokens.input + tokens.output + tokens.reasoning;
}
function formatCost(value) {
  const amount = Number(value) || 0;
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
function formatTokens(value) {
  const count = Number(value) || 0;
  if (count >= 1e6) return `${(count / 1e6).toFixed(1)}M`;
  if (count >= 1e3) return `${(count / 1e3).toFixed(count >= 1e4 ? 0 : 1)}K`;
  return String(count);
}
function formatValue(value, metric) {
  return metric === "cost" ? formatCost(value) : formatTokens(value);
}
function buildFamily(sessions, sessionID, rootID, limit = 60) {
  const byId = /* @__PURE__ */ new Map();
  const children = /* @__PURE__ */ new Map();
  for (const session of sessions) {
    byId.set(session.id, session);
    const parent = session.parentID;
    if (!parent) continue;
    const list = children.get(parent) ?? [];
    list.push(session);
    children.set(parent, list);
  }
  const startID = rootID && byId.has(rootID) ? rootID : sessionID;
  const start = byId.get(startID);
  if (!start) return [];
  const nodes = [];
  const queue = [{ node: start, depth: 0 }];
  const seen = /* @__PURE__ */ new Set([start.id]);
  while (queue.length > 0 && nodes.length < limit) {
    const { node, depth } = queue.shift();
    nodes.push({ ...node, depth });
    const kids = (children.get(node.id) ?? []).slice().sort((a, b) => (a.time?.created ?? 0) - (b.time?.created ?? 0));
    for (const kid of kids) {
      if (seen.has(kid.id)) continue;
      seen.add(kid.id);
      queue.push({ node: kid, depth: depth + 1 });
    }
  }
  return nodes;
}
function label(node, depth) {
  const raw = depth === 0 ? node.agent || "session" : node.title || node.agent || "session";
  return raw.length > LABEL_MAX ? `${raw.slice(0, LABEL_MAX - 1)}\u2026` : raw;
}
function summarize(nodes) {
  const tokens = zeroTokens();
  const perNode = nodes.map((node) => ({ node, tokens: sessionTokens(node), cost: Number(node.cost) || 0 }));
  for (const entry of perNode) {
    addTokens(tokens, entry.tokens);
  }
  const totalCost = perNode.reduce((sum, entry) => sum + entry.cost, 0);
  const metric = totalCost > 0 ? "cost" : "tokens";
  const total = metric === "cost" ? totalCost : tokenTotal(tokens);
  const rows = perNode.map((entry) => {
    const value = metric === "cost" ? entry.cost : tokenTotal(entry.tokens);
    return {
      id: entry.node.id,
      label: label(entry.node, entry.node.depth ?? 0),
      agent: entry.node.agent || "unknown",
      depth: entry.node.depth ?? 0,
      cost: entry.cost,
      tokens: entry.tokens,
      value,
      percent: total > 0 ? value / total * 100 : 0
    };
  });
  rows.sort((a, b) => a.depth - b.depth || b.value - a.value);
  return { rows, metric, total, totalCost, tokens, sessions: nodes.length };
}

// src/tui.tsx
import { jsx, jsxs } from "@opentui/solid/jsx-runtime";
var id = "opencode-costs-tui";
var REFRESH_MS = 1e4;
var EVENTS = [
  "session.created",
  "session.deleted",
  "session.idle",
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.message.content.updated",
  "session.metadata.updated"
];
function color(candidate) {
  if (candidate == null) return void 0;
  if (typeof candidate === "string") return candidate;
  if (typeof candidate === "object" && "r" in candidate) return candidate;
  return void 0;
}
function palette(theme) {
  return {
    text: color(theme?.text?.base) ?? color(theme?.text),
    muted: color(theme?.text?.muted),
    success: color(theme?.increase) ?? color(theme?.diff?.added?.fg) ?? color(theme?.text?.base),
    border: color(theme?.border?.subtle) ?? color(theme?.border?.base)
  };
}
function SessionLine(props) {
  const colors = () => palette(props.theme);
  const label2 = () => `${"  ".repeat(Math.min(props.row.depth ?? 0, 2))}${props.row.label ?? ""}`.slice(0, 20).padEnd(20);
  const percent = () => `${Math.round(props.row.percent ?? 0)}%`;
  return /* @__PURE__ */ jsxs("box", { flexDirection: "row", children: [
    /* @__PURE__ */ jsx("text", { fg: colors().text, children: label2() }),
    /* @__PURE__ */ jsx("text", { fg: colors().success, children: formatValue(props.row.value, props.metric).padStart(8) }),
    /* @__PURE__ */ jsx("text", { fg: colors().muted, children: percent().padStart(5) })
  ] });
}
function CostsPanel(props) {
  const [revision, setRevision] = createSignal(0);
  const [fetched, setFetched] = createSignal(void 0);
  const family = createMemo(() => {
    revision();
    const sessions = fetched() ?? props.context.data.session.list?.() ?? [];
    const rootID = props.context.data.session.root?.(props.sessionID) ?? props.sessionID;
    const nodes = buildFamily(sessions, props.sessionID, rootID);
    if (nodes.length > 0) return nodes;
    const single = props.context.data.session.get?.(props.sessionID);
    return single ? [{ ...single, depth: 0 }] : [];
  });
  const summary = createMemo(() => summarize(family()));
  const colors = createMemo(() => palette(props.context.theme));
  async function load() {
    const client = props.context.client;
    if (!client?.session?.list) return;
    const active = props.context.data.session.get?.(props.sessionID);
    const directory = active?.location?.directory ?? props.context.location?.directory;
    try {
      const response = directory ? await client.session.list({ directory, limit: 200 }) : await client.session.list({ limit: 200 });
      const list = Array.isArray(response) ? response : response?.data;
      if (Array.isArray(list) && list.length > 0) setFetched(list);
    } catch {
    }
  }
  function refresh() {
    setRevision((value) => value + 1);
    void load();
  }
  onMount(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    let pending;
    const schedule = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = void 0;
        refresh();
      }, 800);
    };
    const unsubscribers = EVENTS.map((type) => {
      try {
        return props.context.data.on?.(type, schedule);
      } catch {
        return void 0;
      }
    }).filter(Boolean);
    onCleanup(() => {
      clearInterval(timer);
      if (pending) clearTimeout(pending);
      for (const stop of unsubscribers) stop?.();
    });
  });
  const header = () => {
    if (summary().sessions === 0) return "Costs \xB7 \u2026";
    if (summary().metric === "tokens") return `Costs \xB7 ${formatTokens(summary().total)} tok`;
    return `Costs \xB7 ${formatValue(summary().total, "cost")}`;
  };
  return /* @__PURE__ */ jsxs("box", { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsxs("box", { flexDirection: "row", justifyContent: "space-between", onMouseDown: () => props.onToggle(), children: [
      /* @__PURE__ */ jsx("text", { fg: colors().text, children: header() }),
      /* @__PURE__ */ jsx("text", { fg: colors().muted, children: props.expanded ? "\u25BE" : "\u25B8" })
    ] }),
    /* @__PURE__ */ jsx(Show, { when: props.expanded, children: /* @__PURE__ */ jsxs(Show, { when: summary().sessions > 0, fallback: /* @__PURE__ */ jsx("text", { fg: colors().muted, children: "loading\u2026" }), children: [
      /* @__PURE__ */ jsx(For, { each: summary().rows, children: (row) => /* @__PURE__ */ jsx(SessionLine, { row, metric: summary().metric, theme: props.context.theme }) }),
      /* @__PURE__ */ jsx("text", { fg: colors().border, children: "\u2500".repeat(24) }),
      /* @__PURE__ */ jsx("text", { fg: colors().muted, children: `${summary().sessions} sessions` }),
      /* @__PURE__ */ jsx("text", { fg: colors().muted, children: `In ${formatTokens(summary().tokens.input)} \xB7 Out ${formatTokens(
        summary().tokens.output
      )} \xB7 Rsn ${formatTokens(summary().tokens.reasoning)}` })
    ] }) })
  ] });
}
var tui_default = Plugin.define({
  id,
  setup(context) {
    const [settings, updateSettings] = context.storage.store("panel", { initial: { expanded: true } });
    const toggle = () => {
      void updateSettings((draft) => {
        draft.expanded = !draft.expanded;
      });
    };
    const unregister = context.ui.slot({
      prepend: "sidebar.content",
      render: ({ sessionID }) => /* @__PURE__ */ jsx(Show, { when: sessionID, children: /* @__PURE__ */ jsx(
        CostsPanel,
        {
          context,
          sessionID,
          expanded: settings.expanded,
          onToggle: toggle
        }
      ) })
    });
    return () => {
      unregister();
    };
  }
});
export {
  tui_default as default
};
