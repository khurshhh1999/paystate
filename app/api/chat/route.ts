// POST /api/chat  { caseId, version? | customPrompt?, view?, transcript }
//   version "v1" | "v2" | customPrompt  ->  { text, actions }
//   version "product"                    ->  { text, actions, gate }
// The visitor plays the patient; the transcript ends with their message and the
// agent replies once. "product" runs with the payment gate.

import {
  clipReply,
  checkRequest,
  enforceLimits,
  errorResponse,
  readJsonBody,
  resolveAgent,
  resolveCase,
  resolveView,
  validateTranscript,
} from "@/lib/api-request";
import { agentTurn, productTurn } from "@/lib/run.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const view = resolveView(body);
    const agent = resolveAgent(body);
    const transcript = validateTranscript(body.transcript, "patient");
    enforceLimits(request, "chat", agent.kind === "custom");
    if (agent.kind === "product") return Response.json(clipReply(await productTurn(kase, transcript, view)));
    return Response.json(clipReply(await agentTurn(kase, agent.systemPrompt, transcript, view)));
  } catch (err) {
    return errorResponse(err);
  }
}
