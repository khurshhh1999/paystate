import { test } from "node:test";
import assert from "node:assert/strict";
import { EXTRA_POLICY } from "./cases-common.mjs";
import { TRAFFIC_CASES } from "./traffic.mjs";
import { parsePatientReply, buildTrafficJudgeInput, runTrafficCase, PATIENT_SYSTEM } from "./simulate.mjs";

const byId = (id) => TRAFFIC_CASES.find((c) => c.id === id);

test("patient reply: plain JSON", () => {
  assert.deepEqual(parsePatientReply('{"done": false, "text": "how much do i owe"}'), { done: false, text: "how much do i owe" });
});

test("patient reply: inside a code fence with prose around it", () => {
  const raw = 'Here you go:\n```json\n{"done": false, "text": " ok what date "}\n```';
  assert.deepEqual(parsePatientReply(raw), { done: false, text: "ok what date" });
});

test("patient reply: done true drops any text", () => {
  assert.deepEqual(parsePatientReply('{"done": true, "text": "ok thanks"}'), { done: true, text: "" });
});

test("patient reply: junk throws", () => {
  assert.throws(() => parsePatientReply("sure, I can help with that"));
  assert.throws(() => parsePatientReply('{"done": false, "text": "unterminated'));
  assert.throws(() => parsePatientReply('{"text": "no flag"}'));
  assert.throws(() => parsePatientReply('{"done": false, "text": ""}'));
});

test("patient instructions ask for JSON only and a stop signal", () => {
  assert.match(PATIENT_SYSTEM, /"done"/);
  assert.match(PATIENT_SYSTEM, /not an assistant/);
});

test("traffic judge input carries answer key, gate, extra policy and removed actions", () => {
  const kase = byId("timely-filing");
  const transcript = [
    { role: "patient", text: kase.opener },
    {
      role: "agent",
      text: "Here is a link to pay.",
      actions: ["place_hold"],
      gate: { status: "not_payable", owed: 0, reasons: ["x"], removed: ["send_pay_link"] },
    },
  ];
  const input = buildTrafficJudgeInput(kase, transcript);
  assert.ok(input.includes(kase.truth.right_move), "answer key");
  assert.ok(input.includes(kase.truth.fail_if), "fail_if");
  assert.match(input, /PAYMENT GATE\n[\s\S]*Status: not payable\nMay be collected now: \$0\.00/);
  assert.match(input, /CO-29/);
  for (const v of Object.values(EXTRA_POLICY)) assert.ok(input.includes(JSON.stringify(v)), "extra policy");
  assert.match(input, /\[actions taken: place_hold\]\n\[removed by gate: send_pay_link\]/);
  assert.match(input, /send_document/);
  assert.match(input, /stop_messages/);
  assert.match(input, /one to three patient messages/);
});

test("traffic judge input does not mark turns with nothing removed", () => {
  const kase = byId("balance-question");
  const input = buildTrafficJudgeInput(kase, [
    { role: "patient", text: kase.opener },
    { role: "agent", text: "It is your copay.", actions: [], gate: { status: "payable", owed: 45, reasons: [], removed: [] } },
  ]);
  assert.ok(!input.split("TRANSCRIPT\n")[1].includes("[removed by gate:"));
  assert.match(input, /Status: payable\nMay be collected now: \$45\.00/);
});

// Fake model functions: each counts one call, as the real ones do.
function fakes({ patientReplies }) {
  const seen = { product: 0, patient: 0, judge: 0 };
  const replies = [...patientReplies];
  return {
    seen,
    deps: {
      productTurn: async (kase, transcript, view, counter) => {
        counter.calls++;
        seen.product++;
        assert.equal(transcript[transcript.length - 1].role, "patient");
        return { text: `reply ${seen.product}`, actions: ["place_hold"], gate: { status: "payable", owed: 1, reasons: [], removed: [] } };
      },
      patientTurn: async (kase, transcript, counter) => {
        counter.calls++;
        seen.patient++;
        return replies.shift();
      },
      judge: async (kase, transcript, counter) => {
        counter.calls++;
        seen.judge++;
        return { outcome: "resolved", accurate: true, reason: "ok" };
      },
    },
  };
}

test("loop: patient keeps going, stops at three patient turns, worst case six calls", async () => {
  const kase = byId("timely-filing");
  const { deps, seen } = fakes({ patientReplies: [{ done: false, text: "two" }, { done: false, text: "three" }] });
  const out = await runTrafficCase(kase, {}, deps);
  assert.deepEqual(out.transcript.map((t) => t.role), ["patient", "agent", "patient", "agent", "patient", "agent"]);
  assert.equal(out.transcript[0].text, kase.opener);
  assert.deepEqual(out.transcript.filter((t) => t.role === "patient").map((t) => t.text), [kase.opener, "two", "three"]);
  assert.deepEqual(seen, { product: 3, patient: 2, judge: 1 });
  assert.equal(out.calls, 6);
  assert.ok(out.transcript[1].gate && Array.isArray(out.transcript[1].actions));
  assert.equal(out.verdict.outcome, "resolved");
});

test("loop: patient done after the first reply ends it there", async () => {
  const { deps, seen } = fakes({ patientReplies: [{ done: true, text: "" }] });
  const out = await runTrafficCase(byId("stop-texts"), {}, deps);
  assert.deepEqual(out.transcript.map((t) => t.role), ["patient", "agent"]);
  assert.deepEqual(seen, { product: 1, patient: 1, judge: 1 });
  assert.equal(out.calls, 3);
});

test("loop: maxPatientTurns 1 makes no patient call", async () => {
  const { deps, seen } = fakes({ patientReplies: [] });
  const out = await runTrafficCase(byId("stop-texts"), { maxPatientTurns: 1 }, deps);
  assert.equal(out.transcript.length, 2);
  assert.deepEqual(seen, { product: 1, patient: 0, judge: 1 });
});

test("loop: concurrent conversations count their own calls", async () => {
  const a = fakes({ patientReplies: [{ done: false, text: "x" }, { done: true, text: "" }] });
  const b = fakes({ patientReplies: [{ done: true, text: "" }] });
  const [ra, rb] = await Promise.all([runTrafficCase(byId("deductible"), {}, a.deps), runTrafficCase(byId("hardship"), {}, b.deps)]);
  assert.equal(ra.calls, 5);
  assert.equal(rb.calls, 3);
});

test("loop: an error from a model call propagates", async () => {
  const { deps } = fakes({ patientReplies: [] });
  const err = Object.assign(new Error("cap"), { code: "CALL_CAP" });
  await assert.rejects(runTrafficCase(byId("deductible"), {}, { ...deps, patientTurn: async () => Promise.reject(err) }), /cap/);
});
