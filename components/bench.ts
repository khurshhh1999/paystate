// Data helpers shared by the Bench, case pages and the Prompt lab.
// Everything here is plain functions over lib/ and data/results.json, safe on server and client.

import { CASES } from "@/lib/cases.mjs";
import { AGENT_PROMPTS, FORMAT } from "@/lib/prompts.mjs";
import type { Case, Results, Trial, Version, View } from "@/lib/types";
import resultsJson from "@/data/results.json";

export const RESULTS = resultsJson as unknown as Results;
export const VERSIONS: Version[] = ["v1", "v2"];

export const VERSION_NOTE: Record<Version, string> = {
  v1: "Generic brief: resolve the question, help the patient settle the balance.",
  v2: "v1 plus one rule: check the balance is payable as stated before asking for money.",
};

export const VIEW_ORDER: View[] = ["full", "statement"];

export const VIEW_LABEL: Record<View, string> = {
  full: "All feeds",
  statement: "Balance only",
};

export const VERSION_SHORT: Record<Version, string> = {
  v1: "v1 baseline",
  v2: "v2 with the payable-as-stated check",
};

export const GROUP_ORDER: Case["group"][] = ["not-payable", "human", "payable"];

export const GROUP_HEADING: Record<Case["group"], string> = {
  "not-payable": "Should not be paid as stated",
  human: "Needs a person to decide",
  payable: "Payable as stated",
};

export const SHOULD_PAY: Record<Case["group"], string> = {
  payable: "Yes",
  "not-payable": "No",
  human: "Needs a person",
};

/** Cases in display order: not-payable first, then the human case, then payable. */
export function orderedCases(): Case[] {
  return GROUP_ORDER.flatMap((g) => CASES.filter((c) => c.group === g));
}

export function getCase(id: string): Case | undefined {
  return CASES.find((c) => c.id === id);
}

export function runsFor(view: View, results: Results = RESULTS) {
  return view === "statement" ? results.statementRuns : results.runs;
}

export function trialsFor(version: Version, caseId: string, view: View = "full", results: Results = RESULTS): Trial[] {
  return runsFor(view, results)?.[version]?.[caseId] ?? [];
}

/** Conversations in the feed-by-feed runs: each case with each partial set of the feeds it uses. */
export function feedRunCount(results: Results = RESULTS): number {
  return VERSIONS.reduce(
    (n, v) =>
      n +
      Object.values(results.feedRuns?.[v] ?? {}).reduce(
        (m, sets) => m + Object.values(sets).reduce((k, trials) => k + trials.length, 0),
        0,
      ),
    0,
  );
}

export function hasRuns(view: View = "full", results: Results = RESULTS): boolean {
  return VERSIONS.some((v) => Object.values(runsFor(view, results)?.[v] ?? {}).some((t) => t.length > 0));
}

/** Agent instructions without the output-format block, which the API appends to any prompt. */
export function editablePrompt(version: Version): string {
  return AGENT_PROMPTS[version].replace(FORMAT, "").trimEnd();
}

export { FORMAT };

export function pct(n: number, d: number): string {
  if (!d) return "–";
  return `${Math.round((n / d) * 100)}%`;
}

export function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

