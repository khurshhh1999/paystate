// Pure functions over the traffic set and data/traffic.json. Safe on server and client.

import { CASES } from "@/lib/cases.mjs";
import { GATE_EXPECTED, TRAFFIC_CASES, type TrafficCase } from "@/lib/traffic.mjs";
import { paymentGate } from "@/lib/gate.mjs";
import { recordForView } from "@/lib/prompts.mjs";
import type { Gate, Turn, Verdict, View } from "@/lib/types";
import trafficJson from "@/data/traffic.json";

export interface TrafficTrial {
  transcript: Turn[];
  verdict: Verdict;
  calls: number;
}

export interface TrafficData {
  generatedAt: string | null;
  model: string;
  view: View;
  trialsPerCase: number;
  maxPatientTurns: number;
  calls: number;
  runs: Record<string, TrafficTrial[]>;
  // Set when some cases were run again after a change: the trials those reruns replaced
  // (the original run, never overwritten by a later rerun) and which cases were rerun.
  previous?: Record<string, TrafficTrial[]>;
  rerun?: { cases: string[]; at: string; note: string };
}

export const TRAFFIC = trafficJson as unknown as TrafficData;

export type GateResult = Omit<Gate, "removed">;
export type Weights = Record<string, number>;
export type MixId = "assumed" | "hard" | "even";

const HARD_IDS = new Set(CASES.map((c) => c.id));
export const isHard = (kase: TrafficCase) => HARD_IDS.has(kase.id);

export const trialsOf = (data: TrafficData, id: string): TrafficTrial[] => data.runs?.[id] ?? [];

export function hasRuns(data: TrafficData): boolean {
  return Object.values(data.runs ?? {}).some((t) => t.length > 0);
}

/** Scales weights so they sum to 100. All zero stays all zero. */
export function rescale(w: Weights): Weights {
  const total = Object.values(w).reduce((s, v) => s + v, 0);
  if (total <= 0) return Object.fromEntries(Object.keys(w).map((k) => [k, 0]));
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, (v / total) * 100]));
}

export function presetWeights(mix: MixId): Weights {
  const base = Object.fromEntries(
    TRAFFIC_CASES.map((c) => [
      c.id,
      mix === "even" ? 1 : mix === "hard" && isHard(c) ? c.weight * 2 : c.weight,
    ]),
  );
  return rescale(base);
}

export const isRight = (t: TrafficTrial) => t.verdict.outcome === "resolved" || t.verdict.outcome === "correct_handoff";

export interface ResultSummary {
  trials: number;
  right: number;
  wrongCollects: number;
  blocked: number; // agent turns where the gate removed a collect action
  casesRun: number;
  casesMissing: number;
  weightedRate: number | null; // 0..1, over cases with trials, weights rescaled over them
}

export function summarize(data: TrafficData, weights: Weights): ResultSummary {
  let trials = 0;
  let right = 0;
  let wrongCollects = 0;
  let blocked = 0;
  let casesRun = 0;
  let wSum = 0;
  let wScore = 0;
  for (const c of TRAFFIC_CASES) {
    const ts = trialsOf(data, c.id);
    if (ts.length === 0) continue;
    casesRun++;
    const r = ts.filter(isRight).length;
    trials += ts.length;
    right += r;
    wrongCollects += ts.filter((t) => t.verdict.outcome === "wrong_collect").length;
    for (const t of ts) {
      blocked += t.transcript.filter((turn) => turn.role === "agent" && (turn.gate?.removed?.length ?? 0) > 0).length;
    }
    const w = weights[c.id] ?? 0;
    wSum += w;
    wScore += w * (r / ts.length);
  }
  return {
    trials,
    right,
    wrongCollects,
    blocked,
    casesRun,
    casesMissing: TRAFFIC_CASES.length - casesRun,
    weightedRate: wSum > 0 ? wScore / wSum : null,
  };
}

/** The run as it stood before any rerun: the original trials put back over the current ones. */
export function firstRun(data: TrafficData): TrafficData | null {
  const previous = data.previous ?? {};
  if (Object.keys(previous).length === 0) return null;
  return { ...data, runs: { ...data.runs, ...previous }, previous: undefined, rerun: undefined };
}

/** Cases that were run again, heaviest first, with their original and current trials. */
export function rerunCases(data: TrafficData): { kase: TrafficCase; before: TrafficTrial[]; after: TrafficTrial[] }[] {
  const previous = data.previous ?? {};
  return [...TRAFFIC_CASES]
    .filter((c) => previous[c.id]?.length)
    .sort((a, b) => b.weight - a.weight)
    .map((kase) => ({ kase, before: previous[kase.id], after: trialsOf(data, kase.id) }));
}

/** The conversation to show for a case: a wrong collect if there is one, then a dead end, then the first. */
export function sampleTrial(trials: TrafficTrial[]): TrafficTrial | null {
  return (
    trials.find((t) => t.verdict.outcome === "wrong_collect") ??
    trials.find((t) => t.verdict.outcome === "dead_end") ??
    trials[0] ??
    null
  );
}

export interface CaseRow {
  kase: TrafficCase;
  hard: boolean;
  share: number; // percent under the current mix
  trials: TrafficTrial[];
  sample: TrafficTrial | null;
  gate: GateResult;
}

export function caseRows(data: TrafficData, weights: Weights): CaseRow[] {
  const shares = rescale(weights);
  return TRAFFIC_CASES.map((kase) => {
    const trials = trialsOf(data, kase.id);
    return {
      kase,
      hard: isHard(kase),
      share: shares[kase.id] ?? 0,
      trials,
      sample: sampleTrial(trials),
      gate: paymentGate(kase.record),
    };
  }).sort((a, b) => b.share - a.share);
}

// The gate on the full record against the answer key.
export interface GateMismatch {
  kase: TrafficCase;
  expected: { status: string; owed: number } | undefined;
  actual: GateResult;
}

export function gateCheck(): { matches: number; total: number; mismatches: GateMismatch[] } {
  const mismatches: GateMismatch[] = [];
  for (const kase of TRAFFIC_CASES) {
    const expected = GATE_EXPECTED[kase.id];
    const actual = paymentGate(kase.record);
    const ok =
      expected !== undefined &&
      actual.status === expected.status &&
      actual.owed !== null &&
      Math.abs(actual.owed - expected.owed) < 0.005;
    if (!ok) mismatches.push({ kase, expected, actual });
  }
  return { matches: TRAFFIC_CASES.length - mismatches.length, total: TRAFFIC_CASES.length, mismatches };
}

export const GATE_STATUSES: GateResult["status"][] = ["payable", "partial", "not_payable", "unverified"];

export const GATE_STATUS_LABEL: Record<GateResult["status"], string> = {
  payable: "Payable",
  partial: "Part payable",
  not_payable: "Not payable",
  unverified: "Cannot verify",
};

export const GATE_VIEWS: { view: View; label: string }[] = [
  { view: "full", label: "Everything" },
  { view: "feeds:remittance", label: "Balance + remittance" },
  { view: "feeds:eligibility", label: "Balance + eligibility" },
  { view: "statement", label: "Balance only" },
];

/** How many of the 28 land in each gate status as the record shrinks. */
export function gateByView(): { view: View; label: string; counts: Record<GateResult["status"], number> }[] {
  return GATE_VIEWS.map(({ view, label }) => {
    const counts: Record<GateResult["status"], number> = { payable: 0, partial: 0, not_payable: 0, unverified: 0 };
    for (const kase of TRAFFIC_CASES) counts[paymentGate(recordForView(kase, view)).status]++;
    return { view, label, counts };
  });
}
