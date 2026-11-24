/**
 * Pure helpers for the cost panel. No OpenTUI, no Solid, no OpenCode imports,
 * so they can be unit tested with plain Node.
 */

export type Tokens = {
  input: number;
  output: number;
  reasoning: number;
  cache_read: number;
  cache_write: number;
};

export type FamilyNode = {
  id: string;
  parentID?: string;
  agent?: string;
  model?: { id?: string };
  cost?: number;
  tokens?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
  };
  time?: { created?: number };
  depth?: number;
};

export type SessionRow = {
  id: string;
  label: string;
  agent: string;
  depth: number;
  cost: number;
  tokens: Tokens;
  /** The metric used for the value and percentage columns. */
  value: number;
  percent: number;
};

export type Summary = {
  rows: SessionRow[];
  /** "cost" when the family reports money, "tokens" when every session is unpriced. */
  metric: "cost" | "tokens";
  total: number;
  totalCost: number;
  tokens: Tokens;
  sessions: number;
};

const LABEL_MAX = 20;

export function zeroTokens(): Tokens {
  return { input: 0, output: 0, reasoning: 0, cache_read: 0, cache_write: 0 };
}

export function sessionTokens(session: FamilyNode | undefined): Tokens {
  const tokens = session?.tokens ?? {};
  const cache = tokens.cache ?? {};
  return {
    input: Number(tokens.input) || 0,
    output: Number(tokens.output) || 0,
    reasoning: Number(tokens.reasoning) || 0,
    cache_read: Number(cache.read) || 0,
    cache_write: Number(cache.write) || 0,
  };
}

export function addTokens(target: Tokens, source: Tokens): void {
  target.input += source.input;
  target.output += source.output;
  target.reasoning += source.reasoning;
  target.cache_read += source.cache_read;
  target.cache_write += source.cache_write;
}

export function tokenTotal(tokens: Tokens): number {
  return tokens.input + tokens.output + tokens.reasoning;
}

export function formatCost(value: number | undefined): string {
  const amount = Number(value) || 0;
  if (amount === 0) return "$0.00";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  if (amount < 1) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatTokens(value: number | undefined): string {
  const count = Number(value) || 0;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return String(count);
}

export function formatValue(value: number, metric: "cost" | "tokens"): string {
  return metric === "cost" ? formatCost(value) : formatTokens(value);
}

/** Root plus every descendant, breadth-first, each node tagged with a depth. */
export function buildFamily(sessions: FamilyNode[], sessionID: string, rootID?: string, limit = 60): FamilyNode[] {
  const byId = new Map<string, FamilyNode>();
  const children = new Map<string, FamilyNode[]>();

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

  const nodes: FamilyNode[] = [];
  const queue: Array<{ node: FamilyNode; depth: number }> = [{ node: start, depth: 0 }];
  const seen = new Set<string>([start.id]);

  while (queue.length > 0 && nodes.length < limit) {
    const { node, depth } = queue.shift()!;
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

function label(node: FamilyNode, depth: number): string {
  const raw = depth === 0 ? node.agent || "session" : node.title || node.agent || "session";
  return raw.length > LABEL_MAX ? `${raw.slice(0, LABEL_MAX - 1)}…` : raw;
}

/**
 * One row per session, in tree order, so finished subagents stay visible.
 *
 * When the family reports no money at all (unpriced models, free tiers), the
 * value column switches to tokens; otherwise every row would read $0.00.
 */
export function summarize(nodes: FamilyNode[]): Summary {
  const tokens = zeroTokens();
  const perNode = nodes.map((node) => ({ node, tokens: sessionTokens(node), cost: Number(node.cost) || 0 }));

  for (const entry of perNode) {
    addTokens(tokens, entry.tokens);
  }

  const totalCost = perNode.reduce((sum, entry) => sum + entry.cost, 0);
  const metric: "cost" | "tokens" = totalCost > 0 ? "cost" : "tokens";
  const total = metric === "cost" ? totalCost : tokenTotal(tokens);

  const rows: SessionRow[] = perNode.map((entry) => {
    const value = metric === "cost" ? entry.cost : tokenTotal(entry.tokens);
    return {
      id: entry.node.id,
      label: label(entry.node, entry.node.depth ?? 0),
      agent: entry.node.agent || "unknown",
      depth: entry.node.depth ?? 0,
      cost: entry.cost,
      tokens: entry.tokens,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
    };
  });

  // Highest spender first inside each depth, keeping parents above their children.
  rows.sort((a, b) => a.depth - b.depth || b.value - a.value);

  return { rows, metric, total, totalCost, tokens, sessions: nodes.length };
}
