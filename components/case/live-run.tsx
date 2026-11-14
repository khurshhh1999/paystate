"use client";

import { useState } from "react";
import type { Trial, Version, View } from "@/lib/types";
import { Button, ErrorText, Panel, Segmented } from "@/components/ui";
import { postJSON } from "@/components/api";
import { Transcript, VerdictBlock } from "./transcript";
import { VIEW_OPTIONS } from "./views";

type RunState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; trial: Trial; at: string; view: View };

const IDLE: RunState = { status: "idle" };

export function LiveRun({ caseId, defaultView }: { caseId: string; defaultView: View }) {
  const [view, setView] = useState<View>(defaultView);
  const [runs, setRuns] = useState<Record<Version, RunState>>({ v1: IDLE, v2: IDLE });
  const busy = runs.v1.status === "loading" || runs.v2.status === "loading";

  async function run(version: Version) {
    const runView = view;
    setRuns((r) => ({ ...r, [version]: { status: "loading" } }));
    try {
      const trial = await postJSON<Trial>("/api/run-case", { caseId, version, view: runView });
      const at = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      setRuns((r) => ({ ...r, [version]: { status: "done", trial, at, view: runView } }));
    } catch (e) {
      setRuns((r) => ({ ...r, [version]: { status: "error", message: (e as Error).message } }));
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="What the agent sees" value={view} onChange={setView} options={VIEW_OPTIONS} disabled={busy} />
        <span className="text-[13.5px] text-ink-2">Applies to the next run.</span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {(["v1", "v2"] as Version[]).map((v) => {
          const s = runs[v];
          return (
            <div key={v} className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => run(v)} disabled={s.status === "loading"} variant={v === "v2" ? "primary" : "quiet"}>
                  {s.status === "loading" ? `Running ${v}…` : s.status === "done" ? `Run ${v} again` : `Run ${v} now`}
                </Button>
                {s.status === "loading" && (
                  <span className="text-[13.5px] text-ink-2" aria-live="polite">
                    Two agent replies and a grade. Usually 10 to 30 seconds.
                  </span>
                )}
              </div>
              {s.status === "error" && <ErrorText>{s.message}</ErrorText>}
              {s.status === "done" && (
                <Panel className="flex flex-col">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
                    <h3 className="font-semibold">
                      {v}, live run, {s.view === "full" ? "full record" : "statement only"}
                    </h3>
                    <span className="text-[13px] text-ink-2">Run at {s.at}. Not saved.</span>
                  </div>
                  <div className="flex flex-col gap-4 p-4">
                    <Transcript turns={s.trial.transcript} agentLabel={`Agent ${v}`} />
                    <VerdictBlock verdict={s.trial.verdict} />
                  </div>
                </Panel>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
