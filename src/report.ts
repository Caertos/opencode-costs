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

export type AgentRow = {
  agent: string;
  model: string;
  depth: number;
  sessions: number;
  cost: number;
  tokens: Tokens;
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

export type Summary = {
  rows: AgentRow[];
  total: number;
  tokens: Tokens;
  sessions: number;
};

/** Group a family by agent: cost, tokens and session count per agent. */
export function summarize(nodes: FamilyNode[]): Summary {
  const agents = new Map<string, AgentRow>();
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
      tokens: zeroTokens(),
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
