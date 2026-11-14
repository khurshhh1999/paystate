"use client";

import { useState } from "react";
import type { Trial, Version, View } from "@/lib/types";
import { OutcomeDot, Panel, Segmented } from "@/components/ui";
import { Transcript, VerdictBlock } from "./transcript";
import { VIEW_OPTIONS } from "./views";

function VersionColumn({ version, note, trials }: { version: Version; note: string; trials: Trial[] }) {
  const [index, setIndex] = useState("0");
  const i = Number(index) < trials.length ? Number(index) : 0;
  const trial = trials[i];

  return (
    <Panel className="flex min-w-0 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{version}</h3>
          <p className="text-[13px] text-ink-2">{note}</p>
        </div>
        {trials.length > 1 && (
          <Segmented
            label={`${version} trial`}
            value={String(i)}
            onChange={setIndex}
            options={trials.map((t, n) => ({ value: String(n), label: String(n + 1) }))}
          />
        )}
      </div>
      {trial ? (
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center gap-2 text-[13px] text-ink-2">
            <span>
              Trial {i + 1} of {trials.length}
            </span>
            <span className="flex gap-1" aria-hidden>
              {trials.map((t, n) => (
                <OutcomeDot key={n} outcome={t.verdict.outcome} />
              ))}
            </span>
          </div>
          <Transcript turns={trial.transcript} agentLabel={`Agent ${version}`} />
          <VerdictBlock verdict={trial.verdict} />
        </div>
      ) : (
        <p className="p-4 text-[14px] text-ink-3">Not run yet. Recorded runs appear here once the bench has been run.</p>
      )}
    </Panel>
  );
}

function DotRow({ trials }: { trials: Trial[] }) {
  if (trials.length === 0) return <span className="text-ink-3">not run</span>;
  return (
    <span className="inline-flex gap-1 align-middle">
      {trials.map((t, n) => (
        <OutcomeDot key={n} outcome={t.verdict.outcome} />
      ))}
    </span>
  );
}

export function RecordedRuns({
  trials,
  notes,
  defaultView,
}: {
  trials: Record<View, Record<Version, Trial[]>>;
  notes: Record<Version, string>;
  defaultView: View;
}) {
  const [view, setView] = useState<View>(defaultView);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Segmented label="What the agent saw" value={view} onChange={setView} options={VIEW_OPTIONS} />
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
          {VIEW_OPTIONS.map((o) => (
            <div key={o.value} className="flex items-center gap-2">
              <dt>{o.label}</dt>
              <dd className="flex items-center gap-2">
                v1 <DotRow trials={trials[o.value].v1} /> v2 <DotRow trials={trials[o.value].v2} />
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Keyed by view so the trial picker starts at trial 1 when the view changes. */}
        <VersionColumn key={`v1-${view}`} version="v1" note={notes.v1} trials={trials[view].v1} />
        <VersionColumn key={`v2-${view}`} version="v2" note={notes.v2} trials={trials[view].v2} />
      </div>
    </div>
  );
}
