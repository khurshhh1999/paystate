// POST /api/run-case  { caseId, version? | customPrompt?, view? }  ->  { transcript, verdict }
// Runs the scripted two-turn conversation for one case and grades it.
// Node runtime is the default; with cacheComponents on, a `runtime` export is not allowed.

import { checkRequest, clipReply, enforceLimits, errorResponse, readJsonBody, resolveAgent, resolveCase, resolveView } from "@/lib/api-request";
import { runCase } from "@/lib/run.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    checkRequest(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const view = resolveView(body);
    // The scripted run only exists for the bench versions and custom instructions.
    const agent = resolveAgent(body, { allowProduct: false });
    enforceLimits(request, "run-case", agent.kind === "custom");
    const trial = await runCase(kase, agent.systemPrompt, view);
    return Response.json({ ...trial, transcript: trial.transcript.map(clipReply) });
  } catch (err) {
    return errorResponse(err);
  }
}
