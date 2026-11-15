// POST /api/ticket  { caseId, transcript }  ->  the work item billing staff receive
// Called once a conversation has handed off. The transcript must end with an agent turn.

import { ApiError, checkRequest, enforceLimits, errorResponse, readJsonBody, resolveCase, validateTranscript } from "@/lib/api-request";
import { MODEL } from "@/lib/run.mjs";
import { needsTicket, writeTicket } from "@/lib/tickets.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const transcript = validateTranscript(body.transcript, "agent");
    if (!needsTicket(transcript)) {
      throw new ApiError(400, "This conversation has no handoff to staff, so there is nothing to put in the queue.");
    }
    enforceLimits(request, "ticket");
    return Response.json(await writeTicket(kase, transcript, MODEL));
  } catch (err) {
    return errorResponse(err);
  }
}
