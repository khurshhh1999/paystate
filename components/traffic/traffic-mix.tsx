"use client";

// Owns the mix: the weight given to each of the 28 situations. The result and the table below
// both recompute from it, so changing an assumption shows what it does to the headline figure.

import { useMemo, useState } from "react";
import { TRAFFIC_CASES, MIX_NOTE } from "@/lib/traffic.mjs";
import { Segmented } from "@/components/ui";
import { caseRows, hasRuns, presetWeights, summarize, TRAFFIC, type MixId, type Weights } from "./compute";
import { TrafficTable } from "./traffic-table";

const MIXES: { value: MixId; label: string }[] = [
  { value: "assumed", label: "Assumed mix" },
  { value: "hard", label: "Hard cases doubled" },
  { value: "even", label: "Even" },
];

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

const WORDS = ["No", "One", "Two", "Three", "Four", "Five"];
const runsPer = (n: number) => `${WORDS[n] ?? n} ${n === 1 ? "run" : "runs"}`;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function TrafficMix({ runDate }: { runDate: string | null }) {
  const [mix, setMix] = useState<MixId | "custom">("assumed");
  const [weights, setWeights] = useState<Weights>(() => presetWeights("assumed"));

  const ran = hasRuns(TRAFFIC);
  const summary = useMemo(() => summarize(TRAFFIC, weights), [weights]);
  const rows = useMemo(() => caseRows(TRAFFIC, weights), [weights]);
  const total = Object.values(weights).reduce((s, v) => s + v, 0);

  const choose = (m: MixId | "custom") => {
    if (m === "custom") return;
    setMix(m);
    setWeights(presetWeights(m));
  };

  const setOne = (id: string, raw: string) => {
    const n = Number(raw);
    setWeights((cur) => ({ ...cur, [id]: Number.isFinite(n) ? clamp(n) : 0 }));
    setMix("custom");
  };

  return (
    <>
      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="result">
        <h2 id="result" className="text-[20px] font-semibold">
          Result
        </h2>
        {!ran ? (
          <p className="mt-2 text-ink-2">Not run yet.</p>
        ) : (
          <div aria-live="polite" className="prose-col">
            <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="num text-[40px] font-medium leading-none">
                {summary.weightedRate === null ? "–" : `${(summary.weightedRate * 100).toFixed(1)}%`}
              </span>
              <span className="text-[14.5px] text-ink-2">right outcome, weighted by the mix</span>
            </p>
            <p className="mt-4 text-[14.5px]">
              <span className="tabular-nums">{plural(summary.trials, "conversation", "conversations")}</span> run.{" "}
              <span className="tabular-nums">
                {summary.right} of {summary.trials}
              </span>{" "}
              right, unweighted.{" "}
              <span className={"tabular-nums " + (summary.wrongCollects > 0 ? "text-wrong" : "")}>
                {plural(summary.wrongCollects, "wrong collect", "wrong collects")}
              </span>
              .{" "}
              <span className="tabular-nums">
                {plural(summary.blocked, "payment step", "payment steps")}
              </span>{" "}
              blocked by the gate.
            </p>
            {summary.casesMissing > 0 && (
              <p className="mt-2 text-[14px] text-ink-2">
                {summary.casesMissing} of {TRAFFIC_CASES.length} situations have no runs yet. Their weights are left
                out and the rest rescaled.
              </p>
            )}
            <p className="mt-2 text-[14px] text-ink-2">
              {runsPer(TRAFFIC.trialsPerCase)} per situation, so this is a first reading, and the weights are
              assumptions. Model: <span className="num">{TRAFFIC.model}</span>.{runDate && <> Run {runDate}.</>}
            </p>
          </div>
        )}
      </section>

      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="mix">
        <h2 id="mix" className="text-[20px] font-semibold">
          Change the mix
        </h2>
        <p className="prose-col mt-1 text-[14px] text-ink-2">{MIX_NOTE}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Segmented<MixId | "custom"> label="Mix" options={MIXES} value={mix} onChange={choose} />
          {mix === "custom" && <span className="text-[13.5px] text-ink-3">Your own weights</span>}
        </div>
        <details className="mt-4 max-w-[760px]">
          <summary className="w-fit cursor-pointer text-[14px] text-accent underline-offset-2 hover:underline">
            Edit weights
          </summary>
          <p className="mt-3 text-[13.5px] text-ink-2">
            Total <span className="num text-ink">{round1(total)}</span>. Weights are rescaled to 100.
          </p>
          <div className="mt-2 grid gap-x-8 border-t border-rule sm:grid-cols-2">
            {TRAFFIC_CASES.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 border-b border-rule py-1.5">
                <label htmlFor={`w-${c.id}`} className="min-w-0 text-[14px]">
                  {c.title}
                </label>
                <input
                  id={`w-${c.id}`}
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={round1(weights[c.id] ?? 0)}
                  onChange={(e) => setOne(c.id, e.target.value)}
                  className="num h-8 w-20 shrink-0 rounded-md border border-rule-strong bg-surface px-2 text-right text-[13.5px] text-ink"
                />
              </div>
            ))}
          </div>
        </details>
      </section>

      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="situations">
        <h2 id="situations" className="text-[20px] font-semibold">
          The {TRAFFIC_CASES.length} situations
        </h2>
        <p className="prose-col mt-1 text-[14px] text-ink-2">
          Most common first under the current mix. Gate is what the payment gate decides from the full record.
        </p>
        <div className="mt-4">
          <TrafficTable rows={rows} trialsPerCase={TRAFFIC.trialsPerCase} />
        </div>
      </section>
    </>
  );
}
