// Abuse limits for the public API routes, which spend a personal API key.
//
// These limits live in memory, so they are per server instance and best effort.
// On Vercel each warm function instance keeps its own counters, a cold start resets
// them, and several instances can run at once. They stop casual hammering of a single
// instance; they are not a hard cap on total spend. Set a spend limit on the API key
// in the Anthropic console for that.

export const PER_IP_LIMIT = 30;
export const PER_IP_WINDOW_MS = 10 * 60 * 1000;
export const GLOBAL_DAILY_LIMIT = 600;
const DAY_MS = 24 * 60 * 60 * 1000;

const hitsByIp = new Map(); // ip -> timestamps (ms) inside the window, oldest first
let globalDay = dayKey(Date.now());
let globalCount = 0;

function dayKey(ms) {
  return Math.floor(ms / DAY_MS); // UTC day
}

/** First address in x-forwarded-for, falling back to x-real-ip. */
export function clientIp(headers) {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0].trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Records one request and says whether it may proceed.
 * Returns { ok: true } or { ok: false, retryAfterSeconds, message }.
 */
export function checkLimits(ip, now = Date.now()) {
  // Global daily cap.
  const today = dayKey(now);
  if (today !== globalDay) {
    globalDay = today;
    globalCount = 0;
  }
  if (globalCount >= GLOBAL_DAILY_LIMIT) {
    const retryAfterSeconds = Math.ceil(((today + 1) * DAY_MS - now) / 1000);
    return {
      ok: false,
      retryAfterSeconds,
      message: `The demo has hit its daily request limit. Try again in about ${formatWait(retryAfterSeconds)}, or browse the saved bench results in the meantime.`,
    };
  }

  // Per-IP sliding window.
  const cutoff = now - PER_IP_WINDOW_MS;
  const hits = (hitsByIp.get(ip) ?? []).filter((t) => t > cutoff);
  if (hits.length >= PER_IP_LIMIT) {
    hitsByIp.set(ip, hits);
    const retryAfterSeconds = Math.max(1, Math.ceil((hits[0] + PER_IP_WINDOW_MS - now) / 1000));
    return {
      ok: false,
      retryAfterSeconds,
      message: `Too many requests from your address (limit ${PER_IP_LIMIT} per 10 minutes). Try again in about ${formatWait(retryAfterSeconds)}.`,
    };
  }

  hits.push(now);
  hitsByIp.set(ip, hits);
  globalCount += 1;

  // Keep the map from growing without bound.
  if (hitsByIp.size > 5000) {
    for (const [key, ts] of hitsByIp) {
      if (!ts.length || ts[ts.length - 1] <= cutoff) hitsByIp.delete(key);
    }
  }
  return { ok: true };
}

/** Test helper: clears all counters. */
export function resetLimits() {
  hitsByIp.clear();
  globalDay = dayKey(Date.now());
  globalCount = 0;
}

function formatWait(seconds) {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  return `${Math.ceil(minutes / 60)} hours`;
}
