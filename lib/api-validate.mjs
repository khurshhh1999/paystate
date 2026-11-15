// Request validation for the public API routes. Pure: no model calls, no counters, no
// Request objects, so it runs under `node --test`. lib/api-request.ts wraps it for the
// route handlers. Everything here runs before a request is counted against the limits.

import { CASES } from "./cases.mjs";
// Transcripts accept the product action names too; the v1/v2 prompts never see past actions.
import { PRODUCT_ACTIONS, AGENT_PROMPTS, FORMAT } from "./prompts.mjs";
import { isView } from "./feeds.mjs";

export const MAX_BODY_BYTES = 64 * 1024;
// The longest built-in instructions (the product version) are about 3,500 characters and v2
// is about 2,400. 4,000 leaves room to edit either and add a few paragraphs of your own.
export const MAX_CUSTOM_PROMPT = 4000;
export const MAX_PATIENT_MESSAGE = 600;
export const MAX_AGENT_MESSAGE = 2000;
export const MAX_TURNS = 10;

/** Thrown for anything the caller got wrong; turned into a JSON error response. */
export class ApiError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

function hostnameOf(host) {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return "";
  }
}

/**
 * Checks the parts of a request that need no body: JSON content type, same-origin caller,
 * declared size. A JSON content type forces a CORS preflight on cross-site fetches, and a
 * browser always sends Origin on a cross-site POST, so a page on another site cannot spend
 * calls here. Requests without an Origin (curl, server-to-server) are allowed through and
 * still hit the limits.
 */
export function checkRequestShape({ contentType, origin, host, contentLength }) {
  const media = (contentType ?? "").split(";")[0].trim().toLowerCase();
  if (media !== "application/json") {
    throw new ApiError(415, "Send the request body as JSON with Content-Type: application/json.");
  }
  if (origin !== null && origin !== undefined) {
    let originHost = "";
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      // "null" or junk: treated as a foreign origin.
    }
    const ownHost = (host ?? "").toLowerCase();
    const local = LOOPBACK.has(hostnameOf(originHost)) && LOOPBACK.has(hostnameOf(ownHost));
    if (!originHost || (originHost !== ownHost && !local)) {
      throw new ApiError(403, "Requests from other sites are not accepted.");
    }
  }
  const declared = Number(contentLength);
  if (contentLength && Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError(413, `Request body is too large. Keep it under ${MAX_BODY_BYTES / 1024} KB.`);
  }
}

/** Parses a JSON object body from text. */
export function parseBody(text) {
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(413, `Request body is too large. Keep it under ${MAX_BODY_BYTES / 1024} KB.`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Request body is not valid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "Request body must be a JSON object.");
  }
  return body;
}

export function resolveCase(body) {
  const { caseId } = body;
  if (typeof caseId !== "string" || !caseId) {
    throw new ApiError(400, "Missing caseId. Pass one of the case ids from the case list.");
  }
  const kase = CASES.find((c) => c.id === caseId);
  if (!kase) {
    throw new ApiError(400, `Unknown caseId. Valid ids: ${CASES.map((c) => c.id).join(", ")}.`);
  }
  return kase;
}

/** How much of the record the agent sees. Optional, defaults to "full". */
export function resolveView(body) {
  const { view } = body;
  if (view === undefined || view === null) return "full";
  if (!isView(view)) {
    throw new ApiError(400, 'view must be "full", "statement" or "feeds:" followed by feed ids joined with "+".');
  }
  return view;
}

const ONE_OF = 'Send exactly one of "version" ("v1", "v2" or "product") or "customPrompt".';

/**
 * Which instructions the agent runs with. Exactly one of `version` or `customPrompt`.
 * Returns { kind: "product" } (product instructions with the payment gate),
 * { kind: "saved", systemPrompt } for v1/v2, or { kind: "custom", systemPrompt }.
 * A custom prompt always gets the output format block appended so the reply still
 * parses into text and actions. `allowProduct` is false where the route has no product path.
 */
export function resolveAgent(body, { allowProduct = true } = {}) {
  const { version, customPrompt } = body;
  const hasVersion = version !== undefined && version !== null;
  const hasCustom = customPrompt !== undefined && customPrompt !== null;
  if (hasVersion === hasCustom) throw new ApiError(400, ONE_OF);
  if (hasVersion) {
    if (version === "product" && allowProduct) return { kind: "product" };
    if (version !== "v1" && version !== "v2") {
      throw new ApiError(400, allowProduct ? 'version must be "v1", "v2" or "product".' : 'version must be "v1" or "v2".');
    }
    return { kind: "saved", systemPrompt: AGENT_PROMPTS[version] };
  }
  if (typeof customPrompt !== "string" || !customPrompt.trim()) {
    throw new ApiError(400, "customPrompt must be a non-empty string.");
  }
  if (customPrompt.length > MAX_CUSTOM_PROMPT) {
    throw new ApiError(
      400,
      `Custom instructions are ${customPrompt.length.toLocaleString("en-US")} characters. The limit is ${MAX_CUSTOM_PROMPT.toLocaleString("en-US")}.`,
    );
  }
  return { kind: "custom", systemPrompt: `${customPrompt.trim()}\n\n${FORMAT}` };
}

/**
 * Validates a client-supplied transcript. `endsWith` says which role the last turn
 * must have: "patient" for /api/chat (the agent replies next), "agent" for /api/judge.
 */
export function validateTranscript(raw, endsWith) {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ApiError(400, "transcript must be a non-empty array of turns.");
  }
  if (raw.length > MAX_TURNS) {
    throw new ApiError(400, `transcript has ${raw.length} turns. The limit is ${MAX_TURNS}; start a new conversation.`);
  }
  const turns = raw.map((t, i) => {
    if (!t || typeof t !== "object" || Array.isArray(t)) {
      throw new ApiError(400, `transcript[${i}] must be an object with role and text.`);
    }
    const { role, text, actions } = t;
    if (role !== "patient" && role !== "agent") {
      throw new ApiError(400, `transcript[${i}].role must be "patient" or "agent".`);
    }
    if (typeof text !== "string" || !text.trim()) {
      throw new ApiError(400, `transcript[${i}].text must be a non-empty string.`);
    }
    const max = role === "patient" ? MAX_PATIENT_MESSAGE : MAX_AGENT_MESSAGE;
    if (text.length > max) {
      throw new ApiError(
        400,
        `transcript[${i}] is ${text.length} characters. ${role === "patient" ? "Patient messages" : "Agent messages"} are limited to ${max}.`,
      );
    }
    if (role === "patient") return { role, text };
    const acts = Array.isArray(actions) ? actions.filter((a) => typeof a === "string" && PRODUCT_ACTIONS.includes(a)) : [];
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
        : "transcript must end with an agent reply before it can be judged.",
    );
  }
  return turns;
}
