import { test } from "node:test";
import assert from "node:assert/strict";
import { CASES } from "./cases.mjs";
import { COMMON_CASES } from "./cases-common.mjs";
import { FEEDS, STATEMENT_KEYS } from "./feeds.mjs";
import { TRAFFIC_CASES, GATE_EXPECTED, MIX_NOTE } from "./traffic.mjs";

const cents = (n) => Math.round(n * 100);
const group = (carc) => carc.split("-")[0];

// Balances that are wrong on purpose: the statement bills a CO denial to the patient.
const STATEMENT_WRONG = ["work-injury", "timely-filing"];
// The one case where the balance reads as payable but asking for it is still wrong.
const AT_RISK_EXCEPTION = ["deceased"];

test("28 cases with unique ids, hard cases first", () => {
  assert.equal(TRAFFIC_CASES.length, 28);
  assert.equal(new Set(TRAFFIC_CASES.map((c) => c.id)).size, 28);
  assert.deepEqual(TRAFFIC_CASES.slice(0, 12).map((c) => c.id), CASES.map((c) => c.id));
  assert.equal(COMMON_CASES.length, 16);
});

test("the source cases are not mutated", () => {
  for (const c of [...CASES, ...COMMON_CASES]) assert.ok(!("weight" in c) && !("persona" in c) && !("goal" in c), c.id);
});

test("weights are positive, one decimal at most, and sum to 100", () => {
  let sum = 0;
  for (const c of TRAFFIC_CASES) {
    assert.ok(c.weight > 0, c.id);
    assert.ok(Math.abs(Math.round(c.weight * 10) - c.weight * 10) < 1e-9, `${c.id} weight has more than one decimal`);
    sum += c.weight;
  }
  assert.ok(Math.abs(sum - 100) < 0.01, `weights sum to ${sum}`);
});

test("every case has a persona and a goal", () => {
  for (const c of TRAFFIC_CASES) {
    assert.ok(typeof c.persona === "string" && c.persona.length > 10, `${c.id} persona`);
    assert.ok(typeof c.goal === "string" && c.goal.length > 10, `${c.id} goal`);
  }
  assert.ok(MIX_NOTE.length > 100);
});

test("every case has a gate expectation, and nothing extra", () => {
  const ids = TRAFFIC_CASES.map((c) => c.id);
  assert.deepEqual(Object.keys(GATE_EXPECTED).sort(), [...ids].sort());
  for (const c of TRAFFIC_CASES) {
    const g = GATE_EXPECTED[c.id];
    assert.ok(["payable", "not_payable", "partial"].includes(g.status), c.id);
    if (g.status === "payable") assert.equal(cents(g.owed), cents(c.balance), `${c.id} payable owed is the balance`);
    if (g.status === "not_payable") assert.equal(g.owed, 0, c.id);
    if (g.status === "partial") assert.ok(g.owed > 0 && g.owed < c.balance, c.id);
  }
});

test("every record field belongs to the statement or to exactly one feed", () => {
  const owned = new Map();
  for (const k of STATEMENT_KEYS) owned.set(k, "statement");
  for (const f of FEEDS) for (const k of f.keys) {
    assert.ok(!owned.has(k), `${k} is claimed twice`);
    owned.set(k, f.id);
  }
  for (const c of TRAFFIC_CASES) for (const k of Object.keys(c.record)) assert.ok(owned.has(k), `${c.id}.${k} has no feed`);
});

test("balance and statement_balance agree", () => {
  for (const c of TRAFFIC_CASES) assert.equal(cents(c.record.statement_balance), cents(c.balance), c.id);
});

test("at_risk is 0 exactly when the gate expects payable, except the deceased case", () => {
  for (const c of TRAFFIC_CASES) {
    const payable = GATE_EXPECTED[c.id].status === "payable";
    if (AT_RISK_EXCEPTION.includes(c.id)) {
      assert.ok(payable && c.at_risk > 0, `${c.id} is the documented exception`);
      continue;
    }
    assert.equal(c.at_risk === 0, payable, `${c.id}: at_risk ${c.at_risk}, gate ${GATE_EXPECTED[c.id].status}`);
  }
});

test("patient-responsibility lines, less applied payments, add up to the statement balance", () => {
  for (const c of TRAFFIC_CASES) {
    const { remit, ledger, statement_balance } = c.record;
    if (!Array.isArray(remit)) continue;
    const pr = remit.filter((l) => group(l.carc) === "PR").reduce((s, l) => s + cents(l.amount), 0);
    const applied = (Array.isArray(ledger) ? ledger : [])
      .filter((e) => e.status === "applied" && typeof e.amount === "number")
      .reduce((s, e) => s + cents(e.amount), 0);
    const matches = pr - applied === cents(statement_balance);
    if (STATEMENT_WRONG.includes(c.id)) assert.ok(!matches, `${c.id} is listed as wrong on purpose but adds up`);
    else assert.ok(matches, `${c.id}: PR ${pr / 100} - applied ${applied / 100} != balance ${statement_balance}`);
  }
});

test("billed less adjustments less payer paid equals the patient's share", () => {
  for (const c of TRAFFIC_CASES) {
    const { billed, remit, payer_paid } = c.record;
    if (typeof billed !== "number" || typeof payer_paid !== "number" || !Array.isArray(remit)) continue;
    const co = remit.filter((l) => group(l.carc) === "CO").reduce((s, l) => s + cents(l.amount), 0);
    const pr = remit.filter((l) => group(l.carc) === "PR").reduce((s, l) => s + cents(l.amount), 0);
    assert.equal(cents(billed) - co - cents(payer_paid), pr, c.id);
  }
});
