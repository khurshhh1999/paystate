// Shared request handling for the app/api route handlers. Server-only.
// Order in every route: checkRequest (content type, origin), readJsonBody, full validation,
// then enforceLimits, then the model call. Only requests that will reach the model are counted.
// The validation itself is pure and lives in api-validate.mjs so it can be tested directly.

import { ApiError, checkRequestShape, parseBody } from "./api-validate.mjs";
import { COST, checkLimits, clientIp, type Route } from "./limits.mjs";

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
export function enforceLimits(request: Request, route: Route, custom = false): void {
  const verdict = checkLimits(clientIp(request.headers), { units: COST[route], custom });
  if (!verdict.ok) {
    throw new ApiError(429, verdict.message, { "Retry-After": String(verdict.retryAfterSeconds) });
  }
}
