// Abuse limits for the public API routes, which spend a personal API key.
//
// What this is: in-memory counters, per server instance, best effort. On Vercel each warm
// function instance keeps its own counters, a cold start resets them, and several instances
// can run at once, so the real total can be a multiple of the numbers below. The spend limit
// on the key in the Anthropic console is the actual ceiling; these keep one instance from
// being run up by a script and keep the demo usable for the people it is meant for.
//
// Requests are counted only after they pass validation (lib/api-validate.mjs), so junk that
// never reaches the model costs nothing and uses up nothing.
//
// Units are model calls, counting the one retry the judge and ticket writer can make:
//   chat 1, judge 2, ticket 2, run-case 4 (two replies and a grade, plus that retry).
// Worst case per call is about $0.065 on Opus 5.5 ($4/M in, $20/M out): every call can use
// its full 2,000-token output cap (thinking counts toward it), and input is at most a few
// thousand tokens at the length caps. Typical calls cost a fraction of that.
//
// Per address (x-forwarded-for, first entry):
//   150 units per 10 minutes. One prompt-lab run is 12 run-cases = 48 units, so the burst
//     window never cuts a run short, and a run plus a long chat with several patients fits.
//   300 units per rolling 24 hours, about $19 worst case. Enough for two people behind one
//     office address to each chat with several patients and run the lab; a script on one
//     address stops there.
//   96 of those may use custom instructions (two lab runs). Custom instructions are the
//     part that can be pointed at anything, so they get the tighter share.
// Whole instance, per UTC day, in two separate pools so one cannot starve the other:
//   600 units for the saved instructions (patient page, case pages): about $39 worst case.
//   144 units for custom instructions (three lab runs): about $9 worst case.
// Worst case per instance per day: about $48. Before these changes it was about $138
// (600 requests a day, each of which could be a 4-call run with a 6,000-character prompt).

const MINUTE = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE;

export const COST = { chat: 1, judge: 2, ticket: 2, "run-case": 4 };
export const ADDRESS_BURST = { units: 150, windowMs: 10 * MINUTE };
export const ADDRESS_DAILY = { units: 300, windowMs: DAY_MS };
export const ADDRESS_CUSTOM_DAILY = { units: 96, windowMs: DAY_MS };
export const SAVED_DAILY_LIMIT = 600;
export const CUSTOM_DAILY_LIMIT = 144;

const STILL_WORKS = "Recorded results on every page still work.";
const SAVED_STILL_WORK = "The saved instructions and all recorded results still work.";

// ip -> [{ t, units, custom }], oldest first, trimmed to the last 24 hours.
const hitsByIp = new Map();
let day = dayKey(Date.now());
let savedUsed = 0;
let customUsed = 0;

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
 * Seconds until `units` more fit under `cap` in a sliding window, or 0 if they fit now.
 * `hits` is oldest first and already limited to entries the window should consider.
 */
function waitFor(hits, units, cap, windowMs, now) {
  const cutoff = now - windowMs;
  const live = hits.filter((h) => h.t > cutoff);
  let used = live.reduce((n, h) => n + h.units, 0);
  if (used + units <= cap) return 0;
  for (const h of live) {
    used -= h.units;
    if (used + units <= cap) return Math.max(1, Math.ceil((h.t + windowMs - now) / 1000));
  }
  return Math.ceil(windowMs / 1000);
}

function denied(scope, retryAfterSeconds, text) {
  return { ok: false, scope, retryAfterSeconds, message: text.replace("{wait}", formatWait(retryAfterSeconds)) };
}

/**
 * Checks one validated request and, if it may proceed, records it.
 * `units`: its cost from COST. `custom`: true when it runs on the visitor's own instructions.
 * Returns { ok: true } or { ok: false, scope, retryAfterSeconds, message }. A refused
 * request is not recorded.
 */
export function checkLimits(ip, { units = 1, custom = false } = {}, now = Date.now()) {
  const today = dayKey(now);
  if (today !== day) {
    day = today;
    savedUsed = 0;
    customUsed = 0;
  }
  const untilTomorrow = Math.ceil(((today + 1) * DAY_MS - now) / 1000);

  if (custom && customUsed + units > CUSTOM_DAILY_LIMIT) {
    return denied(
      "site",
      untilTomorrow,
      `Runs with custom instructions have reached today's limit for this site. They open again in about {wait}. ${SAVED_STILL_WORK}`,
    );
  }
  if (!custom && savedUsed + units > SAVED_DAILY_LIMIT) {
    return denied(
      "site",
      untilTomorrow,
      `Live conversations have reached today's limit for this site, since each one costs money to run. They open again in about {wait}. ${STILL_WORKS}`,
    );
  }

  const hits = (hitsByIp.get(ip) ?? []).filter((h) => h.t > now - DAY_MS);
  hitsByIp.set(ip, hits);

  let wait = waitFor(hits, units, ADDRESS_BURST.units, ADDRESS_BURST.windowMs, now);
  if (wait) {
    return denied(
      "address",
      wait,
      `That is a lot of live requests from your address in a few minutes, so new ones pause for about {wait}. ${STILL_WORKS}`,
    );
  }
  if (custom) {
    wait = waitFor(
      hits.filter((h) => h.custom),
      units,
      ADDRESS_CUSTOM_DAILY.units,
      ADDRESS_CUSTOM_DAILY.windowMs,
      now,
    );
    if (wait) {
      return denied(
        "address",
        wait,
        `Your address has used today's runs with custom instructions. They open again in about {wait}. ${SAVED_STILL_WORK}`,
      );
    }
  }
  wait = waitFor(hits, units, ADDRESS_DAILY.units, ADDRESS_DAILY.windowMs, now);
  if (wait) {
    return denied(
      "address",
      wait,
      `Your address has used today's share of live conversations. They open again in about {wait}. ${STILL_WORKS}`,
    );
  }

  hits.push({ t: now, units, custom });
  if (custom) customUsed += units;
  else savedUsed += units;

  // Keep the map from growing without bound.
  if (hitsByIp.size > 5000) {
    for (const [key, list] of hitsByIp) {
      if (!list.length || list[list.length - 1].t <= now - DAY_MS) hitsByIp.delete(key);
    }
  }
  return { ok: true };
}

/** Units used today in each site-wide pool. For tests. */
export function usage() {
  return { saved: savedUsed, custom: customUsed };
}

/** Test helper: clears all counters. */
export function resetLimits(now = Date.now()) {
  hitsByIp.clear();
  day = dayKey(now);
  savedUsed = 0;
  customUsed = 0;
}

export function formatWait(seconds) {
  if (seconds < 90) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 90) return `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "an hour" : `${hours} hours`;
}
