// Sample-size arithmetic for the gate experiment. Every input is an assumption.

import type { TriggerId } from "./types";

export const EXPERIMENT = {
  randomised: ["t2", "t5", "t6"] as TriggerId[],
  liveEverywhere: ["t1", "t3", "t4", "t7"] as TriggerId[],
  // Share of flagged accounts with at least one inbound billing contact within 30 days.
  baseline: 0.35, // today's process: the statement goes out as written
  target: 0.2, // the smallest drop worth building for
  zAlpha: 1.96, // two-sided, alpha 0.05
  zBeta: 0.84, // power 0.80
  openBalancesPerMonth: 4000,
  guardrailMargin: 0.01, // gated arm may collect at most 1.0% less patient cash at 60 days
  auditSample: 30, // held accounts per rule per month checked by a biller
  falsePositiveStop: 0.2,
};

export function sampleSize(rates: Record<TriggerId, number>) {
  const { baseline: p1, target: p2, zAlpha, zBeta, openBalancesPerMonth } = EXPERIMENT;
  const zSum = zAlpha + zBeta;
  const variance = p1 * (1 - p1) + p2 * (1 - p2);
  const delta = p1 - p2;
  const raw = (zSum * zSum * variance) / (delta * delta);
  const perArm = Math.ceil(raw);
  const flagRate = EXPERIMENT.randomised.reduce((s, id) => s + rates[id], 0);
  const flaggedPerMonth = openBalancesPerMonth * flagRate;
  const months = (perArm * 2) / flaggedPerMonth;
  return { zSum, variance, delta, raw, perArm, flagRate, flaggedPerMonth, months };
}
