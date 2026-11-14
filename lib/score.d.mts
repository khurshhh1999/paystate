import type { Case, Results, Verdict, Version, VersionSummary, View } from "./types";
export function summarizeTrials(graded: { caseId: string; verdict: Verdict }[], cases: Pick<Case, "id" | "at_risk">[], passes?: number): VersionSummary;
export function summarizeVersion(results: Results, version: Version, cases: Pick<Case, "id" | "at_risk">[], view?: View): VersionSummary;
