// Pure functions behind the go-live check. Everything is derived from recorded trials for a
// set of connected feeds; nothing here calls the API. A combination that has not been run
// yet comes back as empty trials, and every function treats that as "unknown", not as zero.

import { CASES } from "@/lib/cases.mjs";
import { FEED_IDS, relevantFeeds, trialsForFeeds } from "@/lib/feeds.mjs";
import type { Case, FeedId, Outcome, Results, Trial, Version } from "@/lib/types";

export type Standing = "wrong" | "never" | "mixed" | "all" | "unrun";

export interface CaseRow {
  kase: Case;
  order: number; // position in CASES, for a stable sort
  trials: Trial[];
  standing: Standing;
  happens: string;
  missing: FeedId[]; // feeds the case's record draws on that are not connected
  sample: Trial | null; // the conversation to show when the row is opened
}

export interface Summary {
  cases: number;
  unrun: number; // cases with no recorded trials under this setting
  allRight: number;
  mixed: number;
  neverRight: number;
  trials: number;
  right: number;
  wrongCollects: number;
  wrongDollarsPerPass: number;
  staffEnds: number;
}

export interface Suggestion {
  feed: FeedId;
  ran: boolean; // false when any case lacks trials for the current or the extended set
  moreRight: number;
  fewerWrong: number;
}

export function isRight(o: Outcome): boolean {
  return o === "resolved" || o === "correct_handoff";
}

export function endsWithStaff(t: Trial): boolean {
  return t.transcript.some((turn) => turn.role === "agent" && (turn.actions ?? []).includes("handoff_to_staff"));
}

function standingOf(trials: Trial[]): Standing {
  if (trials.length === 0) return "unrun";
  const outcomes = trials.map((t) => t.verdict.outcome);
  if (outcomes.includes("wrong_collect")) return "wrong";
  const right = outcomes.filter(isRight).length;
  if (right === 0) return "never";
  if (right === outcomes.length) return "all";
  return "mixed";
}

function happensFor(trials: Trial[]): string {
  if (trials.length === 0) return "Not run yet";
  const o = trials.map((t) => t.verdict.outcome);
  if (o.includes("wrong_collect")) return "Takes money that is not owed";
  // A resolved run can still pass a follow-up to staff (updating insurance on file, say).
  if (o.every((x) => x === "resolved"))
    return trials.some(endsWithStaff) ? "Answered, with a follow-up for staff" : "Answered without staff";
  if (o.every((x) => x === "correct_handoff")) return "Handed to staff with the right answer";
  if (o.every(isRight)) return "Right every time, some runs via staff";
  // Most dead ends hand off too, so "left without an answer" would be wrong.
  if (o.every((x) => x === "dead_end")) return "No usable answer in any run";
  return "Right in some runs, not others";
}

// Show the worst thing that happened: a wrong collect, else a dead end, else the first run.
function sampleOf(trials: Trial[]): Trial | null {
  return (
    trials.find((t) => t.verdict.outcome === "wrong_collect") ??
    trials.find((t) => t.verdict.outcome === "dead_end") ??
    trials[0] ??
    null
  );
}

const STANDING_RANK: Record<Standing, number> = { wrong: 0, never: 1, mixed: 2, all: 3, unrun: 4 };

/** One row per case, worst first, stable by case order within a group. */
export function caseRows(results: Results, version: Version, connected: FeedId[]): CaseRow[] {
  return CASES.map((kase, order) => {
    const trials = trialsForFeeds(results, version, kase, connected);
    return {
      kase,
      order,
      trials,
      standing: standingOf(trials),
      happens: happensFor(trials),
      missing: relevantFeeds(kase).filter((id) => !connected.includes(id)),
      sample: sampleOf(trials),
    };
  }).sort((a, b) => STANDING_RANK[a.standing] - STANDING_RANK[b.standing] || a.order - b.order);
}

export function summarize(results: Results, version: Version, connected: FeedId[]): Summary {
  const passes = results.trials || 3;
  const s: Summary = {
    cases: CASES.length,
    unrun: 0,
    allRight: 0,
    mixed: 0,
    neverRight: 0,
    trials: 0,
    right: 0,
    wrongCollects: 0,
    wrongDollarsPerPass: 0,
    staffEnds: 0,
  };
  let dollars = 0;
  for (const kase of CASES) {
    const trials = trialsForFeeds(results, version, kase, connected);
    if (trials.length === 0) {
      s.unrun += 1;
      continue;
    }
    const right = trials.filter((t) => isRight(t.verdict.outcome)).length;
    if (right === trials.length) s.allRight += 1;
    else if (right === 0) s.neverRight += 1;
    else s.mixed += 1;
    s.trials += trials.length;
    s.right += right;
    for (const t of trials) {
      if (t.verdict.outcome === "wrong_collect") {
        s.wrongCollects += 1;
        dollars += kase.at_risk;
      }
      if (endsWithStaff(t)) s.staffEnds += 1;
    }
  }
  s.wrongDollarsPerPass = Math.round((dollars / passes) * 100) / 100;
  return s;
}

/** What adding each unconnected feed to the current set would change, best first. */
export function suggestions(results: Results, version: Version, connected: FeedId[]): Suggestion[] {
  const now = summarize(results, version, connected);
  const out = FEED_IDS.filter((id) => !connected.includes(id)).map((feed): Suggestion => {
    const next = summarize(results, version, [...connected, feed]);
    const ran = now.unrun === 0 && next.unrun === 0;
    return {
      feed,
      ran,
      moreRight: ran ? next.right - now.right : 0,
      fewerWrong: ran ? now.wrongCollects - next.wrongCollects : 0,
    };
  });
  return out.sort((a, b) => {
    if (a.ran !== b.ran) return a.ran ? -1 : 1;
    return b.moreRight - a.moreRight || b.fewerWrong - a.fewerWrong;
  });
}
