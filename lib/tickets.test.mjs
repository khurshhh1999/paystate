import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTicket, needsTicket, buildTicketInput, TICKET_KINDS } from "./tickets.mjs";
import { CASES } from "./cases.mjs";

test("parseTicket keeps known fields and trims captured values", () => {
  const t = parseTicket('```json\n{"kind":"apply_payment","amount":40,"reason":"Ledger shows $40 unapplied.","told_patient":"Nothing more is owed.","captured":[{"label":"Receipt","value":" FD-118204 "},{"label":"","value":"x"}],"next_step":"Apply receipt FD-118204."}\n```');
  assert.equal(t.kind, "apply_payment");
  assert.equal(t.amount, 40);
  assert.deepEqual(t.captured, [{ label: "Receipt", value: "FD-118204" }]);
});

test("parseTicket falls back to other for an unknown kind and 0 for a bad amount", () => {
  const t = parseTicket('{"kind":"refund","amount":"lots","reason":"r","told_patient":"t","next_step":"n"}');
  assert.equal(t.kind, "other");
  assert.equal(t.amount, 0);
  assert.deepEqual(t.captured, []);
});

test("parseTicket rejects output with no reason or no JSON", () => {
  assert.throws(() => parseTicket('{"kind":"other","next_step":"n"}'), /reason/);
  assert.throws(() => parseTicket("sorry"), /no JSON/);
});

test("needsTicket is true only after a handoff", () => {
  assert.equal(needsTicket([{ role: "patient", text: "hi" }, { role: "agent", text: "ok", actions: ["place_hold"] }]), false);
  assert.equal(needsTicket([{ role: "patient", text: "hi" }, { role: "agent", text: "ok", actions: ["place_hold", "handoff_to_staff"] }]), true);
});

test("ticket input carries the record but not the answer key", () => {
  const kase = CASES[0];
  const input = buildTicketInput(kase, [{ role: "patient", text: kase.opener }, { role: "agent", text: "x", actions: [] }]);
  assert.ok(input.includes("ACCOUNT RECORD"));
  assert.ok(!input.includes(kase.truth.fail_if));
  assert.ok(Object.keys(TICKET_KINDS).length >= 9);
});
