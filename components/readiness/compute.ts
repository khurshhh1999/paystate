// Pure functions behind the go-live check. Conversation figures are derived from recorded trials
// for a set of connected feeds; gate figures are computed live from the record. Nothing here calls the API. A combination that has not been run
// yet comes back as empty trials, and every function treats that as "unknown", not as zero.

import { CASES } from "@/lib/cases.mjs";
import { FEED_IDS, recordForFeeds, relevantFeeds, trialsForFeeds } from "@/lib/feeds.mjs";
import { paymentGate } from "@/lib/gate.mjs";
import type { Case, FeedId, Gate, Outcome, Results, Trial, Version } from "@/lib/types";

export type Standing = "wrong" | "never" | "mixed" | "all" | "unrun";

export interface CaseRow {
  kase: Case;
  order: number; // position in CASES, for a stable sort
  trials: Trial[];
  standing: Standing;
  happens: string;
  missing: FeedId[]; // feeds the case's record draws on that are not connected
  sample: Trial | null; // the conversation to show when the row is opened
  gate: GateRow; // the code gate under this setting, computed live
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
  gate: GateChange;
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
      gate: gateRow(kase, connected),
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
      gate: gateChange(connected, feed),
    };
  });
  // A feed that removes a wrong gate decision comes first: that is money the gate would allow
  // that is not owed. The recorded conversation counts break ties.
  return out.sort((a, b) => {
    if (b.gate.fixed !== a.gate.fixed) return b.gate.fixed - a.gate.fixed;
    if (a.ran !== b.ran) return a.ran ? -1 : 1;
    return b.moreRight - a.moreRight || b.fewerWrong - a.fewerWrong;
  });
}

// The payment gate under a feed setting. Rules in code, so this is computed live for any
// setting rather than read from recorded runs. The full record is the reference answer.

export type GateResult = Omit<Gate, "removed">;
export type GateStanding = "correct" | "unverified" | "wrong";

export interface GateRow {
  kase: Case;
  now: GateResult;
  full: GateResult;
  standing: GateStanding;
  allowsUnowed: boolean; // the gate would let through money the full record says is not owed
  decidingFeeds: FeedId[]; // unconnected feeds holding the fact that fixes a wrong decision
}

export interface GateSummary {
  correct: number;
  unverified: number;
  wrong: number;
  rows: GateRow[]; // in CASES order
}

const sameOwed = (a: number | null, b: number | null) =>
  a === null || b === null ? a === b : Math.abs(a - b) < 0.005;

// Correct means the same decision and the same enforcement: an unverified that blocks nothing is
// not the same as one held for staff.
function standingOfGate(now: GateResult, full: GateResult): GateStanding {
  if (now.status === full.status && sameOwed(now.owed, full.owed) && now.block === full.block) return "correct";
  if (now.status === "unverified") return "unverified";
  return "wrong";
}

const collects = (g: GateResult) => g.status === "payable" || g.status === "partial";

function allowsUnowedOf(now: GateResult, full: GateResult): boolean {
  if (!collects(now)) return false;
  if (!collects(full)) return true;
  return (now.owed ?? 0) > (full.owed ?? 0) + 0.005;
}

// Which missing feed holds the deciding fact: the single feeds that, added on their own, make
// the gate agree with the full record. If no single feed does, every missing feed the case draws on.
function decidingFeedsOf(kase: Case, connected: FeedId[], full: GateResult): FeedId[] {
  const missing = relevantFeeds(kase).filter((id) => !connected.includes(id));
  const fixers = missing.filter(
    (id) => standingOfGate(paymentGate(recordForFeeds(kase, [...connected, id])), full) === "correct",
  );
  return fixers.length > 0 ? fixers : missing;
}

export function gateRow(kase: Case, connected: FeedId[]): GateRow {
  const now = paymentGate(recordForFeeds(kase, connected));
  const full = paymentGate(kase.record);
  const standing = standingOfGate(now, full);
  return {
    kase,
    now,
    full,
    standing,
    allowsUnowed: standing === "wrong" && allowsUnowedOf(now, full),
    decidingFeeds: standing === "wrong" ? decidingFeedsOf(kase, connected, full) : [],
  };
}

export function gateSummary(connected: FeedId[]): GateSummary {
  const rows = CASES.map((kase) => gateRow(kase, connected));
  const count = (s: GateStanding) => rows.filter((r) => r.standing === s).length;
  return { correct: count("correct"), unverified: count("unverified"), wrong: count("wrong"), rows };
}

export interface GateChange {
  moreCorrect: number; // cannot verify now, decides correctly with the feed
  fixed: number; // wrong now, decides correctly with the feed
  newWrong: number; // not wrong now, wrong with the feed
}

export function gateChange(connected: FeedId[], feed: FeedId): GateChange {
  const now = gateSummary(connected).rows;
  const next = gateSummary([...connected, feed]).rows;
  const c: GateChange = { moreCorrect: 0, fixed: 0, newWrong: 0 };
  now.forEach((a, i) => {
    const b = next[i];
    if (b.standing === "correct" && a.standing === "unverified") c.moreCorrect += 1;
    if (b.standing === "correct" && a.standing === "wrong") c.fixed += 1;
    if (b.standing === "wrong" && a.standing !== "wrong") c.newWrong += 1;
  });
  return c;
}
