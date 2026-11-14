import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  parseAgentReply,
  parseVerdict,
  ACTIONS,
  PRODUCT_ACTIONS,
  AGENT_V1,
  AGENT_V2,
  AGENT_PRODUCT,
  FORMAT,
  FORMAT_PRODUCT,
  buildAgentInput,
  buildJudgeInput,
  recordForView,
} from "./prompts.mjs";
import { CASES, PRACTICE_POLICY } from "./cases.mjs";
import { EXTRA_POLICY } from "./cases-common.mjs";
import { paymentGate } from "./gate.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

// Recorded runs were made with these exact strings. Any change here invalidates them.
test("v1, v2 and FORMAT are unchanged, character for character", () => {
  assert.equal(AGENT_V1.length, 882);
  assert.equal(AGENT_V2.length, 2420);
  assert.equal(FORMAT.length, 356);
  assert.equal(sha(AGENT_V1), "bab1351bbd76fcdf9d923ea581bf9d0213164eb3d87da9316858d426a3da8dba");
  assert.equal(sha(AGENT_V2), "16f74c58633e65f4d3caa4971513bef4afca0e10800ccd2538f8441d106a3dcf");
  assert.equal(sha(FORMAT), "d8b6208ddff3ca29e27152ba5881867b8e0c79380af03e57b3eae45077f99fd9");
  assert.ok(FORMAT.includes("chosen from: send_pay_link, set_up_plan, place_hold, update_insurance, offer_financial_assistance, handoff_to_staff."));
  assert.ok(AGENT_V1.startsWith("You are the billing assistant for Northfield Medical Group."));
  assert.ok(AGENT_V2.includes("A remittance line carries group code CO (contractual obligation)."));
  assert.ok(!AGENT_V2.includes("send_document"));
  assert.deepEqual(ACTIONS, ["send_pay_link", "set_up_plan", "place_hold", "update_insurance", "offer_financial_assistance", "handoff_to_staff"]);
});

// The template v1/v2 runs were given, copied here so a change to buildAgentInput shows up.
function originalAgentInput(kase, transcript, view) {
  const convo = transcript.map((t) => `${t.role === "patient" ? "PATIENT" : "YOU"}: ${t.text}`).join("\n\n");
  return `PRACTICE POLICY
${JSON.stringify(PRACTICE_POLICY, null, 2)}

ACCOUNT RECORD
Patient: ${kase.patient}
${JSON.stringify(recordForView(kase, view), null, 2)}

CONVERSATION SO FAR
${convo}

Write your next reply to the patient.`;
}

test("the agent input without a gate is unchanged for every case and view", () => {
  const t = [
    { role: "patient", text: "hi" },
    { role: "agent", text: "Hello.", actions: ["place_hold"] },
    { role: "patient", text: "ok" },
  ];
  for (const kase of CASES) {
    for (const view of ["full", "statement", "feeds:remittance", "feeds:eligibility+ledger"]) {
      assert.equal(buildAgentInput(kase, t, view), originalAgentInput(kase, t, view), `${kase.id} ${view}`);
    }
  }
  // And the exact bytes the recorded runs saw, policy and records included.
  const hi = [{ role: "patient", text: "hi" }];
  const all = CASES.map((c) => buildAgentInput(c, hi, "full") + buildAgentInput(c, hi, "statement")).join("|");
  assert.equal(sha(all), "ae5ff1c7ec81b311b4c2fd4fa8dc29751f9ea3dad1000913927681b16370e2a0");
});

test("the product input carries the extra policy; the plain input does not", () => {
  const kase = CASES[0];
  const t = [{ role: "patient", text: kase.opener }];
  const plain = buildAgentInput(kase, t, "full");
  const product = buildAgentInput(kase, t, "full", paymentGate(kase.record));
  for (const k of Object.keys(EXTRA_POLICY)) {
    assert.ok(!plain.includes(`"${k}"`), k);
    assert.ok(product.includes(`"${k}"`), k);
  }
  assert.ok(product.indexOf('"texts_and_documents"') < product.indexOf("ACCOUNT RECORD"));
});

test("product actions are the six plus send_document, stop_messages and update_contact", () => {
  assert.deepEqual(PRODUCT_ACTIONS, [...ACTIONS, "send_document", "stop_messages", "update_contact"]);
  assert.ok(FORMAT_PRODUCT.includes("send_document, stop_messages, update_contact."));
  assert.ok(AGENT_PRODUCT.includes("- update_contact: save an email address"));
  assert.ok(AGENT_PRODUCT.includes("A receipt for a payment that has not posted yet needs no handoff"));
  assert.ok(AGENT_PRODUCT.includes("State what the practice's policy says and stop there."));
  assert.ok(AGENT_PRODUCT.includes("Do not offer plans longer or payments smaller than policy allows"));
  assert.ok(!AGENT_V2.includes("update_contact"));
  assert.ok(AGENT_PRODUCT.endsWith(FORMAT_PRODUCT));
  assert.ok(AGENT_PRODUCT.includes("PAYMENT GATE"));
  assert.ok(AGENT_PRODUCT.includes("If it says unverified, do not push for payment"));
  assert.ok(AGENT_PRODUCT.includes("not the patient: disclose nothing"));
});

test("parseAgentReply keeps the six by default and takes an allowed list", () => {
  const raw = "Sent.\nACTIONS: send_document, stop_messages, place_hold";
  assert.deepEqual(parseAgentReply(raw).actions, ["place_hold"]);
  assert.deepEqual(parseAgentReply(raw, PRODUCT_ACTIONS).actions, ["send_document", "stop_messages", "place_hold"]);
});

test("buildAgentInput adds the PAYMENT GATE block after the record when a gate is given", () => {
  const kase = CASES.find((c) => c.id === "timely-filing");
  const t = [{ role: "patient", text: kase.opener }];
  const gate = paymentGate(recordForView(kase, "full"));
  const withGate = buildAgentInput(kase, t, "full", gate);
  const without = buildAgentInput(kase, t, "full");
  assert.ok(!without.includes("PAYMENT GATE"));
  const at = withGate.indexOf("PAYMENT GATE");
  assert.ok(at > withGate.indexOf("ACCOUNT RECORD") && at < withGate.indexOf("CONVERSATION SO FAR"));
  assert.ok(withGate.includes("Status: not payable\nMay be collected now: $0.00\nReasons:\n- CO-29 on the full $318.00"));
  const unv = buildAgentInput(kase, t, "statement", paymentGate(recordForView(kase, "statement")));
  assert.ok(unv.includes("Status: unverified\nMay be collected now: not known"));
  // From the record on, removing the gate block gives back the plain input (the policy above differs).
  const fromRecord = (s) => s.slice(s.indexOf("ACCOUNT RECORD"));
  assert.equal(fromRecord(withGate).replace(/\n\nPAYMENT GATE[\s\S]*?(?=\n\nCONVERSATION SO FAR)/, ""), fromRecord(without));
});

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
