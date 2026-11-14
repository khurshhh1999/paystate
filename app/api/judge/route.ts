// POST /api/judge  { caseId, view?, transcript }  ->  { outcome, accurate, reason }

import { enforceLimits, errorResponse, readJsonBody, resolveCase, resolveView, validateTranscript } from "@/lib/api-request";
import { judge } from "@/lib/run.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    enforceLimits(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const view = resolveView(body);
    const transcript = validateTranscript(body.transcript, "agent");
    const verdict = await judge(kase, transcript, view);
    return Response.json(verdict);
  } catch (err) {
    return errorResponse(err);
  }
}
