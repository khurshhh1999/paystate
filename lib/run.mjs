// One conversation end to end: scripted patient, agent under test, judge.
// Used by scripts/run-bench.mjs and the API routes.

import { callClaude } from "./anthropic.mjs";
import {
  buildAgentInput,
  parseAgentReply,
  JUDGE_SYSTEM,
  buildJudgeInput,
  parseVerdict,
  AGENT_PRODUCT,
  PRODUCT_ACTIONS,
  recordForView,
} from "./prompts.mjs";
import { enforceGate, paymentGate } from "./gate.mjs";

// The live product (patient page, prompt lab, traffic set) runs on MODEL. The recorded bench in
// data/results.json ran on BENCH_MODEL with thinking off (callClaude turns it off for that model),
// agent and judge alike; scripts/run-bench.mjs passes it so a rerun reproduces those conditions.
export const MODEL = "claude-opus-5-5";
export const BENCH_MODEL = "claude-sonnet-5-5";

/** Next agent reply given the conversation so far (which should end with a patient turn). */
export async function agentTurn(kase, systemPrompt, transcript, view = "full", model = MODEL) {
  const raw = await callClaude({ system: systemPrompt, user: buildAgentInput(kase, transcript, view), maxTokens: 400, model });
  return parseAgentReply(raw);
}

/**
 * One reply under the product instructions. The gate is computed on the record as the
 * assistant sees it, shown to the model, and enforced after: a collect action on a balance
 * the gate blocks (gate.block) is removed and reported in gate.removed.
 */
export async function productTurn(kase, transcript, view = "full") {
  const decided = paymentGate(recordForView(kase, view));
  const raw = await callClaude({
    system: AGENT_PRODUCT,
    user: buildAgentInput(kase, transcript, view, decided),
    maxTokens: 400,
    model: MODEL,
  });
  const reply = parseAgentReply(raw, PRODUCT_ACTIONS);
  const { actions, removed } = enforceGate(reply.actions, decided);
  return { text: reply.text, actions, gate: { ...decided, removed } };
}

/** Grade a finished conversation. Retries once if the judge's output does not parse. */
export async function judge(kase, transcript, view = "full", model = MODEL) {
  const input = buildJudgeInput(kase, transcript, view);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callClaude({ system: JUDGE_SYSTEM, user: input, maxTokens: 400, model });
    try {
      return parseVerdict(raw);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

/** Opener, agent, follow-up, agent, then the judge. `model` is used for both agent and judge. */
export async function runCase(kase, systemPrompt, view = "full", model = MODEL) {
  const transcript = [{ role: "patient", text: kase.opener }];
  const first = await agentTurn(kase, systemPrompt, transcript, view, model);
  transcript.push({ role: "agent", text: first.text, actions: first.actions });
  transcript.push({ role: "patient", text: kase.followup });
  const second = await agentTurn(kase, systemPrompt, transcript, view, model);
  transcript.push({ role: "agent", text: second.text, actions: second.actions });
  const verdict = await judge(kase, transcript, view, model);
  return { transcript, verdict };
}
