// The account record, split by where each field comes from. A practice that has not connected
// a feed gives the agent nothing from it. The statement fields are always present: every
// practice can at least send the balance it is billing.

export const FEEDS = [
  {
    id: "remittance",
    label: "Remittance",
    standard: "835",
    carries: "Why each dollar was paid, adjusted or denied: reason codes, the payer's patient share, filing dates.",
    keys: ["remit", "payer_eob", "claim_history"],
  },
  {
    id: "eligibility",
    label: "Eligibility",
    standard: "270/271",
    carries: "Which coverage is active, when it ended, plan type and deductible, Medicaid aid category, network status.",
    keys: ["eligibility_check", "coverage_history", "plan_year", "rendering_provider_network_status"],
  },
  {
    id: "ledger",
    label: "Account ledger",
    standard: "PM system",
    carries: "Payments received, including money not yet applied, account notes, earlier visits, reminders already sent.",
    keys: ["ledger", "account_notes", "outreach_log", "prior_visit", "guarantor"],
  },
  {
    id: "visit",
    label: "Visit record",
    standard: "EHR",
    carries: "The intake form, the visit note summary, where the care happened, language on file.",
    keys: ["intake_form", "visit_note_summary", "facility", "preferred_language_on_file"],
  },
];

export const FEED_IDS = FEEDS.map((f) => f.id);

export const STATEMENT_KEYS = ["service", "services", "billed", "payer", "payer_on_file", "payer_billed", "payer_paid", "statement_balance"];

// Line items on the preventive case carry their own reason code and payer payment. Those two
// fields arrive with the remittance; the code, description and patient amount are on the statement.
const SERVICE_STATEMENT_FIELDS = ["cpt", "desc", "patient_owes"];

/** Feeds that hold at least one field of this case's record, in FEEDS order. */
export function relevantFeeds(kase) {
  return FEEDS.filter((f) => {
    if (f.keys.some((k) => k in kase.record)) return true;
    return f.id === "remittance" && Array.isArray(kase.record.services);
  }).map((f) => f.id);
}

/** "full", "statement" or "feeds:a+b" -> the list of connected feed ids. */
export function feedsOfView(view) {
  if (view === "full") return [...FEED_IDS];
  if (view === "statement" || !view) return [];
  if (typeof view === "string" && view.startsWith("feeds:")) {
    return view
      .slice(6)
      .split("+")
      .filter((id) => FEED_IDS.includes(id));
  }
  return [];
}

export function isView(view) {
  if (view === "full" || view === "statement") return true;
  if (typeof view !== "string" || !view.startsWith("feeds:")) return false;
  const ids = view.slice(6).split("+");
  return ids.length > 0 && ids.every((id) => FEED_IDS.includes(id)) && new Set(ids).size === ids.length;
}

/** Stable key for a set of feeds as it applies to one case: only the feeds the case has, in FEEDS order. */
export function feedKey(kase, connected) {
  return relevantFeeds(kase)
    .filter((id) => connected.includes(id))
    .join("+");
}

/** The view string to run a case under, given the feeds a practice has connected. */
export function viewFor(kase, connected) {
  const rel = relevantFeeds(kase);
  const on = rel.filter((id) => connected.includes(id));
  if (on.length === rel.length) return "full";
  if (on.length === 0) return "statement";
  return `feeds:${on.join("+")}`;
}

/** Every strict, non-empty subset of the case's feeds. These are the views the two baseline runs do not cover. */
export function partialFeedSets(kase) {
  const rel = relevantFeeds(kase);
  const out = [];
  for (let mask = 1; mask < (1 << rel.length) - 1; mask++) {
    out.push(rel.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

/** The part of the record an agent sees with these feeds connected. */
export function recordForFeeds(kase, connected) {
  const out = {};
  const allowed = new Set(STATEMENT_KEYS);
  for (const f of FEEDS) if (connected.includes(f.id)) for (const k of f.keys) allowed.add(k);
  const hasRemit = connected.includes("remittance");
  for (const [k, v] of Object.entries(kase.record)) {
    if (!allowed.has(k)) continue;
    if (k === "services" && !hasRemit) {
      out[k] = v.map((line) => Object.fromEntries(SERVICE_STATEMENT_FIELDS.filter((f) => f in line).map((f) => [f, line[f]])));
    } else out[k] = v;
  }
  return out;
}

/**
 * Recorded trials for one case under a set of connected feeds.
 * Full and statement-only come from the two baseline runs; everything between from the feed runs.
 */
export function trialsForFeeds(results, version, kase, connected) {
  const view = viewFor(kase, connected);
  if (view === "full") return results.runs?.[version]?.[kase.id] ?? [];
  if (view === "statement") return results.statementRuns?.[version]?.[kase.id] ?? [];
  return results.feedRuns?.[version]?.[kase.id]?.[feedKey(kase, connected)] ?? [];
}
