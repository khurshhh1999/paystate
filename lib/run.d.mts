import type { Action, Case, Trial, Turn, Verdict, View } from "./types";
export const MODEL: string;
export function agentTurn(kase: Case, systemPrompt: string, transcript: Turn[], view?: View): Promise<{ text: string; actions: Action[] }>;
export function judge(kase: Case, transcript: Turn[], view?: View): Promise<Verdict>;
export function runCase(kase: Case, systemPrompt: string, view?: View): Promise<Trial>;
