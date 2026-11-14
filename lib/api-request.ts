// Shared request handling for the app/api route handlers: rate limits, body parsing,
// input validation and error responses. Server-only.

import { CASES } from "./cases.mjs";
// Transcripts accept the product action names too; the v1/v2 prompts never see past actions.
import { PRODUCT_ACTIONS, AGENT_PROMPTS, FORMAT } from "./prompts.mjs";
import { isView } from "./feeds.mjs";
import { checkLimits, clientIp } from "./limits.mjs";
import type { Action, Case, Turn, View } from "./types";

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_CUSTOM_PROMPT = 6000;
export const MAX_PATIENT_MESSAGE = 600;
export const MAX_AGENT_MESSAGE = 2000;
export const MAX_TURNS = 10;

/** Thrown for anything the caller got wrong; turned into a JSON error response. */
export class ApiError extends Error {
  status: number;
  headers: Record<string, string>;
  constructor(status: number, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    return Response.json({ error: err.message }, { status: err.status, headers: err.headers });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error("[api] model call failed:", message);
  if (message.includes("ANTHROPIC_API_KEY is not set")) {
    return Response.json({ error: "The server is missing its API key, so it cannot run conversations right now." }, { status: 500 });
  }
  if (message.includes("returned 429") || message.includes("returned 529")) {
    return Response.json({ error: "The model is busy right now. Wait a minute and try again." }, { status: 503 });
  }
  return Response.json({ error: "The model call failed. Try again; if it keeps failing, use the saved bench results." }, { status: 502 });
}

/** Applies the per-IP and global limits. Throws a 429 ApiError when limited. */
export function enforceLimits(request: Request): void {
  const verdict = checkLimits(clientIp(request.headers));
  if (!verdict.ok) {
    throw new ApiError(429, verdict.message, { "Retry-After": String(verdict.retryAfterSeconds) });
  }
}

export async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(413, `Request body is too large. Keep it under ${MAX_BODY_BYTES / 1024} KB.`);
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Request body is not valid JSON. Send a JSON object with Content-Type: application/json.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}

export function resolveCase(body: Record<string, unknown>): Case {
  const { caseId } = body;
  if (typeof caseId !== "string" || !caseId) {
    throw new ApiError(400, "Missing caseId. Pass one of the case ids from the case list.");
  }
  const kase = (CASES as Case[]).find((c) => c.id === caseId);
  if (!kase) {
    throw new ApiError(400, `Unknown caseId "${caseId.slice(0, 40)}". Valid ids: ${CASES.map((c) => c.id).join(", ")}.`);
  }
  return kase;
}

/** How much of the record the agent sees. Optional, defaults to "full". */
export function resolveView(body: Record<string, unknown>): View {
  const { view } = body;
  if (view === undefined || view === null) return "full";
  if (!isView(view)) {
    throw new ApiError(400, 'view must be "full", "statement" or "feeds:" followed by feed ids joined with "+".');
  }
  return view as View;
}

/**
 * True when the caller asked for the product instructions (`version: "product"`), which run
 * with the payment gate. Throws if a custom prompt is sent alongside it.
 */
export function isProductRequest(body: Record<string, unknown>): boolean {
  if (body.version !== "product") return false;
  if (body.customPrompt !== undefined && body.customPrompt !== null) {
    throw new ApiError(400, 'Send exactly one of "version" ("v1", "v2" or "product") or "customPrompt".');
  }
  return true;
}

/**
 * Picks the agent system prompt: a saved version or the visitor's own prompt.
 * Exactly one of the two must be given. A custom prompt always gets the output
 * format block appended so the reply still parses into text + actions.
 * `version: "product"` is handled before this by isProductRequest.
 */
export function resolveSystemPrompt(body: Record<string, unknown>): string {
  const { version, customPrompt } = body;
  const hasVersion = version !== undefined && version !== null;
  const hasCustom = customPrompt !== undefined && customPrompt !== null;
  if (hasVersion === hasCustom) {
    throw new ApiError(400, 'Send exactly one of "version" ("v1", "v2" or "product") or "customPrompt".');
  }
  if (hasVersion) {
    if (version !== "v1" && version !== "v2") {
      throw new ApiError(400, 'version must be "v1", "v2" or "product".');
    }
    return AGENT_PROMPTS[version];
  }
  if (typeof customPrompt !== "string" || !customPrompt.trim()) {
    throw new ApiError(400, "customPrompt must be a non-empty string.");
  }
  if (customPrompt.length > MAX_CUSTOM_PROMPT) {
    throw new ApiError(400, `customPrompt is ${customPrompt.length} characters. Shorten it to ${MAX_CUSTOM_PROMPT} or fewer.`);
  }
  return `${customPrompt.trim()}\n\n${FORMAT}`;
}

/**
 * Validates a client-supplied transcript. `endsWith` says which role the last turn
 * must have: "patient" for /api/chat (the agent replies next), "agent" for /api/judge.
 */
export function validateTranscript(raw: unknown, endsWith: "patient" | "agent"): Turn[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(400, "transcript must be a non-empty array of turns.");
  }
  if (raw.length > MAX_TURNS) {
    throw new ApiError(400, `transcript has ${raw.length} turns. The limit is ${MAX_TURNS}; start a new conversation.`);
  }
  const turns: Turn[] = raw.map((t: unknown, i: number) => {
    if (!t || typeof t !== "object") throw new ApiError(400, `transcript[${i}] must be an object with role and text.`);
    const { role, text, actions } = t as Record<string, unknown>;
    if (role !== "patient" && role !== "agent") {
      throw new ApiError(400, `transcript[${i}].role must be "patient" or "agent".`);
    }
    if (typeof text !== "string" || !text.trim()) {
      throw new ApiError(400, `transcript[${i}].text must be a non-empty string.`);
    }
    const max = role === "patient" ? MAX_PATIENT_MESSAGE : MAX_AGENT_MESSAGE;
    if (text.length > max) {
      throw new ApiError(400, `transcript[${i}] is ${text.length} characters. ${role === "patient" ? "Patient messages" : "Agent messages"} are limited to ${max}.`);
    }
    if (role === "patient") return { role, text };
    const acts = Array.isArray(actions)
      ? (actions.filter((a) => typeof a === "string" && (PRODUCT_ACTIONS as string[]).includes(a)) as Action[])
      : [];
    return { role, text, actions: acts };
  });
  if (turns[0].role !== "patient") {
    throw new ApiError(400, "transcript must start with a patient turn.");
  }
  if (turns[turns.length - 1].role !== endsWith) {
    throw new ApiError(
      400,
      endsWith === "patient"
        ? "transcript must end with the patient's message the agent should answer."
        : "transcript must end with an agent reply before it can be judged."
    );
  }
  return turns;
}
