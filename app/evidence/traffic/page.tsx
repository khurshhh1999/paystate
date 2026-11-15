import type { Metadata } from "next";
import { CASES } from "@/lib/cases.mjs";
import { COMMON_CASES } from "@/lib/cases-common.mjs";
import { TRAFFIC_CASES } from "@/lib/traffic.mjs";
import { formatDate } from "@/components/bench";
import { TRAFFIC } from "@/components/traffic/compute";
import { TrafficMix } from "@/components/traffic/traffic-mix";
import { GateCheck } from "@/components/traffic/gate-check";
import { MissesChanged } from "@/components/traffic/misses-changed";

export const metadata: Metadata = {
  title: "Traffic set · Paystate",
  description:
    "The twelve hard cases plus sixteen ordinary ones, weighted by an assumed share of inbound conversations and run with a simulated patient and a payment gate in code.",
};

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const spell = (n: number) => WORDS[n] ?? String(n);

const LIMITS = [
  "The patients are simulated by a model, not real people.",
  "The mix is assumed, not measured from a practice's messages.",
  `Each situation ran ${spell(TRAFFIC.trialsPerCase)} times.`,
  "One practice's policy: Northfield Medical Group's.",
  "The same model family plays the patient, the assistant and the judge.",
];

export default function TrafficPage() {
  return (
    <div>
      <header className="prose-col">
        <h1 className="text-[28px] font-semibold leading-[1.2] sm:text-[32px]">Traffic set</h1>
        <p className="mt-4 text-[16px] text-ink-2">
          The bench uses {spell(CASES.length)} cases picked because they are hard. This set adds{" "}
          {spell(COMMON_CASES.length)} ordinary ones and weights all {TRAFFIC_CASES.length} by an assumed share of inbound
          conversations. Each was run with a simulated patient who replies in their own words for up to{" "}
          {spell(TRAFFIC.maxPatientTurns)} messages, and with the payment gate in code: the assistant cannot send a pay
          link or set up a plan on a balance the gate has blocked. The run used Opus 5.5 at low effort, the model the
          live site uses. The bench used Sonnet 5.5, so the two sets of figures are not comparable.
        </p>
      </header>

      <TrafficMix runDate={formatDate(TRAFFIC.generatedAt)} />

      <MissesChanged />

      <GateCheck />

      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="limits">
        <h2 id="limits" className="text-[20px] font-semibold">
          What this still is not
        </h2>
        <ul className="prose-col mt-3 list-disc space-y-1.5 pl-5 text-[15px] marker:text-ink-3">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
