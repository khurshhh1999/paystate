// A daily dollar budget for live model calls, shared by every server instance.
//
// lib/limits.mjs counts requests in memory, so its counters reset on a cold start and each
// instance has its own. This module tracks what the calls actually cost, from the token
// usage on each response, in a store all instances read. Once the day's budget is spent,
// live calls stop until UTC midnight and the recorded pages carry on.
//
// The store is read-then-write, so a burst of parallel calls can overshoot by a few calls.
// The spend limit on the key in the Anthropic console is still the hard ceiling.

import { AsyncLocalStorage } from "node:async_hooks";

const DAY_MS = 24 * 60 * 60 * 1000;

// Dollars per million tokens: [input, output].
const PRICES = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
};
const DEFAULT_PRICE = [4, 20];

export function budgets(env = process.env) {
  const num = (v, fallback) => (Number.isFinite(Number(v)) && Number(v) >= 0 && v !== undefined && v !== "" ? Number(v) : fallback);
  return {
    total: num(env.LIVE_DAILY_BUDGET_USD, 3),
    // Runs on a visitor's own instructions draw on the total and also have this smaller share.
    custom: num(env.LIVE_CUSTOM_DAILY_BUDGET_USD, 1.2),
  };
}

/** Cost in dollars of one response, from its usage block. */
export function costOf(model, usage) {
  const [inPrice, outPrice] = PRICES[Object.keys(PRICES).find((m) => String(model).startsWith(m))] ?? DEFAULT_PRICE;
  const input =
    (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0);
  const output = usage?.output_tokens ?? 0;
  return (input * inPrice + output * outPrice) / 1e6;
}

const dayKey = (now) => `spend:${Math.floor(now / DAY_MS)}`;

// In-memory store, used in tests and wherever the shared one is not available.
function memoryStore() {
  const map = new Map();
  return { get: async (k) => map.get(k) ?? null, set: async (k, v) => void map.set(k, v) };
}

let store = null;
async function getStore() {
  if (store) return store;
  if (process.env.VERCEL) {
    try {
      const { getCache } = await import("@vercel/functions");
      const cache = getCache({ namespace: "paystate-budget" });
      store = { get: (k) => cache.get(k), set: (k, v) => cache.set(k, v, { ttl: 2 * 24 * 60 * 60 }) };
      return store;
    } catch {
      // Fall through to memory.
    }
  }
  store = memoryStore();
  return store;
}

/** Test helper: use this store (or a fresh in-memory one). */
export function setBudgetStore(s = memoryStore()) {
  store = s;
}

// This instance's own tally, so it never undercounts what it spent itself.
let local = { key: "", total: 0, custom: 0 };

async function read(now) {
  const key = dayKey(now);
  if (local.key !== key) local = { key, total: 0, custom: 0 };
  let shared = null;
  try {
    shared = await (await getStore()).get(key);
  } catch {
    // Store unreachable: this instance's tally still applies.
  }
  return {
    key,
    total: Math.max(local.total, Number(shared?.total) || 0),
    custom: Math.max(local.custom, Number(shared?.custom) || 0),
  };
}

/** Whether a live call may start. -> { ok: true } or { ok: false, scope, retryAfterSeconds } */
export async function checkBudget({ custom = false } = {}, now = Date.now(), env = process.env) {
  const limit = budgets(env);
  const spent = await read(now);
  const retryAfterSeconds = Math.ceil((Math.floor(now / DAY_MS) + 1) * DAY_MS / 1000 - now / 1000);
  if (spent.total >= limit.total) return { ok: false, scope: "total", retryAfterSeconds };
  if (custom && spent.custom >= limit.custom) return { ok: false, scope: "custom", retryAfterSeconds };
  return { ok: true };
}

/** Adds a call's cost to today's tally. */
export async function recordSpend(usd, { custom = false } = {}, now = Date.now()) {
  if (!(usd > 0)) return;
  const spent = await read(now);
  const next = { total: spent.total + usd, custom: spent.custom + (custom ? usd : 0) };
  local = { key: spent.key, ...next };
  try {
    await (await getStore()).set(spent.key, next);
  } catch {
    // Kept in the local tally.
  }
}

// The route marks the request as custom or not; the model wrapper reports usage without
// needing to know which route it is serving.
const scope = new AsyncLocalStorage();

/** Runs fn with its model calls charged to the budget. */
export function charged(custom, fn) {
  return scope.run({ custom }, fn);
}

/** Called by the model wrapper after each successful response. No-op outside charged(). */
export async function reportUsage(model, usage) {
  const ctx = scope.getStore();
  if (!ctx) return;
  await recordSpend(costOf(model, usage), ctx);
}
