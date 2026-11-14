import type { Action, Gate, Turn, Verdict, View } from "./types";
import type { TrafficCase } from "./traffic.mjs";

export interface CallCounter {
  calls: number;
}

export interface PatientReply {
  done: boolean;
  text: string;
}

export interface ProductReply {
  text: string;
  actions: Action[];
  gate: Gate & { removed: Action[] };
}

export interface TrafficDeps {
  productTurn: (kase: TrafficCase, transcript: Turn[], view: View, counter: CallCounter) => Promise<ProductReply>;
  patientTurn: (kase: TrafficCase, transcript: Turn[], counter: CallCounter) => Promise<PatientReply>;
  judge: (kase: TrafficCase, transcript: Turn[], counter: CallCounter) => Promise<Verdict>;
}

export const PATIENT_SYSTEM: string;
export function parsePatientReply(raw: string): PatientReply;
export function patientTurn(kase: TrafficCase, transcript: Turn[], counter?: CallCounter): Promise<PatientReply>;
export function buildTrafficJudgeInput(kase: TrafficCase, transcript: Turn[]): string;
export function judgeTraffic(kase: TrafficCase, transcript: Turn[], counter?: CallCounter): Promise<Verdict>;
export function runTrafficCase(
  kase: TrafficCase,
  opts?: { view?: View; maxPatientTurns?: number },
  deps?: Partial<TrafficDeps>,
  counter?: CallCounter,
): Promise<{ transcript: Turn[]; verdict: Verdict; gate: Gate | null; calls: number }>;
