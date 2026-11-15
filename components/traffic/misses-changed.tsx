"use client";

// The situations that missed in the first run: what went wrong, what changed in the product,
// and the first run next to the rerun. A row opens to the first run's failing conversation.

import { Fragment, useState } from "react";
import { OUTCOME_LABEL, OutcomeBadge, OutcomeDot } from "@/components/ui";
import { Transcript } from "@/components/case/transcript";
import { TRAFFIC_CASES } from "@/lib/traffic.mjs";
import { rerunCases, sampleTrial, TRAFFIC, type TrafficTrial } from "./compute";

// Written from the first-run transcripts.
const NOTES: Record<string, { wrong: string; change: string }> = {
  "pay-in-full": {
    wrong:
      "He paid on the secure page and asked for his receipt. The payment had not posted yet, so the assistant handed it to staff.",
    change: "Receipts are texted automatically when a payment posts, so the assistant tells him it is on its way.",
  },
  "receipt-request": {
    wrong: "She asked for the receipt by email. There was no email on file, so the assistant handed it to staff.",
    change: "The assistant can save an email address the patient gives and send the receipt there.",
  },
  "collections-worry": {
    wrong:
      "The assistant told her that her credit and home purchase were safe \"either way\", which is more than the policy says.",
    change:
      "The assistant states the policy and does not predict what lenders or credit bureaus will do. After that change it still missed twice by offering staff review of a plan longer than policy allows, so that offer was removed too.",
  },
};

function Dots({ trials, label }: { trials: TrafficTrial[]; label: string }) {
  return (
    <>
      <span className="sr-only">
        {label}: {trials.map((t) => OUTCOME_LABEL[t.verdict.outcome]).join(", ")}
      </span>
      <span aria-hidden className="inline-flex gap-1 pt-1">
        {trials.map((t, i) => (
          <OutcomeDot key={i} outcome={t.verdict.outcome} />
        ))}
      </span>
    </>
  );
}

export function MissesChanged() {
  const [open, setOpen] = useState<string | null>(null);
  const rows = rerunCases(TRAFFIC);
  if (rows.length === 0) return null;
  const notRerun = TRAFFIC_CASES.length - rows.length;

  return (
    <section className="mt-12 border-t border-rule pt-8" aria-labelledby="misses">
      <h2 id="misses" className="text-[20px] font-semibold">
        What the misses changed
      </h2>
      <p className="prose-col mt-1 text-[14px] text-ink-2">
        Each miss in the first run pointed at something the product could not do, or said too loosely. These situations
        were run again after the change, two runs each. The other {notRerun} were not. The reruns appear only here; the
        result and the table above are the first run.
      </p>
      <div className="table-scroll relative mt-4">
        <table className="ledger min-w-[760px]">
          <thead>
            <tr>
              <th scope="col">Situation</th>
              <th scope="col">What went wrong</th>
              <th scope="col">What changed</th>
              <th scope="col">First run</th>
              <th scope="col">Rerun after the change</th>
              <th scope="col">
                <span className="sr-only">Conversation</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ kase, before, after }) => {
              const id = kase.id;
              const isOpen = open === id;
              const failing = sampleTrial(before);
              const note = NOTES[id];
              return (
                <Fragment key={id}>
                  <tr>
                    <td className="whitespace-nowrap text-ink">{kase.title}</td>
                    <td className="min-w-[200px] text-[14px]">{note?.wrong ?? "–"}</td>
                    <td className="min-w-[200px] text-[14px]">{note?.change ?? "–"}</td>
                    <td>
                      <Dots trials={before} label="First run" />
                    </td>
                    <td>
                      <Dots trials={after} label="Rerun after the change" />
                    </td>
                    <td className="r">
                      {failing && (
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`miss-${id}`}
                          aria-label={`${isOpen ? "Hide the" : "Show the"} first-run conversation: ${kase.title}`}
                          onClick={() => setOpen(isOpen ? null : id)}
                          className="whitespace-nowrap text-[13.5px] text-accent underline-offset-2 hover:underline"
                        >
                          {isOpen ? "Hide" : "Show the miss"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isOpen && failing && (
                    <tr id={`miss-${id}`}>
                      <td colSpan={6} className="bg-paper">
                        <div className="max-w-[720px] py-2">
                          <Transcript turns={failing.transcript} agentLabel="Assistant" simulatedPatient showGate />
                          <div className="mt-4 border-t border-rule pt-3">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
                              <span className="text-ink-2">Judge, first run</span>
                              <OutcomeBadge outcome={failing.verdict.outcome} />
                            </div>
                            {failing.verdict.reason && <p className="mt-1.5 text-[14px]">{failing.verdict.reason}</p>}
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
    </section>
  );
}
