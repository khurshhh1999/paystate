"use client";

// One row per situation, most common first. A row opens to one recorded conversation.

import { Fragment, useState } from "react";
import Link from "next/link";
import { EmptyDot, money, OUTCOME_LABEL, OutcomeBadge, OutcomeDot, type Outcome } from "@/components/ui";
import { Transcript } from "@/components/case/transcript";
import type { CaseRow, GateResult } from "./compute";

const LEGEND: Outcome[] = ["resolved", "correct_handoff", "dead_end", "wrong_collect"];
const LEGEND_BG: Record<Outcome, string> = {
  resolved: "bg-ok",
  correct_handoff: "bg-handoff",
  dead_end: "bg-stuck",
  wrong_collect: "bg-wrong",
};

export function GateText({ gate }: { gate: GateResult }) {
  switch (gate.status) {
    case "payable":
      return <span className="text-ok">Payable {money(gate.owed ?? 0)}</span>;
    case "partial":
      return <span className="text-stuck">Part: {money(gate.owed ?? 0)}</span>;
    case "not_payable":
      return <span className="text-wrong">Not payable</span>;
    default:
      return <span className="text-ink-3">Cannot verify</span>;
  }
}

export function TrafficTable({ rows, trialsPerCase }: { rows: CaseRow[]; trialsPerCase: number }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      {/* relative: keeps the sr-only labels inside the scroll box instead of widening the page. */}
      <div className="table-scroll relative">
        <table className="ledger min-w-[760px]">
          <thead>
            <tr>
              <th scope="col">Patient writes</th>
              <th scope="col" className="r">
                Share
              </th>
              <th scope="col">Runs</th>
              <th scope="col">Gate</th>
              <th scope="col">
                <span className="sr-only">Conversation</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = r.kase.id;
              const isOpen = open === id;
              const slots = Math.max(trialsPerCase, r.trials.length);
              return (
                <Fragment key={id}>
                  <tr>
                    <td className="max-w-[380px]">
                      <p className="text-ink">{r.kase.opener}</p>
                      <p className="mt-1 text-[13px] text-ink-3">
                        {r.hard ? (
                          <Link
                            href={`/cases/${id}`}
                            className="underline decoration-rule-strong underline-offset-2 hover:text-accent"
                          >
                            {r.kase.title}
                          </Link>
                        ) : (
                          r.kase.title
                        )}
                        {r.hard && <span> · Hard case</span>}
                      </p>
                    </td>
                    <td className="r num whitespace-nowrap">{r.share.toFixed(1)}%</td>
                    <td>
                      <span className="sr-only">
                        {r.trials.length === 0
                          ? "Not run yet"
                          : r.trials.map((t) => OUTCOME_LABEL[t.verdict.outcome]).join(", ")}
                      </span>
                      <span aria-hidden className="inline-flex gap-1 pt-1">
                        {Array.from({ length: slots }, (_, i) =>
                          r.trials[i] ? <OutcomeDot key={i} outcome={r.trials[i].verdict.outcome} /> : <EmptyDot key={i} />,
                        )}
                      </span>
                    </td>
                    <td className="whitespace-nowrap">
                      <GateText gate={r.gate} />
                    </td>
                    <td className="r">
                      {r.sample && (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`conv-${id}`}
                          aria-label={`${isOpen ? "Hide the" : "Show a"} conversation: ${r.kase.title}`}
                          onClick={() => setOpen(isOpen ? null : id)}
                          className="whitespace-nowrap text-[13.5px] text-accent underline-offset-2 hover:underline"
                        >
                          {isOpen ? "Hide the conversation" : "Show a conversation"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && r.sample && (
                    <tr id={`conv-${id}`}>
                      <td colSpan={5} className="bg-paper">
                        <div className="max-w-[720px] py-2">
                          <Transcript turns={r.sample.transcript} agentLabel="Assistant" simulatedPatient showGate />
                          <div className="mt-4 border-t border-rule pt-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
                              <span className="text-ink-2">Judge</span>
                              <OutcomeBadge outcome={r.sample.verdict.outcome} />
                            </div>
                            {r.sample.verdict.reason && <p className="mt-1.5 text-[14px]">{r.sample.verdict.reason}</p>}
                            {r.hard && (
                              <p className="mt-3 text-[14px]">
                                <Link href={`/cases/${id}`} className="text-accent underline underline-offset-2">
                                  Open the case
                                </Link>
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
        <span>One square per run.</span>
        {LEGEND.map((o) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={"inline-block size-2.5 rounded-[2px] " + LEGEND_BG[o]} />
            {OUTCOME_LABEL[o]}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2.5 rounded-[2px] border border-rule-strong" />
          Not run yet
        </span>
      </div>
    </div>
  );
}
