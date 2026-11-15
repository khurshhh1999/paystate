// Minimal Messages API client. Plain fetch, no SDK, so the same file runs in the
// bench script (node) and in the route handlers.

import { reportUsage } from "./budget.mjs";

const API_URL = "https://api.anthropic.com/v1/messages";
const RETRY_STATUSES = new Set([429, 500, 529]);
const MAX_TRIES = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every HTTP attempt this process makes, retries included. Scripts with a budget set a cap;
// once it is reached, callClaude throws (code "CALL_CAP") instead of sending anything.
let calls = 0;
let cap = Infinity;

export function callStats() {
  return { calls };
}

/** n: the most attempts this process may make. null or Infinity removes the cap. */
export function setCallCap(n) {
  cap = n === null || n === undefined ? Infinity : n;
}

function capReached() {
  const err = new Error(`Model call cap of ${cap} reached.`);
  err.code = "CALL_CAP";
  return err;
}

/**
 * One single-turn call. Returns the concatenated text blocks.
 * `temperature` is only sent when given; some models reject non-default values.
 * `thinking` is passed through as-is when given. When it is not given and the model is
 * claude-sonnet-5-5, thinking is turned off with {type: "between_tools"}: that model
 * thinks by default, and at a 400-token cap the thinking used up the budget and cut
 * the visible reply off mid-sentence (and dropped the ACTIONS line).
 * claude-opus-5-5 (the default) always thinks and rejects any way of turning it off, so no
 * `thinking` field is sent for it. Its depth is set with output_config.effort (`effort`,
 * default "low") instead, and since thinking tokens count toward max_tokens, the cap is raised
 * to at least 2000 so the visible reply is not cut off. Replies stay short because the
 * prompts ask for short replies, not because of the cap.
 */
export async function callClaude({ system, user, maxTokens = 400, model = "claude-opus-5-5", temperature, thinking, effort }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local or the deployment's environment variables.");
  }

  const opus = model.startsWith("claude-opus-5-5");
  const outLimit = opus ? Math.max(maxTokens, 2000) : maxTokens;
  const body = { model, max_tokens: outLimit, system, messages: [{ role: "user", content: user }] };
  if (temperature !== undefined) body.temperature = temperature;
  if (opus) body.output_config = { effort: effort ?? "low" };
  else if (thinking !== undefined) body.thinking = thinking;
  else if (model === "claude-sonnet-5-5") body.thinking = { type: "between_tools" };

  let lastError;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    if (calls >= cap) throw capReached();
    calls++;
    let res;
    try {
      res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // Network failure: treat like a retryable server error.
      lastError = new Error(`Could not reach the Anthropic API: ${err.message}`);
      if (attempt < MAX_TRIES) {
        await sleep(backoff(attempt));
        continue;
      }
      throw lastError;
    }

    if (res.ok) {
      const data = await res.json();
      await reportUsage(model, data.usage);
      if (data.stop_reason === "refusal") {
        throw new Error("The model declined to answer this request.");
      }
      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (data.stop_reason === "max_tokens") {
        throw new Error(`The model's reply was cut off at ${outLimit} tokens. Raise maxTokens or shorten the prompt.`);
      }
      if (!text.trim()) {
        throw new Error(`The model returned no text (stop_reason: ${data.stop_reason}).`);
      }
      return text;
    }

    const detail = await res.text().catch(() => "");
    lastError = new Error(`Anthropic API returned ${res.status}: ${detail.slice(0, 300)}`);
    lastError.status = res.status;
    if (!RETRY_STATUSES.has(res.status) || attempt === MAX_TRIES) throw lastError;

    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : backoff(attempt));
  }
  throw lastError;
}

// 1s, 2s, 4s plus jitter.
function backoff(attempt) {
  return 1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 400);
}
