import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CASES, PRACTICE_POLICY } from "@/lib/cases.mjs";
import { recordForView } from "@/lib/prompts.mjs";
import type { Trial, View } from "@/lib/types";
import { Money } from "@/components/ui";
import { getCase, orderedCases, RESULTS, SHOULD_PAY, trialsFor, VERSION_NOTE } from "@/components/bench";
import { RecordView } from "@/components/case/record-view";
import { RecordPanel } from "@/components/case/record-panel";
import { RecordedRuns } from "@/components/case/recorded-runs";
import { LiveRun } from "@/components/case/live-run";
import { BeThePatient } from "@/components/case/be-the-patient";

type Props = { params: Promise<{ id: string }> };

// All twelve case pages are built ahead of time; an unknown id can wait for the server.
export const instant = false;

export function generateStaticParams() {
  return CASES.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const kase = getCase(id);
  return { title: kase ? `${kase.title} · Payable as Stated` : "Case not found · Payable as Stated" };
}

function Section({ title, intro, children }: { title: string; intro?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      {intro && <p className="prose-col mt-1 text-ink-2">{intro}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function CasePage({ params }: Props) {
  const { id } = await params;
  const kase = getCase(id);
  if (!kase) notFound();

  const order = orderedCases();
  const i = order.findIndex((c) => c.id === kase.id);
  const prev = order[i - 1];
  const next = order[i + 1];
  const trials: Record<View, Record<"v1" | "v2", Trial[]>> = {
    full: { v1: trialsFor("v1", kase.id, "full"), v2: trialsFor("v2", kase.id, "full") },
    statement: { v1: trialsFor("v1", kase.id, "statement"), v2: trialsFor("v2", kase.id, "statement") },
  };
  const failed = (view: View) =>
    [...trials[view].v1, ...trials[view].v2].some((t) => t.verdict.outcome === "dead_end" || t.verdict.outcome === "wrong_collect");
  const defaultView: View = failed("statement") && !failed("full") ? "statement" : "full";

  const records = { full: recordForView(kase, "full"), statement: recordForView(kase, "statement") };
  const notes: Record<string, string> = {};
  for (const [k, v] of Object.entries(records.full)) {
    if (!(k in records.statement)) notes[k] = "Not on the statement";
    else if (JSON.stringify(v) !== JSON.stringify(records.statement[k])) notes[k] = "Partly on the statement";
  }

  return (
    <div>
      <p className="text-[14px]">
        <Link href="/evidence" className="text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-ink">
          All cases
        </Link>
      </p>

      <header className="mt-4">
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[32px]">{kase.title}</h1>
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-[14.5px]">
          <div className="flex gap-2">
            <dt className="text-ink-2">Patient</dt>
            <dd>{kase.patient}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-2">Statement balance</dt>
            <dd>
              <Money value={kase.balance} />
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-2">Should pay as stated</dt>
            <dd>{SHOULD_PAY[kase.group]}</dd>
          </div>
          {kase.at_risk > 0 && (
            <div className="flex gap-2">
              <dt className="text-ink-2">Not owed as stated</dt>
              <dd>
                <Money value={kase.at_risk} className="text-wrong" />
              </dd>
            </div>
          )}
        </dl>
        <blockquote className="prose-col mt-5 border-l-2 border-rule-strong pl-4 text-[16px]">
          <p>{kase.opener}</p>
          <p className="mt-2 text-ink-2">Follow-up: {kase.followup}</p>
        </blockquote>
      </header>

      <Section
        title="What the agent can see"
        intro="The full record is what a practice management system and clearinghouse feed would supply. The statement-only agent gets what the patient's statement prints. Both also get the practice policy, shown under the record."
      >
        <RecordPanel records={records} notes={notes} />
        <details className="mt-3 text-[14px]">
          <summary className="cursor-pointer text-ink-2 hover:text-ink">Practice policy</summary>
          <div className="mt-2 px-1">
            <RecordView record={PRACTICE_POLICY} />
          </div>
        </details>
      </Section>

      <Section title="What a senior biller would do" intro="The answer key. Only the judge sees it.">
        <dl className="prose-col divide-y divide-rule border-y border-rule">
          <div className="grid gap-x-6 gap-y-0.5 py-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-ink-2">Payable as stated</dt>
            <dd>{kase.truth.payable}</dd>
          </div>
          <div className="grid gap-x-6 gap-y-0.5 py-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-ink-2">Right move</dt>
            <dd>{kase.truth.right_move}</dd>
          </div>
          <div className="grid gap-x-6 gap-y-0.5 py-3 sm:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-ink-2">Fails if</dt>
            <dd>{kase.truth.fail_if}</dd>
          </div>
        </dl>
      </Section>

      <Section
        title="Recorded runs"
        intro={`Each version ran this case ${RESULTS.trials || 3} times with the full record and ${RESULTS.trials || 3} times with the statement only, with the same scripted patient. Pick what the agent saw and a trial to read it.`}
      >
        <RecordedRuns trials={trials} notes={VERSION_NOTE} defaultView={defaultView} />
      </Section>

      <Section
        title="Run it again, live"
        intro="Runs the same scripted conversation now and grades it. Outputs vary from run to run, which is why the recorded numbers use three trials."
      >
        <LiveRun caseId={kase.id} defaultView={defaultView} />
      </Section>

      <Section
        title="Be the patient"
        intro="Write the patient's side yourself and see how the agent handles it. Up to five messages, then ask the judge to grade it against the same answer key."
      >
        <BeThePatient caseId={kase.id} opener={kase.opener} defaultView={defaultView} />
      </Section>

      <nav aria-label="Other cases" className="mt-14 flex flex-wrap justify-between gap-4 border-t border-rule pt-5 text-[14.5px]">
        {prev ? (
          <Link href={`/cases/${prev.id}`} className="underline decoration-rule-strong underline-offset-4 hover:text-accent">
            Previous: {prev.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/cases/${next.id}`} className="text-right underline decoration-rule-strong underline-offset-4 hover:text-accent">
            Next: {next.title}
          </Link>
        ) : (
          <Link href="/evidence" className="underline decoration-rule-strong underline-offset-4 hover:text-accent">
            Back to all cases
          </Link>
        )}
      </nav>
    </div>
  );
}
