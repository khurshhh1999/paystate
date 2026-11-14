// The Bench scorecard: a 2×2 of what the assistant sees (rows) against which instructions it runs (columns).
// Rows are the comparison that matters, so each row carries its combined total next to its name.

import { summarizeVersion } from "@/lib/score.mjs";
import { CASES } from "@/lib/cases.mjs";
import type { Results, Version, VersionSummary, View } from "@/lib/types";
import { money, OUTCOME_LABEL, type Outcome } from "@/components/ui";
import { StatusBars, type StripCell } from "@/components/obsidian/status-bars";
import { orderedCases, trialsFor, VERSION_SHORT, VERSIONS, VIEW_LABEL, VIEW_ORDER } from "@/components/bench";

const VIEW_NOTE: Record<View, string> = {
  full: "Remittance codes, eligibility, ledger, intake and notes.",
  statement: "Only what the patient's statement prints.",
};

function stripCells(version: Version, view: View, results: Results): StripCell[] {
  const trials = results.trials || 3;
  return orderedCases().flatMap((c) => {
    const runs = trialsFor(version, c.id, view, results);
    return Array.from({ length: Math.max(trials, runs.length) }, (_, i) => ({
      key: `${c.id}-${i}`,
      outcome: runs[i]?.verdict.outcome ?? null,
      label: `${c.title}, trial ${i + 1}`,
      detail: runs[i]?.verdict.reason,
    }));
  });
}

export function summarizeAll(results: Results) {
  return Object.fromEntries(
    VIEW_ORDER.map((view) => [
      view,
      Object.fromEntries(VERSIONS.map((v) => [v, summarizeVersion(results, v, CASES, view)])) as Record<Version, VersionSummary>,
    ]),
  ) as Record<View, Record<Version, VersionSummary>>;
}

const LEGEND: Outcome[] = ["resolved", "correct_handoff", "dead_end", "wrong_collect"];
const LEGEND_BG: Record<Outcome, string> = {
  resolved: "bg-ok",
  correct_handoff: "bg-handoff",
  dead_end: "bg-stuck",
  wrong_collect: "bg-wrong",
};

function Cell({ s, version, view, results }: { s: VersionSummary; version: Version; view: View; results: Results }) {
  const ran = s.trials > 0;
  return (
    <div className="min-w-0">
      <p className="text-[13px] text-ink-2 sm:hidden">{VERSION_SHORT[version]}</p>
      {ran ? (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 sm:mt-0">
          <span className="num text-[30px] font-medium leading-none">
            {s.right}
            <span className="text-ink-3">/{s.trials}</span>
          </span>
          <span className="text-[14px] text-ink-2">right outcome</span>
        </p>
      ) : (
        <p className="mt-1 sm:mt-0">
          <span className="num text-[30px] font-medium leading-none text-ink-3">–</span>
          <span className="ml-2 text-[14px] text-ink-3">Not run yet</span>
        </p>
      )}
      <StatusBars
        className="mt-3"
        cells={stripCells(version, view, results)}
        label={`${VIEW_LABEL[view]}, ${version}: one bar per conversation, in case table order`}
      />
      {ran && (
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 text-[14px]">
          <dt className="text-ink-2">Wrong collects</dt>
          <dd>
            <span className={"num " + (s.wrong_collect > 0 ? "font-medium text-wrong" : "")}>{s.wrong_collect}</span>
            {s.wrong_collect > 0 && (
              <span className="text-ink-2">
                {" "}
                · <span className="tabular-nums">{money(s.wrongCollectDollars)}</span> not owed, each time the twelve cases are
                run
              </span>
            )}
          </dd>
          <dt className="text-ink-2">Dead ends</dt>
          <dd className={"num " + (s.dead_end > 0 ? "text-stuck" : "")}>{s.dead_end}</dd>
        </dl>
      )}
    </div>
  );
}

export function Scorecard({ results }: { results: Results }) {
  const all = summarizeAll(results);

  return (
    <div>
      <div className="hidden gap-x-8 border-b border-rule-strong pb-2 text-[14px] sm:grid sm:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
        <span className="text-ink-2">What the assistant sees</span>
        {VERSIONS.map((v) => (
          <span key={v} className="font-medium">
            {VERSION_SHORT[v]}
          </span>
        ))}
      </div>

      {VIEW_ORDER.map((view) => {
        const row = all[view];
        const right = row.v1.right + row.v2.right;
        const total = row.v1.trials + row.v2.trials;
        return (
          <div
            key={view}
            className="grid gap-x-8 gap-y-4 border-b border-rule-strong py-5 sm:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <div>
              <h3 className="text-[17px] font-semibold">{VIEW_LABEL[view]}</h3>
              <p className="text-[13px] text-ink-2">{VIEW_NOTE[view]}</p>
              {total > 0 && (
                <p className="mt-2 text-[14px]">
                  <span className="tabular-nums font-medium">
                    {right} of {total}
                  </span>{" "}
                  <span className="text-ink-2">right across both</span>
                </p>
              )}
            </div>
            {VERSIONS.map((v) => (
              <Cell key={v} s={row[v]} version={v} view={view} results={results} />
            ))}
          </div>
        );
      })}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-ink-2">
        <span>One bar per conversation, in case table order.</span>
        {LEGEND.map((o) => (
          <span key={o} className="inline-flex items-center gap-1.5">
            <span aria-hidden className={"inline-block size-2.5 rounded-[2px] " + LEGEND_BG[o]} />
            {OUTCOME_LABEL[o]}
          </span>
        ))}
      </div>
    </div>
  );
}
