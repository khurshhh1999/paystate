// Shapes shared by the bench runner, the API routes and the pages.

export type Outcome = "resolved" | "correct_handoff" | "dead_end" | "wrong_collect";
export type Version = "v1" | "v2";
// How much of the account record the agent is shown. See recordForView in prompts.mjs.
export type FeedId = "remittance" | "eligibility" | "ledger" | "visit";
// "feeds:remittance+ledger" is the statement plus those feeds.
export type View = "full" | "statement" | `feeds:${string}`;

export type Action =
  | "send_pay_link"
  | "set_up_plan"
  | "place_hold"
  | "update_insurance"
  | "offer_financial_assistance"
  | "handoff_to_staff"
  // Product actions only (PRODUCT_ACTIONS). v1/v2 never produce these.
  | "send_document"
  | "stop_messages"
  | "update_contact";

// The payment gate's decision for one record (lib/gate.mjs). `owed` is null when unverified.
// `removed` lists collect actions the assistant chose and the gate took out.
export interface Gate {
  status: "payable" | "not_payable" | "partial" | "unverified";
  owed: number | null;
  reasons: string[];
  // Collect actions are removed when true. Gates stored in data/traffic.json predate this field.
  block: boolean;
  removed?: Action[];
}

export interface Turn {
  role: "patient" | "agent";
  text: string;
  actions?: Action[]; // agent turns only
  gate?: Gate; // agent turns from the product instructions only
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
  // Statement plus some feeds. feedRuns.v2["qmb"]["eligibility"] = [trial, trial, trial]
  feedRuns?: Record<Version, Record<string, Record<string, Trial[]>>>;
}

// A handoff as billing staff receive it. Written by the model from the transcript and the record.
export type TicketKind =
  | "refile_insurance"
  | "add_secondary"
  | "apply_payment"
  | "rebill_liability"
  | "write_off"
  | "correct_balance"
  | "financial_assistance"
  | "charge_review"
  | "bereavement"
  | "other";

export interface Ticket {
  id: string;
  caseId: string;
  patient: string;
  balance: number;
  kind: TicketKind;
  amount: number; // dollars in question
  reason: string; // why this needs a person, citing the record
  told_patient: string; // what the patient has already been told
  captured: { label: string; value: string }[]; // details the patient gave, so staff do not ask again
  next_step: string; // the one thing staff should do
  hold: boolean; // statements and reminders paused
  createdAt: string; // ISO
  transcript: Turn[];
  source: "recorded" | "live";
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
