import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFamily,
  formatCost,
  formatTokens,
  formatValue,
  sessionTokens,
  summarize,
} from "../src/report.ts";

const session = (id, parentID, agent, cost, input, output, created = 0, title = "") => ({
  id,
  parentID,
  agent,
  title,
  model: { id: "deepseek-v4.1-flash" },
  cost,
  tokens: { input, output, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created },
});

const family = [
  session("root", undefined, "orchestrator", 1, 100, 10, 1),
  session("a", "root", "explorer", 0.3, 50, 5, 2, "explore the repo"),
  session("b", "root", "implementer", 0.6, 70, 7, 3, "implement the change"),
  session("b1", "b", "implementer", 0.1, 5, 1, 4, "nested follow-up"),
];

test("buildFamily returns the root plus every descendant with depths", () => {
  const nodes = buildFamily([...family, session("other", undefined, "build", 9, 999, 99, 5)], "a", "root");

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
  const nodes = buildFamily([session("root", undefined, "orchestrator", 0.5, 10, 1, 1)], "root");

  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].id, "root");
});

test("summarize keeps one row per session and totals the family", () => {
  const summary = summarize(buildFamily(family, "root"));

  assert.equal(summary.sessions, 4);
  assert.equal(summary.metric, "cost");
  assert.equal(summary.total, 2);
  assert.equal(summary.totalCost, 2);
  assert.equal(summary.tokens.input, 225);
  assert.deepEqual(
    summary.rows.map((row) => [row.label, row.depth, row.cost]),
    [
      ["orchestrator", 0, 1],
      ["implement the change", 1, 0.6],
      ["explore the repo", 1, 0.3],
      ["nested follow-up", 2, 0.1],
    ],
  );
});

test("percentages are relative to the family total", () => {
  const summary = summarize(buildFamily(family, "root"));

  assert.equal(Math.round(summary.rows[0].percent), 50);
  assert.equal(Math.round(summary.rows[1].percent), 30);
  assert.equal(Math.round(summary.rows[3].percent), 5);
});

test("an unpriced family switches the value column to tokens", () => {
  const free = family.map((entry) => ({ ...entry, cost: 0 }));

  const summary = summarize(buildFamily(free, "root"));

  assert.equal(summary.metric, "tokens");
  assert.equal(summary.totalCost, 0);
  assert.equal(summary.total, 248);
  assert.equal(summary.rows[0].value, 110);
  assert.equal(Math.round(summary.rows[0].percent), 44);
  assert.equal(summary.rows.length, 4);
});

test("finished subagents stay visible even when a sibling reports nothing", () => {
  const withIdle = [...family, session("c", "root", "implementer", 0, 0, 0, 6, "cancelled task")];

  const summary = summarize(buildFamily(withIdle, "root"));

  assert.equal(summary.sessions, 5);
  assert.ok(summary.rows.some((row) => row.label === "cancelled task"));
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

test("format helpers match the sidebar scale", () => {
  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.0042), "$0.0042");
  assert.equal(formatCost(0.42), "$0.420");
  assert.equal(formatCost(4.2), "$4.20");
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1_500), "1.5K");
  assert.equal(formatTokens(25_000), "25K");
  assert.equal(formatTokens(2_500_000), "2.5M");
  assert.equal(formatValue(0.42, "cost"), "$0.420");
  assert.equal(formatValue(42_000, "tokens"), "42K");
});

test("buildFamily stops at the row limit", () => {
  const sessions = [session("root", undefined, "orchestrator", 0, 0, 0, 0)];
  for (let index = 0; index < 100; index += 1) {
    sessions.push(session(`child-${index}`, "root", "worker", 0, 0, 0, index));
  }

  assert.equal(buildFamily(sessions, "root", "root", 10).length, 10);
});
