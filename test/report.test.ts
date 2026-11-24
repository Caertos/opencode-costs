import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFamily,
  formatCost,
  formatTokens,
  sessionTokens,
  summarize,
} from "../src/report.ts";

const session = (id, parentID, agent, cost, input, output, created = 0) => ({
  id,
  parentID,
  agent,
  model: { id: "deepseek-v4.1-flash" },
  cost,
  tokens: { input, output, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created },
});

test("buildFamily returns the root plus every descendant with depths", () => {
  const sessions = [
    session("root", undefined, "orchestrator", 1, 100, 10, 1),
    session("a", "root", "explorer", 0.3, 50, 5, 2),
    session("b", "root", "implementer", 0.6, 70, 7, 3),
    session("b1", "b", "implementer", 0.1, 5, 1, 4),
    session("other", undefined, "build", 9, 999, 99, 5),
  ];

  const nodes = buildFamily(sessions, "a", "root");

  assert.deepEqual(
    nodes.map((node) => [node.id, node.depth]),
    [
      ["root", 0],
      ["a", 1],
      ["b", 1],
      ["b1", 2],
    ],
  );
});

test("buildFamily falls back to the requested session when the root is unknown", () => {
  const sessions = [session("root", undefined, "orchestrator", 0.5, 10, 1, 1)];

  const nodes = buildFamily(sessions, "root");

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, "root");
});

test("summarize groups by agent and totals the family", () => {
  const nodes = buildFamily(
    [
      session("root", undefined, "orchestrator", 1, 100, 10, 1),
      session("a", "root", "explorer", 0.3, 50, 5, 2),
      session("b", "root", "implementer", 0.6, 70, 7, 3),
      session("b1", "b", "implementer", 0.1, 5, 1, 4),
    ],
    "root",
  );

  const summary = summarize(nodes);

  assert.equal(summary.sessions, 4);
  assert.equal(summary.total, 2);
  assert.equal(summary.tokens.input, 225);
  assert.deepEqual(
    summary.rows.map((row) => [row.agent, row.cost, row.sessions]),
    [
      ["orchestrator", 1, 1],
      ["implementer", 0.7, 2],
      ["explorer", 0.3, 1],
    ],
  );
  assert.equal(summary.rows.find((row) => row.agent === "implementer").depth, 1);
});

test("summarize keeps agents whose sessions report zero cost", () => {
  const summary = summarize([
    { id: "a", agent: "free-model", cost: 0, tokens: { input: 120, output: 4 }, depth: 0 },
  ]);

  assert.equal(summary.rows.length, 1);
  assert.equal(summary.rows[0].cost, 0);
  assert.equal(summary.total, 0);
  assert.equal(summary.tokens.input, 120);
});

test("sessionTokens tolerates missing token blocks", () => {
  assert.deepEqual(sessionTokens({ id: "x" }), {
    input: 0,
    output: 0,
    reasoning: 0,
    cache_read: 0,
    cache_write: 0,
  });
});

test("formatCost and formatTokens match the sidebar scale", () => {
  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.0042), "$0.0042");
  assert.equal(formatCost(0.42), "$0.420");
  assert.equal(formatCost(4.2), "$4.20");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1_500), "1.5K");
  assert.equal(formatTokens(25_000), "25K");
  assert.equal(formatTokens(2_500_000), "2.5M");
});

test("buildFamily stops at the row limit", () => {
  const sessions = [session("root", undefined, "orchestrator", 0, 0, 0, 0)];
  for (let index = 0; index < 100; index += 1) {
    sessions.push(session(`child-${index}`, "root", "worker", 0, 0, 0, index));
  }

  assert.equal(buildFamily(sessions, "root", "root", 10).length, 10);
});
