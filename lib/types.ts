// Shapes shared by the bench runner, the API routes and the pages.

export type Outcome = "resolved" | "correct_handoff" | "dead_end" | "wrong_collect";
export type Version = "v1" | "v2";
// How much of the account record the agent is shown. See recordForView in prompts.mjs.
export type View = "full" | "statement";

export type Action =
  | "send_pay_link"
  | "set_up_plan"
  | "place_hold"
  | "update_insurance"
  | "offer_financial_assistance"
  | "handoff_to_staff";

export interface Turn {
  role: "patient" | "agent";
  text: string;
  actions?: Action[]; // agent turns only
}

export interface Verdict {
  outcome: Outcome;
  accurate: boolean;
  reason: string;
}

export interface Trial {
  transcript: Turn[];
  verdict: Verdict;
}

export interface Case {
  id: string;
  title: string;
  group: "payable" | "not-payable" | "human";
  balance: number;
  at_risk: number;
  patient: string;
  opener: string;
  followup: string;
  record: Record<string, unknown>;
  truth: {
    payable: string;
    best_outcome: "resolved" | "correct_handoff";
    right_move: string;
    fail_if: string;
  };
}

// data/results.json
export interface Results {
  generatedAt: string | null; // ISO timestamp, null until the bench has been run
  model: string;
  trials: number;
  runs: Record<Version, Record<string, Trial[]>>; // full record. runs.v1["qmb"] = [trial, trial, trial]
  statementRuns?: Record<Version, Record<string, Trial[]>>; // same cases, agent shown the statement only
}

export interface VersionSummary {
  trials: number; // total graded conversations
  resolved: number;
  correct_handoff: number;
  dead_end: number;
  wrong_collect: number;
  right: number; // resolved + correct_handoff
  accurate: number;
  // Dollars asked for that should not have been, averaged per pass over the 12 cases.
  wrongCollectDollars: number;
}
