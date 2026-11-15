// POST /api/judge  { caseId, view?, transcript }  ->  { outcome, accurate, reason }

import { checkRequest, enforceLimits, errorResponse, readJsonBody, resolveCase, resolveView, validateTranscript } from "@/lib/api-request";
import { judge } from "@/lib/run.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const view = resolveView(body);
    const transcript = validateTranscript(body.transcript, "agent");
    enforceLimits(request, "judge");
    return Response.json(await judge(kase, transcript, view));
  } catch (err) {
    return errorResponse(err);
  }
}
