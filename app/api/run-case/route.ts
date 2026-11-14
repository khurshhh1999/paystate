// POST /api/run-case  { caseId, version? | customPrompt?, view? }  ->  { transcript, verdict }
// Runs the scripted two-turn conversation for one case and grades it.
// Node runtime is the default; with cacheComponents on, a `runtime` export is not allowed.

import { enforceLimits, errorResponse, readJsonBody, resolveCase, resolveView, resolveSystemPrompt } from "@/lib/api-request";
import { runCase } from "@/lib/run.mjs";

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    enforceLimits(request);
    const body = await readJsonBody(request);
    const kase = resolveCase(body);
    const view = resolveView(body);
    const systemPrompt = resolveSystemPrompt(body);
    const trial = await runCase(kase, systemPrompt, view);
    return Response.json(trial);
  } catch (err) {
    return errorResponse(err);
  }
}
