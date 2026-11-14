// Shape of data/outreach.json, written by scripts/build-outreach.mjs.

import raw from "@/data/outreach.json";

export type TriggerId = "t1" | "t2" | "t3" | "t4" | "t5" | "t6" | "t7";

export type SampleRow = Record<string, string | number | null>;

export interface TriggerResult {
  id: TriggerId;
  number: number;
  name: string;
  rule: string;
  assumedRate: number;
  sql: string;
  caught: number;
  statementDollars: number;
  inQuestionDollars: number;
  columns: string[];
  sample: SampleRow[];
  check: { seeded: number; missed: number; extra: number };
}

export interface OutreachData {
  asOf: string;
  seed: number;
  engine: string;
  panel: { accounts: number; practices: number; dollars: number; meanBalance: number; medianBalance: number };
  assumptions: {
    balance: string;
    payerMix: string;
    channels: string;
    t6Overlap: string;
    triggerRates: Record<TriggerId, number>;
  };
  nearMisses: { id: string; rule: TriggerId; label: string; rate: number; seeded: number }[];
  schema: string;
  triggers: TriggerResult[];
  union: { caught: number; statementDollars: number; inQuestionDollars: number };
}

export const outreach = raw as unknown as OutreachData;
