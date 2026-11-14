"use client";

// One row per patient question under the current setting, worst first. A row opens to show
// one recorded conversation so the reader can see what the outcome actually looked like.

import { Fragment, useState } from "react";
import Link from "next/link";
import { FEEDS } from "@/lib/feeds.mjs";
import type { FeedId } from "@/lib/types";
import { EmptyDot, OUTCOME_LABEL, OutcomeBadge, OutcomeDot, type Outcome } from "@/components/ui";
import { Transcript } from "@/components/case/transcript";
import type { CaseRow } from "./compute";
import { GATE_TONE, gateLabel } from "./gate-summary";

const FEED_LABEL = Object.fromEntries(FEEDS.map((f) => [f.id, f.label])) as Record<FeedId, string>;

const LEGEND: Outcome[] = ["resolved", "correct_handoff", "dead_end", "wrong_collect"];
const LEGEND_BG: Record<Outcome, string> = {
  resolved: "bg-ok",
  correct_handoff: "bg-handoff",
  dead_end: "bg-stuck",
  wrong_collect: "bg-wrong",
};

export function CaseTable({ rows, trialsPerCase }: { rows: CaseRow[]; trialsPerCase: number }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div className="table-scroll">
        <table className="ledger min-w-[880px]">
          <thead>
            <tr>
              <th scope="col">Patient asks</th>
              <th scope="col">Recorded runs</th>
              <th scope="col">What happens</th>
              <th scope="col">Gate</th>
              <th scope="col">Still missing</th>
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
                    <td className="max-w-[360px]">
                      <p className="text-ink">{r.kase.opener}</p>
                      <p className="mt-1 text-[13px] text-ink-3">{r.kase.title}</p>
                    </td>
                    <td>
                      <span className="sr-only">
                        {r.trials.length === 0 ? "Not run yet" : r.trials.map((t) => OUTCOME_LABEL[t.verdict.outcome]).join(", ")}
                      </span>
                      <span aria-hidden className="inline-flex gap-1 pt-1">
                        {Array.from({ length: slots }, (_, i) =>
                          r.trials[i] ? <OutcomeDot key={i} outcome={r.trials[i].verdict.outcome} /> : <EmptyDot key={i} />,
                        )}
                      </span>
                    </td>
                    <td className={r.standing === "wrong" ? "text-wrong" : r.standing === "unrun" ? "text-ink-3" : ""}>
                      {r.happens}
                    </td>
                    <td className="whitespace-nowrap">
                      <span className={GATE_TONE[r.gate.now.status]}>{gateLabel(r.gate.now)}</span>
                      {r.gate.allowsUnowed && (
                        <span className="mt-0.5 block text-[12.5px] text-wrong">
                          Full record: {gateLabel(r.gate.full).replace(/^\w/, (c) => c.toLowerCase())}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.missing.length === 0 ? (
                        <span className="text-ink-3">Nothing</span>
                      ) : (
                        r.missing.map((f) => FEED_LABEL[f]).join(", ")
                      )}
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
                      <td colSpan={6} className="bg-paper">
                        <div className="max-w-[720px] py-2">
                          <Transcript turns={r.sample.transcript} agentLabel="Assistant" />
                          <div className="mt-4 border-t border-rule pt-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
                              <span className="text-ink-2">Judge</span>
                              <OutcomeBadge outcome={r.sample.verdict.outcome} />
                            </div>
                            {r.sample.verdict.reason && <p className="mt-1.5 text-[14px]">{r.sample.verdict.reason}</p>}
                            <p className="mt-3 text-[14px]">
                              <Link href={`/cases/${id}`} className="text-accent underline underline-offset-2">
                                Open the case
                              </Link>
                            </p>
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
        <span>One square per recorded run.</span>
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
