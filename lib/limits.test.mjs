import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  ADDRESS_BURST,
  ADDRESS_CUSTOM_DAILY,
  ADDRESS_DAILY,
  COST,
  CUSTOM_DAILY_LIMIT,
  SAVED_DAILY_LIMIT,
  checkLimits,
  clientIp,
  formatWait,
  resetLimits,
  usage,
} from "./limits.mjs";

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
// Noon UTC on some day, so a few hours of steps stay inside one UTC day.
const T0 = 20000 * DAY + 12 * 60 * MIN;

beforeEach(() => resetLimits(T0));

/** Sends `n` requests of `units` from `ip`, `gapMs` apart, starting at `start`. Returns the first refusal or null. */
function send(ip, n, { units = 1, custom = false, start = T0, gapMs = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const v = checkLimits(ip, { units, custom }, start + i * gapMs);
    if (!v.ok) return { ...v, index: i };
  }
  return null;
}

test("a run-case costs its model calls, not one", () => {
  assert.equal(COST.chat, 1);
  assert.equal(COST["run-case"], 4);
  assert.ok(COST.judge >= 1 && COST.ticket >= 1);
});

test("a visitor can run the lab three times back to back", () => {
  assert.equal(send("1.1.1.1", 36, { units: COST["run-case"], custom: true }), null);
});

test("a fourth lab run later that day stops early and says the saved instructions still work", () => {
  send("1.1.1.1", 36, { units: COST["run-case"], custom: true });
  const v = send("1.1.1.1", 12, { units: COST["run-case"], custom: true, start: T0 + 60 * MIN });
  assert.ok(v && v.index < 12);
  assert.equal(v.scope, "address");
  assert.match(v.message, /saved instructions/);
});

test("lab runs plus a long chat session fit in ten minutes", () => {
  // Two lab runs, then 40 chat replies and a few tickets.
  assert.equal(send("2.2.2.2", 24, { units: COST["run-case"], custom: true }), null);
  assert.equal(send("2.2.2.2", 40, { units: COST.chat, start: T0 + MIN }), null);
  assert.equal(send("2.2.2.2", 3, { units: COST.ticket, start: T0 + 2 * MIN }), null);
});

test("a script hammering chat is held to the burst limit, then the daily limit", () => {
  const first = send("3.3.3.3", 1000, { units: COST.chat });
  assert.equal(first.index, ADDRESS_BURST.units);
  assert.equal(first.scope, "address");
  assert.ok(first.retryAfterSeconds > 0 && first.retryAfterSeconds <= 600);

  // One request a minute for a day: never trips the burst, stops at the daily cap.
  resetLimits(T0);
  const slow = send("3.3.3.3", 2000, { units: COST.chat, gapMs: 30 * 1000 });
  assert.equal(slow.index, ADDRESS_DAILY.units);
});

test("refused requests are not counted", () => {
  send("4.4.4.4", ADDRESS_BURST.units, { units: 1 });
  const before = usage().saved;
  for (let i = 0; i < 50; i++) assert.equal(checkLimits("4.4.4.4", { units: 1 }, T0).ok, false);
  assert.equal(usage().saved, before);
});

test("the burst window slides: requests open again after ten minutes", () => {
  send("5.5.5.5", ADDRESS_BURST.units, { units: 1 });
  assert.equal(checkLimits("5.5.5.5", { units: 1 }, T0 + 5 * MIN).ok, false);
  assert.equal(checkLimits("5.5.5.5", { units: 1 }, T0 + ADDRESS_BURST.windowMs + 1).ok, true);
});

test("custom instructions have a tighter per-address cap than saved ones", () => {
  assert.ok(ADDRESS_CUSTOM_DAILY.units < ADDRESS_DAILY.units);
  // Spread over the day so the burst window is not what stops it.
  const v = send("6.6.6.6", 1000, { units: 1, custom: true, gapMs: 5 * MIN });
  assert.equal(v.index, ADDRESS_CUSTOM_DAILY.units);
  assert.equal(v.scope, "address");
});

test("custom per-address cap counts only custom requests", () => {
  const ip = "6.6.6.7";
  // Use the whole custom share, spread out.
  const v = send(ip, 1000, { units: 4, custom: true, gapMs: 10 * MIN });
  assert.equal(v.index, Math.floor(ADDRESS_CUSTOM_DAILY.units / 4));
  // Saved instructions from the same address still work.
  assert.equal(checkLimits(ip, { units: 1 }, T0 + (v.index + 1) * 10 * MIN).ok, true);
});

test("the custom pool is much smaller than the saved pool and separate from it", () => {
  assert.ok(CUSTOM_DAILY_LIMIT * 2 <= SAVED_DAILY_LIMIT);
  // Many addresses use up the custom pool.
  let ip = 0;
  let refused = null;
  while (!refused && ip < 1000) {
    refused = send(`10.0.0.${ip++}`, 12, { units: COST["run-case"], custom: true });
  }
  assert.equal(usage().custom, CUSTOM_DAILY_LIMIT);
  assert.equal(refused.scope, "site");
  assert.match(refused.message, /saved instructions/);
  // The patient page (saved instructions) is unaffected.
  assert.equal(checkLimits("10.9.9.9", { units: COST.chat }, T0).ok, true);
});

test("the saved pool stops the whole site for the day and resets at UTC midnight", () => {
  let n = 0;
  while (usage().saved < SAVED_DAILY_LIMIT) {
    assert.equal(checkLimits(`11.0.${Math.floor(n / 200)}.${n % 200}`, { units: 1 }, T0).ok, true);
    n++;
  }
  const v = checkLimits("11.9.9.9", { units: 1 }, T0);
  assert.equal(v.ok, false);
  assert.equal(v.scope, "site");
  assert.equal(v.retryAfterSeconds, 12 * 60 * 60);
  assert.match(v.message, /Recorded results/);
  assert.equal(checkLimits("11.9.9.9", { units: 1 }, T0 + 12 * 60 * MIN).ok, true);
});

test("a request that would overshoot the pool is refused whole", () => {
  let n = 0;
  while (usage().custom < CUSTOM_DAILY_LIMIT - 2) {
    assert.equal(checkLimits(`12.0.0.${n++}`, { units: usage().custom + 4 <= CUSTOM_DAILY_LIMIT - 2 ? 4 : 1, custom: true }, T0).ok, true);
  }
  assert.equal(CUSTOM_DAILY_LIMIT - usage().custom, 2);
  assert.equal(checkLimits("12.9.9.9", { units: 4, custom: true }, T0).ok, false);
  assert.equal(checkLimits("12.9.9.9", { units: 1, custom: true }, T0).ok, true);
});

test("limit messages say when, and what still works, without error words", () => {
  send("13.1.1.1", ADDRESS_BURST.units, { units: 1 });
  const v = checkLimits("13.1.1.1", { units: 1 }, T0);
  assert.match(v.message, /about \d+ (seconds|minutes)/);
  assert.match(v.message, /still work/);
  assert.doesNotMatch(v.message, /error|rate limit|too many|!/i);
});

test("clientIp takes the first forwarded address", () => {
  assert.equal(clientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9");
  assert.equal(clientIp(new Headers({ "x-real-ip": "8.8.8.8" })), "8.8.8.8");
  assert.equal(clientIp(new Headers()), "unknown");
});

test("formatWait reads naturally", () => {
  assert.equal(formatWait(30), "30 seconds");
  assert.equal(formatWait(600), "10 minutes");
  assert.equal(formatWait(3600 + 60 * 40), "2 hours");
  assert.equal(formatWait(60 * 89), "89 minutes");
  assert.equal(formatWait(60 * 95), "2 hours");
});
