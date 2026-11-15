// Shared request handling for the app/api route handlers. Server-only.
// Order in every route: checkRequest (content type, origin), readJsonBody, full validation,
// then enforceLimits, then the model call. Only requests that will reach the model are counted.
// The validation itself is pure and lives in api-validate.mjs so it can be tested directly.

import { ApiError, checkRequestShape, parseBody } from "./api-validate.mjs";
import { COST, checkLimits, clientIp, type Route } from "./limits.mjs";
import { charged, checkBudget } from "./budget.mjs";

export {
  ApiError,
  MAX_CUSTOM_PROMPT,
  resolveAgent,
  resolveCase,
  resolveView,
  validateTranscript,
} from "./api-validate.mjs";

/**
 * Client errors carry our own message. Anything else (an upstream API error, a network
 * failure, a missing key) is logged on the server and the client gets a fixed sentence,
 * so upstream text, keys and file paths never reach the browser.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status, headers: err.headers });
  }
  const message = err instanceof Error ? err.message : String(err);
  const status = (err as { status?: unknown } | null)?.status;
  console.error("[api] request failed:", message);
  if (message.includes("ANTHROPIC_API_KEY is not set")) {
    return Response.json({ error: "Live conversations are not set up on this server. Recorded results still work." }, { status: 503 });
  }
  if (status === 429 || status === 529) {
    return Response.json({ error: "The model is busy right now. Wait a minute and try again." }, { status: 503 });
  }
  return Response.json({ error: "The model call failed. Try again; if it keeps failing, the recorded results still work." }, { status: 502 });
}

/** Content type, origin and declared size. Throws 415, 403 or 413. */
export function checkRequest(request: Request): void {
  checkRequestShape({
    contentType: request.headers.get("content-type"),
    origin: request.headers.get("origin"),
    host: request.headers.get("host"),
    contentLength: request.headers.get("content-length"),
  });
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  return parseBody(await request.text());
}

/**
 * Counts a validated request against the limits. Call it last, right before the model.
 * Throws a 429 ApiError with Retry-After when limited.
 */
export async function enforceLimits(request: Request, route: Route, custom = false): Promise<void> {
  // Switches for the deployment: set LIVE_CALLS=off to stop every model call, or
  // LIVE_CUSTOM_PROMPTS=off to stop only runs on a visitor's own instructions.
  if (process.env.LIVE_CALLS === "off") {
    throw new ApiError(503, "Live conversations are switched off right now. Recorded results on every page still work.");
  }
  if (custom && process.env.LIVE_CUSTOM_PROMPTS === "off") {
    throw new ApiError(503, "Runs with custom instructions are switched off right now. The saved instructions and all recorded results still work.");
  }
  // The day's dollar budget, shared by every instance, comes before the per-address counters.
  const budget = await checkBudget({ custom });
  if (!budget.ok) {
    throw new ApiError(
      429,
      budget.scope === "custom"
        ? "Runs with custom instructions have used today's budget for this site. They open again at midnight UTC. The saved instructions and all recorded results still work."
        : "Live conversations have used today's budget for this site, since each one costs money to run. They open again at midnight UTC. Recorded results on every page still work.",
      { "Retry-After": String(budget.retryAfterSeconds) },
    );
  }
  const verdict = checkLimits(clientIp(request.headers), { units: COST[route], custom });
  if (!verdict.ok) {
    throw new ApiError(429, verdict.message, { "Retry-After": String(verdict.retryAfterSeconds) });
  }
}

// A reply to a patient is a text message. Anything much longer is not one, so it is cut
// before it leaves the server; this also makes the routes poor value as a general model endpoint.
export const MAX_REPLY_CHARS = 1200;

export function clipReply<T extends { text: string }>(reply: T): T {
  return reply.text.length > MAX_REPLY_CHARS ? { ...reply, text: `${reply.text.slice(0, MAX_REPLY_CHARS).trimEnd()}…` } : reply;
}

/** Runs the model work of a request with its token cost charged to the daily budget. */
export { charged };
