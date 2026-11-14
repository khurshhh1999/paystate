// Unscripted conversations for the traffic set: a simulated patient replies to the product
// assistant for up to three patient messages, then a judge grades the outcome.
// Used by scripts/run-traffic.mjs.

import { callClaude } from "./anthropic.mjs";
import { PRACTICE_POLICY } from "./cases.mjs";
import { EXTRA_POLICY } from "./cases-common.mjs";
import { paymentGate } from "./gate.mjs";
import { JUDGE_SYSTEM, parseVerdict, recordForView } from "./prompts.mjs";
import { MODEL, productTurn } from "./run.mjs";

export const PATIENT_SYSTEM = `You are playing a real person texting a medical practice's billing line about a bill. You are not an assistant and you are not helping anyone. You are the customer.

You are given who you are, how you write (your persona), what you want (your goal), and what you know: a few messages in your own words that describe your situation. That is everything you know. You have never seen the practice's system, you do not know billing codes, claim notes, or what the practice's records say, and you do not know anything the billing assistant has not told you.

Write your next text message to the billing assistant.
- Write like a real text: usually one or two short sentences, often less. Use your persona's voice, spelling and punctuation, including lower case or typos if that is how you write.
- Pursue your goal. React to what the assistant actually said in its last message: answer its question, push back, or ask about what it did not cover.
- Do not repeat your first message. Move the conversation on.
- What you know is background, not a script. Do not paste those lines; say what you would say now, in reply to this message, in fresh words. Facts you need (a name, a number) stay exactly as given.
- Stay in character. Do not be more cooperative, patient or organised than your persona. Do not thank the assistant at length, summarise what it said, or offer help.
- Never contradict what you know. You may add small everyday details a person in your position would plausibly have (a date you paid, the name of your insurance) but only when asked for them, or when your persona would naturally volunteer them.
- Do not use billing jargon you would not know. Say "the bill" or "insurance", not "remittance" or "CO-29".

Decide whether you would reply at all. Set "done" to true, with empty text, when:
- your goal is met (what would make you stop replying has happened), or
- you have given up, or
- the only thing left to send is a sign-off like "ok thanks" or "bye".
If you have sent only one message so far, lean toward replying. Most people answer a first reply at least once: to push back, to try again for what they wanted, or to ask the thing they still care about. If your goal says you keep asking for something, ask again. Stop after one message only when a real person would have nothing left to send, such as after an opt-out is confirmed.

Return only a JSON object, no prose, no code fence:
{"done": true | false, "text": "your next message, or empty when done"}`;

function patientInput(kase, transcript) {
  const known = [kase.opener, kase.followup].filter(Boolean).map((t) => `- "${t}"`).join("\n");
  const convo = transcript
    .map((t) => `${t.role === "patient" ? "YOU" : "BILLING ASSISTANT"}: ${t.text}`)
    .join("\n\n");
  return `WHO YOU ARE
The account at Northfield Medical Group is in the name of ${kase.patient}. You are the person texting from the number the practice has on file; unless what you know says otherwise, that person is you.

YOUR PERSONA
${kase.persona}

YOUR GOAL
${kase.goal}

WHAT YOU KNOW
Your situation, as you would put it. The first line is the message you already sent. Everything else about your account is unknown to you.
${known}

CONVERSATION SO FAR
${convo}

You have sent ${transcript.filter((t) => t.role === "patient").length} message(s) so far.

Write your next message, or say you are done.`;
}

/** Reads {"done", "text"} from the patient model's reply. Tolerates code fences and stray prose. */
export function parsePatientReply(raw) {
  const m = String(raw).match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Patient reply had no JSON: " + String(raw).slice(0, 200));
  let v;
  try {
    v = JSON.parse(m[0]);
  } catch {
    throw new Error("Patient reply was not valid JSON: " + m[0].slice(0, 200));
  }
  if (typeof v.done !== "boolean") throw new Error("Patient reply has no done flag.");
  const text = typeof v.text === "string" ? v.text.trim() : "";
  if (v.done) return { done: true, text: "" };
  if (!text) throw new Error("Patient reply is not done but has no text.");
  return { done: false, text };
}

// Runs one model call and counts it against the conversation, whether it succeeded or failed.
// A call refused by the cap sent nothing, so it does not count.
async function track(counter, fn) {
  try {
    const out = await fn();
    counter.calls++;
    return out;
  } catch (err) {
    if (err?.code !== "CALL_CAP") counter.calls++;
    throw err;
  }
}

/** The patient's next message. One call, retried once if the reply does not parse. */
export async function patientTurn(kase, transcript, counter = { calls: 0 }) {
  const user = patientInput(kase, transcript);
  let lastError;
  for (let i = 0; i < 2; i++) {
    const raw = await track(counter, () => callClaude({ system: PATIENT_SYSTEM, user, maxTokens: 200, model: MODEL }));
    try {
      return parsePatientReply(raw);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function gateBlock(gate) {
  const owed = gate.owed === null || gate.owed === undefined ? "not known" : `$${gate.owed.toFixed(2)}`;
  const reasons = (gate.reasons ?? []).map((r) => `- ${r}`).join("\n") || "- none given";
  return `Status: ${gate.status.replace("_", " ")}
May be collected now: ${owed}
Reasons:
${reasons}`;
}

/** Judge input for an unscripted product conversation, always on the full record. */
export function buildTrafficJudgeInput(kase, transcript) {
  const gate = paymentGate(recordForView(kase, "full"));
  const convo = transcript
    .map((t) => {
      if (t.role === "patient") return `PATIENT: ${t.text}`;
      const acts = t.actions && t.actions.length ? t.actions.join(", ") : "none";
      const removed = t.gate?.removed?.length ? `\n[removed by gate: ${t.gate.removed.join(", ")}]` : "";
      return `ASSISTANT: ${t.text}\n[actions taken: ${acts}]${removed}`;
    })
    .join("\n\n");
  return `PRACTICE POLICY
${JSON.stringify({ ...PRACTICE_POLICY, ...EXTRA_POLICY }, null, 2)}

ACCOUNT RECORD
Patient: ${kase.patient}
Statement balance: $${kase.balance.toFixed(2)}
${JSON.stringify(kase.record, null, 2)}

PAYMENT GATE
The practice's rules computed this from the full record, and the assistant was given it as a fact with the record.
${gateBlock(gate)}

ANSWER KEY
${JSON.stringify(kase.truth, null, 2)}

HOW THIS CONVERSATION RAN
The patient was not scripted. The conversation may be one to three patient messages long and ended when the patient stopped replying or ran out of turns; grade the outcome at the point it ended. Besides the six usual actions the assistant can also take send_document (sends a receipt or itemized statement) stop_messages (stops texts to this number; paper statements continue) and update_contact (saves an email address or corrected phone number the patient gives). A collect action marked "[removed by gate: ...]" on a turn was taken out by the practice's rules and did not happen. But if the assistant's words asked for, encouraged or agreed to payment of money the answer key says is not owed, that is still a wrong collect.

TRANSCRIPT
${convo}`;
}

/** Grades one traffic conversation. Retries once if the verdict does not parse. */
export async function judgeTraffic(kase, transcript, counter = { calls: 0 }) {
  const user = buildTrafficJudgeInput(kase, transcript);
  let lastError;
  for (let i = 0; i < 2; i++) {
    const raw = await track(counter, () => callClaude({ system: JUDGE_SYSTEM, user, maxTokens: 400, model: MODEL }));
    try {
      return parseVerdict(raw);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

const countedProductTurn = (kase, transcript, view, counter) => track(counter, () => productTurn(kase, transcript, view));

const DEFAULT_DEPS = { productTurn: countedProductTurn, patientTurn, judge: judgeTraffic };

/**
 * One unscripted conversation: the opener verbatim, then assistant and simulated patient in
 * turn until the patient stops or has sent maxPatientTurns messages, then one judge call.
 * Worst case with three patient turns: 3 assistant + 2 patient + 1 judge = 6 calls (more only
 * if a reply fails to parse and is retried).
 * `calls` counts the model calls this conversation made. HTTP retries inside callClaude are
 * not visible here; callStats() has those.
 * `deps` replaces the model-calling functions in tests.
 */
export async function runTrafficCase(kase, { view = "full", maxPatientTurns = 3 } = {}, deps = DEFAULT_DEPS, counter = { calls: 0 }) {
  const d = { ...DEFAULT_DEPS, ...deps };
  const transcript = [{ role: "patient", text: kase.opener }];
  let patientTurns = 1;
  let firstGate = null;
  for (;;) {
    const reply = await d.productTurn(kase, transcript, view, counter);
    firstGate ??= reply.gate;
    transcript.push({ role: "agent", text: reply.text, actions: reply.actions, gate: reply.gate });
    if (patientTurns >= maxPatientTurns) break;
    const next = await d.patientTurn(kase, transcript, counter);
    if (next.done) break;
    transcript.push({ role: "patient", text: next.text });
    patientTurns++;
  }
  const verdict = await d.judge(kase, transcript, counter);
  return { transcript, verdict, gate: firstGate, calls: counter.calls };
}
