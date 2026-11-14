import type { Metadata } from "next";
import { CASES } from "@/lib/cases.mjs";
import { summarizeVersion } from "@/lib/score.mjs";
import { editablePrompt, FORMAT, orderedCases, RESULTS } from "@/components/bench";
import { LabRunner } from "@/components/lab/lab-runner";

export const metadata: Metadata = {
  title: "Prompt lab · Payable as Stated",
};

export default function LabPage() {
  const cases = orderedCases().map((c) => ({ id: c.id, title: c.title, group: c.group }));
  const recorded = {
    full: { v1: summarizeVersion(RESULTS, "v1", CASES, "full"), v2: summarizeVersion(RESULTS, "v2", CASES, "full") },
    statement: {
      v1: summarizeVersion(RESULTS, "v1", CASES, "statement"),
      v2: summarizeVersion(RESULTS, "v2", CASES, "statement"),
    },
  };

  return (
    <div>
      <header className="prose-col">
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[32px]">Prompt lab</h1>
        <p className="mt-3 text-[16px] text-ink-2">
          Edit the agent&apos;s instructions and run all {CASES.length} cases against them. Each case runs once with
          the same scripted patient and the same judge as the recorded bench. It starts on the statement-only record,
          because that is where the recorded runs show instructions making a difference; with the full record both
          recorded versions are close to the ceiling.
        </p>
      </header>

      <div className="mt-8">
        <LabRunner
          cases={cases}
          prompts={{ v1: editablePrompt("v1"), v2: editablePrompt("v2") }}
          format={FORMAT}
          recorded={recorded}
          recordedTrials={RESULTS.trials || 3}
          at_risk={Object.fromEntries(CASES.map((c) => [c.id, c.at_risk]))}
        />
      </div>
    </div>
  );
}
