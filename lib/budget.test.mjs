import test from "node:test";
import assert from "node:assert/strict";
import { budgets, charged, checkBudget, costOf, recordSpend, reportUsage, setBudgetStore } from "./budget.mjs";

const DAY = 24 * 60 * 60 * 1000;
const T0 = 20000 * DAY + 3600 * 1000;
const ENV = { LIVE_DAILY_BUDGET_USD: "1", LIVE_CUSTOM_DAILY_BUDGET_USD: "0.4" };

test("cost comes from token usage and the model's price", () => {
  assert.equal(costOf("claude-opus-5-5", { input_tokens: 1_000_000, output_tokens: 0 }), 4);
  assert.equal(costOf("claude-opus-5-5", { input_tokens: 0, output_tokens: 1_000_000 }), 20);
  assert.equal(costOf("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 12);
  assert.equal(costOf("unknown-model", { input_tokens: 1_000_000 }), 4);
  assert.equal(costOf("claude-opus-5-5", undefined), 0);
});

test("budgets read the environment and fall back to defaults", () => {
  assert.deepEqual(budgets({}), { total: 3, custom: 1.2 });
  assert.deepEqual(budgets(ENV), { total: 1, custom: 0.4 });
  assert.deepEqual(budgets({ LIVE_DAILY_BUDGET_USD: "junk" }), { total: 3, custom: 1.2 });
});

test("live calls stop when the day's budget is spent and open again the next day", async () => {
  setBudgetStore();
  const day = T0 + 10 * DAY;
  assert.equal((await checkBudget({}, day, ENV)).ok, true);
  await recordSpend(0.6, {}, day);
  assert.equal((await checkBudget({}, day, ENV)).ok, true);
  await recordSpend(0.5, {}, day);
  const v = await checkBudget({}, day, ENV);
  assert.equal(v.ok, false);
  assert.equal(v.scope, "total");
  assert.ok(v.retryAfterSeconds > 0 && v.retryAfterSeconds <= 86400);
  assert.equal((await checkBudget({}, day + DAY, ENV)).ok, true);
});

test("custom instructions run out first and leave the saved ones working", async () => {
  setBudgetStore();
  const day = T0 + 20 * DAY;
  await recordSpend(0.45, { custom: true }, day);
  const v = await checkBudget({ custom: true }, day, ENV);
  assert.equal(v.ok, false);
  assert.equal(v.scope, "custom");
  assert.equal((await checkBudget({ custom: false }, day, ENV)).ok, true);
});

test("another instance sees the spend through the shared store", async () => {
  const shared = new Map();
  const s = { get: async (k) => shared.get(k) ?? null, set: async (k, v) => void shared.set(k, v) };
  setBudgetStore(s);
  const day = T0 + 30 * DAY;
  await recordSpend(1.5, {}, day);
  // A second instance has no local tally: simulate it by reading the store directly.
  const stored = [...shared.values()].at(-1);
  assert.equal(stored.total, 1.5);
});

test("a store that fails does not break the call or lose this instance's tally", async () => {
  setBudgetStore({
    get: async () => {
      throw new Error("down");
    },
    set: async () => {
      throw new Error("down");
    },
  });
  const day = T0 + 40 * DAY;
  await recordSpend(2, {}, day);
  assert.equal((await checkBudget({}, day, ENV)).ok, false);
});

test("usage is charged only inside a charged request", async () => {
  setBudgetStore();
  await reportUsage("claude-opus-5-5", { output_tokens: 1_000_000 }); // outside: ignored
  const before = await checkBudget({}, Date.now(), { LIVE_DAILY_BUDGET_USD: "5" });
  assert.equal(before.ok, true);
  await charged(false, () => reportUsage("claude-opus-5-5", { output_tokens: 1_000_000 }));
  assert.equal((await checkBudget({}, Date.now(), { LIVE_DAILY_BUDGET_USD: "5" })).ok, false);
});
