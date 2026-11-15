// POST /api/judge  { caseId, view?, transcript }  ->  { outcome, accurate, reason }

import { charged, checkRequest, enforceLimits, errorResponse, readJsonBody, resolveCase, resolveView, validateTranscript } from "@/lib/api-request";
import { judge } from "@/lib/run.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const view = resolveView(body);
    const transcript = validateTranscript(body.transcript, "agent");
    await enforceLimits(request, "judge");
    return Response.json(await charged(false, () => judge(kase, transcript, view)));
  } catch (err) {
    return errorResponse(err);
  }
}
