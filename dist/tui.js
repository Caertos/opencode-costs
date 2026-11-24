// src/tui.tsx
import { Plugin } from "@opencode/plugin/tui";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";

// src/report.ts
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
function summarize(nodes) {
  const agents = /* @__PURE__ */ new Map();
  const tokens = zeroTokens();
  let total = 0;
  for (const node of nodes) {
    const agent = node.agent || "unknown";
    const nodeTokens = sessionTokens(node);
    const nodeCost = Number(node.cost) || 0;
    total += nodeCost;
    addTokens(tokens, nodeTokens);
    const entry = agents.get(agent) ?? {
      agent,
      model: node.model?.id ?? "unknown",
      depth: node.depth ?? 0,
      sessions: 0,
      cost: 0,
      tokens: zeroTokens()
    };
    entry.sessions += 1;
    entry.cost += nodeCost;
    entry.depth = Math.min(entry.depth, node.depth ?? 0);
    addTokens(entry.tokens, nodeTokens);
    agents.set(agent, entry);
  }
  const rows = [...agents.values()].sort((a, b) => b.cost - a.cost || b.tokens.input - a.tokens.input);
  return { rows, total, tokens, sessions: nodes.length };
}

// src/tui.tsx
import { jsx, jsxs } from "@opentui/solid/jsx-runtime";
var id = "opencode-costs-tui";
var REFRESH_MS = 3e4;
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
function AgentLine(props) {
  const colors = () => palette(props.theme);
  const label = () => {
    const indent = "  ".repeat(Math.min(props.row.depth ?? 0, 2));
    const raw = props.row.agent || "unknown";
    const name = raw.length > 17 ? `${raw.slice(0, 16)}\u2026` : raw;
    return `${indent}${name}`.padEnd(20);
  };
  const percent = () => props.total > 0 ? `${Math.round(props.row.cost / props.total * 100)}%` : "0%";
  return /* @__PURE__ */ jsxs("box", { flexDirection: "row", children: [
    /* @__PURE__ */ jsx("text", { fg: colors().text, children: label() }),
    /* @__PURE__ */ jsx("text", { fg: colors().success, children: formatCost(props.row.cost).padStart(8) }),
    /* @__PURE__ */ jsx("text", { fg: colors().muted, children: percent().padStart(5) })
  ] });
}
function CostsPanel(props) {
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
    if (summary().sessions === 0) return "Costs \xB7 \u2026";
    return `Costs \xB7 ${formatCost(summary().total)}`;
  };
  return /* @__PURE__ */ jsxs("box", { flexDirection: "column", marginBottom: 1, children: [
    /* @__PURE__ */ jsxs("box", { flexDirection: "row", justifyContent: "space-between", onMouseDown: () => props.onToggle(), children: [
      /* @__PURE__ */ jsx("text", { fg: colors().text, children: header() }),
      /* @__PURE__ */ jsx("text", { fg: colors().muted, children: props.expanded ? "\u25BE" : "\u25B8" })
    ] }),
    /* @__PURE__ */ jsx(Show, { when: props.expanded, children: /* @__PURE__ */ jsxs(Show, { when: summary().sessions > 0, fallback: /* @__PURE__ */ jsx("text", { fg: colors().muted, children: "loading\u2026" }), children: [
      /* @__PURE__ */ jsx(For, { each: summary().rows, children: (row) => /* @__PURE__ */ jsx(AgentLine, { row, total: summary().total, theme: props.context.theme }) }),
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
