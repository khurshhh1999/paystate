import type { Case } from "./types";

export interface TrafficCase extends Case {
  weight: number; // percent of inbound conversations
  persona: string;
  goal: string;
}

export interface GateExpectation {
  status: "payable" | "not_payable" | "partial";
  owed: number;
}

export const TRAFFIC_CASES: TrafficCase[];
export const GATE_EXPECTED: Record<string, GateExpectation>;
export const MIX_NOTE: string;
