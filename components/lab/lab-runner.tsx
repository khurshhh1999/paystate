"use client";

import { useEffect, useRef, useState } from "react";
import { summarizeTrials } from "@/lib/score.mjs";
import type { Case, Trial, Version, VersionSummary, View } from "@/lib/types";
import { Button, ErrorText, Money, OutcomeBadge, Panel, Segmented } from "@/components/ui";
import { isLimited, postJSON } from "@/components/api";
import { StatusBars, type StripCell } from "@/components/obsidian/status-bars";
import { Transcript, VerdictBlock } from "@/components/case/transcript";
import { VIEW_OPTIONS } from "@/components/case/views";

const VIEW_NAME: Record<View, string> = { full: "full record", statement: "statement only" };

const STORAGE_KEY = "payable-as-stated:lab-prompt";
const MAX_IN_FLIGHT = 3;
// Same cap as MAX_CUSTOM_PROMPT in lib/api-validate.mjs; checked here so a long prompt is not sent.
const MAX_INSTRUCTIONS = 4000;

type LabCase = Pick<Case, "id" | "title" | "group">;

type Row =
  | { status: "queued" }
  | { status: "running" }
  | { status: "done"; trial: Trial }
  | { status: "error"; message: string }
  | { status: "skipped" }
  | { status: "cancelled" };

type Phase = "idle" | "running" | "done" | "cancelled";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(value: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Storage unavailable (private window, blocked): the prompt just is not remembered.
  }
}

export function LabRunner({
  cases,
  prompts,
  format,
  recorded,
  recordedTrials,
  at_risk,
}: {
  cases: LabCase[];
  prompts: Record<Version, string>;
  format: string;
  recorded: Record<View, Record<Version, VersionSummary>>;
  recordedTrials: number;
  at_risk: Record<string, number>;
}) {
  const [prompt, setPrompt] = useState(prompts.v2);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [phase, setPhase] = useState<Phase>("idle");
  const [view, setView] = useState<View>("statement");
  // The view the last run used, so the comparison matches it even if the toggle moves afterwards.
  const [runView, setRunView] = useState<View>("statement");
  // Set when the run stopped at a usage limit; the server message says when runs open again.
  const [limitNote, setLimitNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const restored = useRef(false);

  // Restore the visitor's last prompt after hydration so server and client render the same first frame.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = readStored();
    if (saved && saved !== prompts.v2) queueMicrotask(() => setPrompt(saved));
  }, [prompts.v2]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function edit(value: string) {
    setPrompt(value);
    writeStored(value);
  }

  async function runAll() {
    const text = prompt.trim();
    if (!text || text.length > MAX_INSTRUCTIONS) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLimitNote(null);
    setRunView(view);
    const chosenView = view;
    setPhase("running");
    setRows(Object.fromEntries(cases.map((c) => [c.id, { status: "queued" } as Row])));

    const queue = cases.map((c) => c.id);
    let limited: string | null = null;

    async function worker() {
      while (queue.length && !controller.signal.aborted) {
        const id = queue.shift()!;
        setRows((r) => ({ ...r, [id]: { status: "running" } }));
        try {
          const trial = await postJSON<Trial>("/api/run-case", { caseId: id, customPrompt: text, view: chosenView }, controller.signal);
          setRows((r) => ({ ...r, [id]: { status: "done", trial } }));
        } catch (e) {
          if ((e as Error).name === "AbortError") {
            setRows((r) => ({ ...r, [id]: { status: "cancelled" } }));
            return;
          }
          if (isLimited(e)) {
            // Every later case would be refused too, so stop sending.
            limited = (e as Error).message;
            queue.length = 0;
            setRows((r) => ({ ...r, [id]: { status: "skipped" } }));
            return;
          }
          setRows((r) => ({ ...r, [id]: { status: "error", message: (e as Error).message } }));
        }
      }
    }

    await Promise.all(Array.from({ length: MAX_IN_FLIGHT }, worker));

    if (controller.signal.aborted) {
      setRows((r) =>
        Object.fromEntries(
          Object.entries(r).map(([k, v]) => [k, v.status === "queued" || v.status === "running" ? { status: "cancelled" } : v]),
        ),
      );
      setPhase("cancelled");
    } else {
      if (limited) {
        setRows((r) =>
          Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.status === "queued" ? { status: "skipped" } : v])),
        );
      }
      setPhase("done");
    }
    setLimitNote(limited);
    abortRef.current = null;
  }

  function cancel() {
    abortRef.current?.abort();
  }

  const running = phase === "running";
  const graded = cases.flatMap((c) => {
    const r = rows[c.id];
    return r?.status === "done" ? [{ caseId: c.id, verdict: r.trial.verdict }] : [];
  });
  const finished = cases.filter((c) => {
    const s = rows[c.id]?.status;
    return s === "done" || s === "error";
  }).length;
  const skipped = cases.filter((c) => rows[c.id]?.status === "skipped").length;
  const tooLong = prompt.trim().length > MAX_INSTRUCTIONS;

  const cells: StripCell[] = cases.map((c) => {
    const r = rows[c.id];
    return {
      key: c.id,
      outcome: r?.status === "done" ? r.trial.verdict.outcome : null,
      pending: r?.status === "running",
      label: c.title,
      detail: r?.status === "done" ? r.trial.verdict.reason : r?.status === "error" ? r.message : undefined,
    };
  });

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="instructions">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="instructions" className="text-[20px] font-semibold">
            Assistant instructions
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="quiet" onClick={() => edit(prompts.v1)} disabled={running}>
              Start from v1
            </Button>
            <Button variant="quiet" onClick={() => edit(prompts.v2)} disabled={running}>
              Start from v2
            </Button>
          </div>
        </div>
        <label htmlFor="lab-prompt" className="sr-only">
          Assistant instructions
        </label>
        <textarea
          id="lab-prompt"
          value={prompt}
          onChange={(e) => edit(e.target.value)}
          disabled={running}
          spellCheck={false}
          rows={22}
          className="num mt-3 w-full resize-y rounded-lg border border-rule-strong bg-surface px-4 py-3 text-[13px] leading-[1.6] text-ink disabled:opacity-70"
        />
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[13px] text-ink-2">
          <span>
            The output-format line is appended automatically, so the judge can read the assistant&apos;s declared actions.
            Your edits are kept in this browser.
          </span>
          <span className={"num " + (tooLong ? "text-wrong" : "")}>
            {prompt.length.toLocaleString("en-US")} of {MAX_INSTRUCTIONS.toLocaleString("en-US")} characters
          </span>
        </div>
        <details className="mt-2 text-[13px]">
          <summary className="cursor-pointer text-ink-2 hover:text-ink">Show the appended format line</summary>
          <pre className="num mt-2 whitespace-pre-wrap rounded-md bg-sunken px-3 py-2 text-[12.5px] text-ink-2">{format}</pre>
        </details>
      </section>

      <section aria-labelledby="run">
        <h2 id="run" className="text-[20px] font-semibold">
          Run
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Segmented label="What the assistant sees" value={view} onChange={setView} options={VIEW_OPTIONS} disabled={running} />
          <span className="text-[13.5px] text-ink-2">
            {view === "statement"
              ? "Service, amounts and payer name only: no remittance codes, eligibility, ledger or intake."
              : "Everything in the account record."}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={runAll} disabled={running || !prompt.trim() || tooLong}>
            {running ? "Running…" : phase === "idle" ? `Run all ${cases.length} cases` : `Run all ${cases.length} cases again`}
          </Button>
          {running && (
            <Button variant="quiet" onClick={cancel}>
              Cancel
            </Button>
          )}
          <span className="num text-[13.5px] text-ink-2" aria-live="polite">
            {phase === "idle"
              ? `One trial per case, ${MAX_IN_FLIGHT} at a time.`
              : `${finished} of ${cases.length} done${skipped ? `, ${skipped} not run` : ""}${phase === "cancelled" ? ", cancelled" : ""}`}
          </span>
        </div>
        {!prompt.trim() && <p className="mt-2 text-[13.5px] text-ink-3">Write some instructions first.</p>}
        {tooLong && (
          <div className="mt-2">
            <ErrorText>
              Live runs take instructions up to {MAX_INSTRUCTIONS.toLocaleString("en-US")} characters. Shorten these to run
              them.
            </ErrorText>
          </div>
        )}
        {limitNote && (
          <p className="prose-col mt-2 text-[13.5px] text-ink-2" aria-live="polite">
            {limitNote}
          </p>
        )}

        {phase !== "idle" && (
          <div className="mt-5 flex flex-col gap-5">
            <StatusBars cells={cells} label="This run: one bar per case" emptyWord="Waiting" />
            <ul className="border-t border-rule">
              {cases.map((c) => (
                <ResultRow key={c.id} kase={c} row={rows[c.id] ?? { status: "queued" }} />
              ))}
            </ul>
          </div>
        )}
      </section>

      {(phase === "done" || phase === "cancelled") && graded.length > 0 && (
        <section aria-labelledby="lab-score">
          <h2 id="lab-score" className="text-[20px] font-semibold">
            This run beside the recorded versions, {VIEW_NAME[runView]}
          </h2>
          <LabScorecard
            run={summarizeTrials(graded, Object.entries(at_risk).map(([id, r]) => ({ id, at_risk: r })), 1)}
            recorded={recorded[runView]}
            viewName={VIEW_NAME[runView]}
            recordedTrials={recordedTrials}
            caseCount={cases.length}
            partial={graded.length < cases.length}
          />
        </section>
      )}
    </div>
  );
}

function ResultRow({ kase, row }: { kase: LabCase; row: Row }) {
  const head = (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-3 sm:grid-cols-[220px_130px_minmax(0,1fr)]">
      <span className="font-medium">{kase.title}</span>
      <span className="justify-self-end sm:justify-self-start">
        {row.status === "done" ? (
          <OutcomeBadge outcome={row.trial.verdict.outcome} />
        ) : (
          <span className="text-[13px] text-ink-3">
            {row.status === "queued"
              ? "Waiting"
              : row.status === "running"
                ? "Running…"
                : row.status === "cancelled"
                  ? "Cancelled"
                  : row.status === "skipped"
                    ? "Not run"
                    : "Failed"}
          </span>
        )}
      </span>
      <span className="col-span-2 text-[14px] text-ink-2 sm:col-span-1">
        {row.status === "done" ? row.trial.verdict.reason : row.status === "error" ? <span className="text-wrong">{row.message}</span> : null}
      </span>
    </div>
  );

  if (row.status !== "done") return <li className="border-b border-rule">{head}</li>;

  return (
    <li className="border-b border-rule">
      <details className="group">
        <summary className="cursor-pointer list-none hover:bg-sunken [&::-webkit-details-marker]:hidden">
          {head}
          <span className="sr-only">Show transcript</span>
        </summary>
        <div className="pb-4">
          <Panel className="flex flex-col gap-4 p-4">
            <Transcript turns={row.trial.transcript} agentLabel="Assistant (your instructions)" />
            <VerdictBlock verdict={row.trial.verdict} />
          </Panel>
        </div>
      </details>
    </li>
  );
}

function rate(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : "–";
}

function LabScorecard({
  run,
  recorded,
  viewName,
  recordedTrials,
  caseCount,
  partial,
}: {
  run: VersionSummary;
  viewName: string;
  recorded: Record<Version, VersionSummary>;
  recordedTrials: number;
  caseCount: number;
  partial: boolean;
}) {
  const cols: { key: string; label: string; s: VersionSummary }[] = [
    { key: "run", label: "This run", s: run },
    { key: "v1", label: "v1 recorded", s: recorded.v1 },
    { key: "v2", label: "v2 recorded", s: recorded.v2 },
  ];
  const rows: { label: string; cell: (s: VersionSummary) => React.ReactNode }[] = [
    { label: "Right outcome", cell: (s) => rate(s.right, s.trials) },
    { label: "Wrong collect", cell: (s) => rate(s.wrong_collect, s.trials) },
    { label: "Dead end", cell: (s) => rate(s.dead_end, s.trials) },
    { label: "Resolved without staff", cell: (s) => rate(s.resolved, s.trials) },
    { label: "Every statement accurate", cell: (s) => rate(s.accurate, s.trials) },
    { label: "Asked for wrongly, per pass", cell: (s) => <Money value={s.wrongCollectDollars} /> },
    { label: "Conversations graded", cell: (s) => s.trials },
  ];

  return (
    <div className="mt-3">
      <p className="prose-col text-[14px] text-ink-2">
        Rates, because the sizes differ: this run is one trial per case ({run.trials} graded
        {partial ? ` of ${caseCount}, so it is partial` : ""}); the recorded numbers are {recordedTrials} trials per
        case with the same record view ({viewName}). The recorded numbers ran on Sonnet 5.5 and this run uses Opus 5.5, so the columns are not a like-for-like
        comparison. One trial per case is also noisy: rerun before drawing a conclusion.
      </p>
      <div className="table-scroll mt-4">
        <table className="ledger">
          <thead>
            <tr>
              <th scope="col">Measure</th>
              {cols.map((c) => (
                <th key={c.key} scope="col" className="r">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                {cols.map((c) => (
                  <td key={c.key} className={"r num whitespace-nowrap " + (c.key === "run" ? "font-medium" : "")}>
                    {c.s.trials ? r.cell(c.s) : <span className="text-ink-3">Not run</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
