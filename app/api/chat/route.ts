// POST /api/chat  { caseId, version? | customPrompt?, view?, transcript }  ->  { text, actions }
// The visitor plays the patient; the transcript ends with their message and the
// agent replies once.

import { enforceLimits, errorResponse, readJsonBody, resolveCase, resolveView, resolveSystemPrompt, validateTranscript } from "@/lib/api-request";
import { agentTurn } from "@/lib/run.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    enforceLimits(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const view = resolveView(body);
    const systemPrompt = resolveSystemPrompt(body);
    const transcript = validateTranscript(body.transcript, "patient");
    const reply = await agentTurn(kase, systemPrompt, transcript, view);
    return Response.json(reply);
  } catch (err) {
    return errorResponse(err);
  }
}
