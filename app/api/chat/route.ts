// POST /api/chat  { caseId, version? | customPrompt?, view?, transcript }
//   version "v1" | "v2" | customPrompt  ->  { text, actions }
//   version "product"                    ->  { text, actions, gate }
// The visitor plays the patient; the transcript ends with their message and the
// agent replies once. "product" runs with the payment gate.

import {
  enforceLimits,
  errorResponse,
  isProductRequest,
  readJsonBody,
  resolveCase,
  resolveView,
  resolveSystemPrompt,
  validateTranscript,
} from "@/lib/api-request";
import { agentTurn, productTurn } from "@/lib/run.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    enforceLimits(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const view = resolveView(body);
    if (isProductRequest(body)) {
      const transcript = validateTranscript(body.transcript, "patient");
      return Response.json(await productTurn(kase, transcript, view));
    }
    const systemPrompt = resolveSystemPrompt(body);
    const transcript = validateTranscript(body.transcript, "patient");
    const reply = await agentTurn(kase, systemPrompt, transcript, view);
    return Response.json(reply);
  } catch (err) {
    return errorResponse(err);
  }
}
