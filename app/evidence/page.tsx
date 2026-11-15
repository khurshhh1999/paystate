import type { Metadata } from "next";
import Link from "next/link";
import { CASES } from "@/lib/cases.mjs";
import { GATE_EXPECTED } from "@/lib/traffic.mjs";
import type { Case, Version, View } from "@/lib/types";
import { EmptyDot, Money, money, OutcomeBadge, OutcomeDot, type Outcome } from "@/components/ui";
import {
  feedRunCount,
  formatDate,
  GROUP_HEADING,
  GROUP_ORDER,
  hasRuns,
  RESULTS,
  SHOULD_PAY,
  trialsFor,
  VERSIONS,
  VIEW_ORDER,
} from "@/components/bench";
import { Scorecard, summarizeAll } from "@/components/scorecard";
import { Findings } from "@/components/findings";
import { DiscoverButton } from "@/components/obsidian/discover-button";

export const metadata: Metadata = {
  title: "Evidence · Paystate",
  description:
    "The test bench behind the product pages: twelve billing cases, 324 graded conversations, and every transcript.",
};

const OUTCOMES: { outcome: Outcome; text: string }[] = [
  {
    outcome: "resolved",
    text: "The patient's issue was handled correctly and completely, with no staff needed.",
  },
  {
    outcome: "correct_handoff",
    text: "Staff were needed, and before handing off the assistant told the patient the right thing and placed a hold or captured what staff will need.",
  },
  {
    outcome: "dead_end",
    text: "Wrong or generic information, a handoff of something the assistant was allowed to do itself, or a patient left without a next step.",
  },
  {
    outcome: "wrong_collect",
    text: "The assistant asked for, accepted or scheduled money the patient should not pay as stated, or asked a bereaved relative for payment. This overrides everything else in the conversation.",
  },
];

const VIEW_HEADING: Record<View, string> = { full: "All feeds", statement: "Balance only" };

// The group says yes or no; a bill where only part is owed says how much, from the gate's expected result.
function shouldPay(id: string, group: Case["group"]): string {
  const expected = GATE_EXPECTED[id];
  if (expected?.status === "partial") return `Part: ${money(expected.owed ?? 0)}`;
  return SHOULD_PAY[group];
}

// Cases with a wrong collect in the balance-only runs, by title.
function wrongCollectCases(): string[] {
  return CASES.filter((c) =>
    VERSIONS.some((v) => trialsFor(v, c.id, "statement").some((t) => t.verdict.outcome === "wrong_collect")),
  ).map((c) => c.title);
}

const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const spell = (n: number) => WORDS[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function TrialDots({ version, caseId, view }: { version: Version; caseId: string; view: View }) {
  const trials = trialsFor(version, caseId, view);
  const n = Math.max(RESULTS.trials || 3, trials.length);
  // Raised above the row's stretched link so each square's tooltip shows on hover.
  return (
    <span className="relative z-[1] inline-flex gap-1">
      {Array.from({ length: n }, (_, i) =>
        trials[i] ? <OutcomeDot key={i} outcome={trials[i].verdict.outcome} /> : <EmptyDot key={i} />,
      )}
    </span>
  );
}

export default function BenchPage() {
  const all = summarizeAll(RESULTS);
  const row = (view: View) => ({
    right: all[view].v1.right + all[view].v2.right,
    total: all[view].v1.trials + all[view].v2.trials,
    wrong: all[view].v1.wrong_collect + all[view].v2.wrong_collect,
  });
  const full = row("full");
  const statement = row("statement");
  const feeds = feedRunCount();
  const graded = full.total + statement.total + feeds;
  const ranFull = hasRuns("full");
  const ranStatement = hasRuns("statement");
  const runDate = formatDate(RESULTS.generatedAt);
  const trials = RESULTS.trials || 3;
  const wrongCases = wrongCollectCases();

  return (
    <div>
      <header className="prose-col">
        <h1 className="text-[28px] font-semibold leading-[1.2] sm:text-[32px]">Evidence</h1>
        <p className="mt-4 text-[15px] text-ink">
          Every patient, account and record here is synthetic. I wrote them.
        </p>
        <p className="mt-3 text-[16px] text-ink-2">
          This page is the bench behind the patient thread, the staff queue and the go-live check.{" "}
          {capital(spell(CASES.length))} hard patient situations
          {graded > 0 ? (
            <>
              , <span className="tabular-nums">{graded}</span> graded conversations: {full.total} with the full account record,{" "}
              {statement.total} with the balance only and {feeds} with some feeds removed. The assistant and the judge
              are both Sonnet 5.5 with thinking off.
            </>
          ) : (
            "."
          )}{" "}
          The traffic set, the prompt lab and the live runs on case pages use Opus 5.5 at low effort, the model the live
          site runs, so their figures are not comparable with the ones on this page.
        </p>
        <p className="mt-3 text-[16px] text-ink-2">
          {ranFull && (
            <>
              With the full record, the assistant reached the right outcome in{" "}
              <span className="tabular-nums text-ink">
                {full.right} of {full.total}
              </span>
              .{" "}
            </>
          )}
          {ranStatement && (
            <>
              Shown only the balance, it reached{" "}
              <span className="tabular-nums text-ink">
                {statement.right} of {statement.total}
              </span>
              {statement.wrong > 0 ? (
                <>
                  , and offered to take payment for a bill the patient did not owe in{" "}
                  <span className="tabular-nums text-wrong">{statement.wrong}</span>{" "}
                  {statement.wrong === 1 ? "conversation" : "conversations"}
                  {wrongCases.length === 1 && <>, all on one case, &ldquo;{wrongCases[0]}&rdquo;, with v1</>}.
                </>
              ) : (
                "."
              )}
            </>
          )}
          {!ranFull && !ranStatement && "Not run yet."}
        </p>
        <p className="mt-3 text-[16px] text-ink-2">
          A scripted patient sends two messages, the assistant replies and declares its actions, and a judge model grades
          the conversation against an answer key. I wrote the answer keys from the billing rules; no biller has
          reviewed them. Each case runs {trials} times for each combination of record and instructions.
        </p>
      </header>

      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="scorecard">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h2 id="scorecard" className="text-[20px] font-semibold">
            Scorecard
          </h2>
          <p className="text-[13.5px] text-ink-2">
            {ranFull || ranStatement ? (
              <>
                {CASES.length} cases × {trials} trials per cell. Model: <span className="num">{RESULTS.model}</span>, thinking
                off.
                {runDate && <> Run {runDate}.</>}
              </>
            ) : (
              <>Not run yet. Figures appear once the bench has been run.</>
            )}
          </p>
        </div>
        <div className="mt-5">
          <Scorecard results={RESULTS} />
        </div>
        <p className="prose-col mt-4 text-[14px] text-ink-2">
          Balance only means the assistant sees what the statement prints: the service, the amounts and the
          payer&apos;s name, with no remittance codes, eligibility, ledger or intake. v2 adds one rule to v1, which the
          site calls the check: confirm the balance is payable as stated before asking for, accepting or scheduling any
          payment.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <DiscoverButton href="/evidence/lab" label="Open the prompt lab" />
          <span className="text-[14px] text-ink-2">Write your own instructions and run all {CASES.length} cases against them.</span>
        </div>
      </section>

      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="cases">
        <h2 id="cases" className="text-[20px] font-semibold">
          Cases
        </h2>
        <p className="prose-col mt-1 text-ink-2">
          One row per patient situation. Squares are the judge&apos;s outcome for each of the {trials} trials, with the
          full record and with the balance only. Open a case to read the record, the answer key and every transcript.
        </p>
        <div className="table-scroll mt-4">
          <table className="ledger min-w-[880px]">
            <thead>
              <tr>
                <th scope="col" rowSpan={2} className="align-bottom">
                  Case
                </th>
                <th scope="col" rowSpan={2} className="align-bottom">
                  Patient&apos;s opening line
                </th>
                <th scope="col" rowSpan={2} className="r align-bottom">
                  Statement
                </th>
                <th scope="col" rowSpan={2} className="align-bottom">
                  Should pay?
                </th>
                {VIEW_ORDER.map((view) => (
                  <th key={view} scope="colgroup" colSpan={VERSIONS.length} className="border-l border-l-rule text-ink">
                    {VIEW_HEADING[view]}
                  </th>
                ))}
              </tr>
              <tr>
                {VIEW_ORDER.flatMap((view) =>
                  VERSIONS.map((v, i) => (
                    <th key={`${view}-${v}`} scope="col" className={i === 0 ? "border-l border-l-rule" : undefined}>
                      {v}
                    </th>
                  )),
                )}
              </tr>
            </thead>
            {GROUP_ORDER.map((g) => {
              const rows = CASES.filter((c) => c.group === g);
              if (rows.length === 0) return null;
              return (
                <tbody key={g}>
                  <tr className="hover:bg-transparent!">
                    <th scope="colgroup" colSpan={4 + VIEW_ORDER.length * VERSIONS.length} className="pt-6 font-medium text-ink">
                      {GROUP_HEADING[g]} <span className="font-normal text-ink-3">{rows.length}</span>
                    </th>
                  </tr>
                  {rows.map((c) => (
                    <tr key={c.id} className="relative">
                      <td className="min-w-[200px]">
                        <Link
                          href={`/cases/${c.id}`}
                          className="font-medium text-ink underline decoration-rule-strong underline-offset-4 after:absolute after:inset-0 hover:text-accent"
                        >
                          {c.title}
                        </Link>
                      </td>
                      <td className="text-ink-2">
                        <span className="block max-w-[34ch] truncate" title={c.opener}>
                          {c.opener}
                        </span>
                      </td>
                      <td className="r">
                        <Money value={c.balance} />
                      </td>
                      <td className="whitespace-nowrap">{shouldPay(c.id, c.group)}</td>
                      {VIEW_ORDER.flatMap((view) =>
                        VERSIONS.map((v, i) => (
                          <td key={`${view}-${v}`} className={"whitespace-nowrap " + (i === 0 ? "border-l border-l-rule" : "")}>
                            <TrialDots version={v} caseId={c.id} view={view} />
                          </td>
                        )),
                      )}
                    </tr>
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      </section>

      <section className="mt-12 border-t border-rule pt-8" aria-labelledby="outcomes">
        <h2 id="outcomes" className="text-[20px] font-semibold">
          The four outcomes
        </h2>
        <p className="prose-col mt-1 text-ink-2">
          The judge reads the whole conversation, the record and the answer key, and picks exactly one.
        </p>
        <dl className="prose-col mt-4 divide-y divide-rule border-y border-rule">
          {OUTCOMES.map((o) => (
            <div key={o.outcome} className="grid gap-x-5 gap-y-1 py-3 sm:grid-cols-[130px_minmax(0,1fr)]">
              <dt>
                <OutcomeBadge outcome={o.outcome} />
              </dt>
              <dd className="text-[14.5px]">{o.text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[14.5px]">
          How the cases, the scripted patient and the judge were built, and what this bench does not measure:{" "}
          <Link href="/evidence/method" className="text-accent underline underline-offset-4">
            Method
          </Link>
          .
        </p>
      </section>

      <Findings />
    </div>
  );
}
