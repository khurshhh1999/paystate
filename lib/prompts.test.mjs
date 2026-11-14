import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAgentReply, parseVerdict, ACTIONS, AGENT_V1, AGENT_V2, FORMAT, buildAgentInput, buildJudgeInput } from "./prompts.mjs";
import { CASES } from "./cases.mjs";

test("parseAgentReply splits text and actions", () => {
  const r = parseAgentReply("Your balance is on hold.\nACTIONS: place_hold, handoff_to_staff");
  assert.equal(r.text, "Your balance is on hold.");
  assert.deepEqual(r.actions, ["place_hold", "handoff_to_staff"]);
});

test("parseAgentReply without an ACTIONS line keeps all text and no actions", () => {
  const r = parseAgentReply("  Happy to help with that.  \n");
  assert.equal(r.text, "Happy to help with that.");
  assert.deepEqual(r.actions, []);
});

test("parseAgentReply with ACTIONS: none", () => {
  const r = parseAgentReply("Here is what the charge is for.\n\nACTIONS: none");
  assert.equal(r.text, "Here is what the charge is for.");
  assert.deepEqual(r.actions, []);
});

test("parseAgentReply drops junk action names", () => {
  const r = parseAgentReply("Ok.\nACTIONS: refund_everything, set_up_plan, , send pay link, `place_hold`");
  assert.deepEqual(r.actions, ["set_up_plan", "place_hold"]);
});

test("parseAgentReply accepts mixed case label and action names", () => {
  const r = parseAgentReply("Done.\nactions: Set_Up_Plan, SEND_PAY_LINK\n");
  assert.equal(r.text, "Done.");
  assert.deepEqual(r.actions, ["set_up_plan", "send_pay_link"]);
});

test("parseAgentReply returns only known actions", () => {
  const r = parseAgentReply("x\nACTIONS: " + ACTIONS.join(", "));
  assert.deepEqual(r.actions, ACTIONS);
});

test("parseVerdict reads plain JSON", () => {
  const v = parseVerdict('{"outcome":"dead_end","accurate":false,"reason":"No next step."}');
  assert.deepEqual(v, { outcome: "dead_end", accurate: false, reason: "No next step." });
});

test("parseVerdict reads code-fenced JSON with surrounding prose", () => {
  const raw = 'Here is the grade:\n```json\n{"outcome": "correct_handoff", "accurate": true, "reason": "Held and handed off."}\n```';
  const v = parseVerdict(raw);
  assert.equal(v.outcome, "correct_handoff");
  assert.equal(v.accurate, true);
  assert.equal(v.reason, "Held and handed off.");
});

test("parseVerdict treats non-boolean accurate as false and missing reason as empty", () => {
  const v = parseVerdict('{"outcome":"resolved","accurate":"yes"}');
  assert.equal(v.accurate, false);
  assert.equal(v.reason, "");
});

test("parseVerdict rejects an unknown outcome", () => {
  assert.throws(() => parseVerdict('{"outcome":"paid","accurate":true,"reason":""}'), /unknown outcome/);
});

test("parseVerdict rejects output with no JSON", () => {
  assert.throws(() => parseVerdict("I cannot grade this."), /no JSON/);
});

test("both agent prompts and FORMAT carry the ACTIONS instruction", () => {
  assert.ok(FORMAT.includes("ACTIONS:"));
  assert.ok(AGENT_V1.endsWith(FORMAT));
  assert.ok(AGENT_V2.endsWith(FORMAT));
});

test("input builders include the record and, for the judge only, the answer key", () => {
  const kase = CASES[0];
  const transcript = [
    { role: "patient", text: kase.opener },
    { role: "agent", text: "Reply.", actions: ["set_up_plan"] },
  ];
  const agentIn = buildAgentInput(kase, transcript);
  assert.ok(agentIn.includes("ACCOUNT RECORD"));
  assert.ok(!agentIn.includes("ANSWER KEY"));
  assert.ok(!agentIn.includes(kase.truth.fail_if));
  const judgeIn = buildJudgeInput(kase, transcript);
  assert.ok(judgeIn.includes("ANSWER KEY"));
  assert.ok(judgeIn.includes("[actions taken: set_up_plan]"));
});
