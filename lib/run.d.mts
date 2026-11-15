import type { Action, Case, Gate, Trial, Turn, Verdict, View } from "./types";
export const MODEL: string;
export const BENCH_MODEL: string;
export function agentTurn(kase: Case, systemPrompt: string, transcript: Turn[], view?: View, model?: string): Promise<{ text: string; actions: Action[] }>;
export function productTurn(
  kase: Case,
  transcript: Turn[],
  view?: View,
): Promise<{ text: string; actions: Action[]; gate: Gate & { removed: Action[] } }>;
export function judge(kase: Case, transcript: Turn[], view?: View, model?: string): Promise<Verdict>;
export function runCase(kase: Case, systemPrompt: string, view?: View, model?: string): Promise<Trial>;
