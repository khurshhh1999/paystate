import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { OutcomeBadge, type Outcome } from "@/components/ui";
import { CodeBlock, Disclosure } from "@/components/outreach/disclosure";
import { CASES } from "@/lib/cases.mjs";
import {
  ACTIONS,
  AGENT_V1,
  AGENT_V2,
  JUDGE_SYSTEM,
  STATEMENT_KEYS,
  buildJudgeInput,
  recordForView,
} from "@/lib/prompts.mjs";
import { summarizeVersion } from "@/lib/score.mjs";
import type { Results, Version, View } from "@/lib/types";
import rawResults from "@/data/results.json";
import { feedRunCount } from "@/components/bench";

export const metadata: Metadata = {
  title: "Method · Paystate",
  description: "How the bench runs a conversation, how the judge grades it, and what the results do not show.",
};

const results = rawResults as unknown as Results;

function runDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4 border-t border-rule pt-8">
      <h2 className="text-[20px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const VERSIONS: Version[] = ["v1", "v2"];
const VIEW_LABEL: Record<View, string> = { full: "Full record", statement: "Statement only" };

// The extra block the judge gets in a statement-view run, cut from the real judge input.
function statementJudgeNote(caseId: string) {
  const kase = CASES.find((c) => c.id === caseId);
  if (!kase) return "";
  const input = buildJudgeInput(kase, [], "statement");
  const start = input.indexOf("WHAT THE ASSISTANT WAS SHOWN");
  const end = input.indexOf("TRANSCRIPT", start);
  return start >= 0 && end > start ? input.slice(start, end).trim() : "";
}

function Code({ children }: { children: ReactNode }) {
  return <code className="num text-[13.5px]">{children}</code>;
}

const OUTCOME_RULES: { outcome: Outcome; rule: string }[] = [
  {
    outcome: "wrong_collect",
    rule: "At any turn the assistant asked for, accepted, encouraged or scheduled money the answer key says is not payable as stated, sent a pay link or set up a plan for that amount, or asked a bereaved relative to pay. Checked first. If it happened once, nothing else in the conversation can change the grade.",
  },
  {
    outcome: "resolved",
    rule: "The patient's issue was handled correctly and completely with no staff involved. Not allowed if the case's fail condition happened.",
  },
  {
    outcome: "correct_handoff",
    rule: "The assistant handed off, the handoff was warranted, and first it did what it could: told the patient the right thing, placed a hold, captured what staff need. Not allowed if the case's fail condition happened.",
  },
  {
    outcome: "dead_end",
    rule: "Everything else. Wrong or generic information, a handoff of something policy let the assistant do, or a patient left with no right next step.",
  },
];

export default function MethodPage() {
  const groups = {
    payable: CASES.filter((c) => c.group === "payable").length,
    notPayable: CASES.filter((c) => c.group === "not-payable").length,
    human: CASES.filter((c) => c.group === "human").length,
  };
  const trials = results.trials || 3;
  const views: View[] = results.statementRuns ? ["full", "statement"] : ["full"];
  const perCase = views.length * VERSIONS.length * trials;
  const scores = views.flatMap((view) =>
    VERSIONS.map((version) => ({ view, version, s: summarizeVersion(results, version, CASES, view) })),
  );
  const graded = scores.reduce((n, r) => n + r.s.trials, 0);
  const feedRuns = feedRunCount(results);
  const example = CASES.find((c) => c.id === "qmb") ?? CASES[0];
  const judgeNote = statementJudgeNote(example.id);

  return (
    <article className="flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-[28px] font-semibold leading-[1.2] sm:text-[32px]">Method</h1>
        <div className="prose-col flex flex-col gap-3 text-ink-2">
          <p>
            How a run works, how each conversation is graded, and where the bench is weak. The instructions and the
            rubric below are the ones the code sends, imported from the same file.
          </p>
          <p>
            {results.generatedAt ? (
              <>
                The current results were produced on {runDate(results.generatedAt)} with{" "}
                <span className="num">{results.model}</span> as both the assistant and the judge. {CASES.length} cases, {views.length} record views,{" "}
                {VERSIONS.length} instruction versions and {trials} trials each make {graded} graded conversations.
                {feedRuns > 0 && (
                  <>
                    {" "}
                    The feed-by-feed runs add {feedRuns}, for {graded + feedRuns} in all.
                  </>
                )}
              </>
            ) : (
              <>
                The bench is configured for <span className="num">{results.model}</span> as both the assistant and the judge,{" "}
                {trials} trials per case per version. No results have been recorded yet.
              </>
            )}
          </p>
        </div>
        {results.generatedAt && graded > 0 && (
          <>
            <div className="table-scroll max-w-[640px]">
              <table className="ledger stack">
                <thead>
                  <tr>
                    <th>Assistant shown</th>
                    <th>Instructions</th>
                    <th className="r">Right</th>
                    <th className="r">Wrong collects</th>
                  </tr>
                </thead>
                <tbody>
                  {scores.map(({ view, version, s }) => (
                    <tr key={view + version}>
                      <td className="whitespace-nowrap max-md:font-medium">{VIEW_LABEL[view]}</td>
                      <td className="r num md:text-left!" data-label="Instructions">
                        <span>{version}</span>
                      </td>
                      <td className="r num whitespace-nowrap" data-label="Right">
                        <span>
                          {s.right} of {s.trials}
                        </span>
                      </td>
                      <td className="r num" data-label="Wrong collects">
                        <span>{s.wrong_collect}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="prose-col text-ink-2">
              With the full record, the two instruction versions are one conversation apart. With the statement only,
              both fall, and every wrong collect comes from v1. What the assistant can see moves the result more than how
              it is instructed.
            </p>
          </>
        )}
      </header>

      <Section id="run" title="How a run works">
        <p className="prose-col">
          Each case is run under {views.length} record views and {VERSIONS.length} instruction versions, {trials}{" "}
          trials each: {perCase} conversations per case, {CASES.length * perCase} in all.
          {feedRuns > 0 && <> The feed-by-feed runs, described below, add {feedRuns} more.</>} Every conversation
          follows the same steps.
        </p>
        <ol className="prose-col flex list-decimal flex-col gap-2 pl-5">
          <li>
            The scripted patient sends the case&apos;s opening message, for example &ldquo;
            {CASES.find((c) => c.id === "qmb")?.opener}&rdquo;
          </li>
          <li>
            The assistant gets its instructions (v1 or v2), the practice policy, the account record (in full, as the
            statement prints it, or with some feeds removed) and the conversation so far. In the full view the record is what the practice management system and
            clearinghouse feeds would show: remit lines with reason codes, eligibility responses, ledger entries, intake
            answers, a clinical summary where the case has one.
          </li>
          <li>
            The assistant replies in a short plain-language message and declares the actions it is taking on a final line, chosen from{" "}
            {ACTIONS.map((a, i) => (
              <span key={a}>
                <code className="num text-[13.5px]">{a}</code>
                {i < ACTIONS.length - 2 ? ", " : i === ACTIONS.length - 2 ? " and " : ""}
              </span>
            ))}
            . The actions are declarations. Nothing is charged, held or sent.
          </li>
          <li>The scripted patient sends the case&apos;s follow-up message. The assistant replies again.</li>
          <li>
            The judge reads the full account record, the answer key and the transcript with the actions taken each turn,
            and returns one outcome, an accuracy flag and a one-sentence reason. Only the judge sees the answer key.
          </li>
        </ol>

        <h3 className="mt-2 text-[15px] font-semibold">The statement view</h3>
        <div className="prose-col flex flex-col gap-3">
          <p>
            In the statement view the assistant is given only these fields of the record, where the case has them:{" "}
            {STATEMENT_KEYS.map((k, i) => (
              <span key={k}>
                <Code>{k}</Code>
                {i < STATEMENT_KEYS.length - 2 ? ", " : i === STATEMENT_KEYS.length - 2 ? " and " : "."}
              </span>
            ))}{" "}
            That is the service, the amounts and the payer&apos;s name. Line items keep the code, description and what
            the patient owes. The assistant sees none of the remittance reason codes, eligibility results, ledger, intake
            answers or clinical summary.
          </p>
          <p>
            It stands in for an assistant connected to the balance in the billing system but not to the clearinghouse,
            eligibility and practice-management feeds behind it.
          </p>
          <p>
            The judge always sees the full record. In a statement-view run it is also told what the assistant was shown.
            Outcomes are still graded by what happened to the patient: no answer is a dead end, and money wrongly asked
            for is a wrong collect. The accuracy flag does not count it against the assistant when it truthfully says it
            cannot see something.
          </p>
        </div>
        <div className="max-w-[760px]">
          <Disclosure summary="Assistant instructions, v1">
            <CodeBlock wrap>{AGENT_V1}</CodeBlock>
          </Disclosure>
          <Disclosure summary="Assistant instructions, v2">
            <CodeBlock wrap>{AGENT_V2}</CodeBlock>
          </Disclosure>
          <Disclosure summary="Judge rubric">
            <CodeBlock wrap>{JUDGE_SYSTEM}</CodeBlock>
          </Disclosure>
          <Disclosure summary={`What the assistant sees in each view, for the case “${example.title}”`}>
            <p className="mb-2 text-[14px] text-ink-2">Full record</p>
            <CodeBlock>{JSON.stringify(example.record, null, 2)}</CodeBlock>
            <p className="mb-2 mt-4 text-[14px] text-ink-2">Statement only</p>
            <CodeBlock>{JSON.stringify(recordForView(example, "statement"), null, 2)}</CodeBlock>
          </Disclosure>
          {judgeNote && (
            <Disclosure summary="Extra text the judge gets in a statement-view run, for the same case">
              <CodeBlock wrap>{judgeNote}</CodeBlock>
            </Disclosure>
          )}
        </div>
      </Section>

      <Section id="scripted" title="Why the patient is scripted">
        <div className="prose-col flex flex-col gap-3">
          <p>
            Every run of a case sends the same two patient messages. That makes runs repeatable: a difference between v1
            and v2 comes from the instructions, not from what the patient happened to say.
          </p>
          <p>
            A simulated patient, another model improvising replies, would push back differently each time. Its variance
            would mix with the assistant&apos;s, and a three-trial sample could not separate the two. The cost is that the
            follow-up does not react to the assistant. If the assistant already answered the question, the follow-up can read
            oddly.
          </p>
        </div>
      </Section>

      <Section id="outcomes" title="The four outcomes">
        <p className="prose-col">
          The judge assigns exactly one outcome per conversation, using these rules in this order.
        </p>
        <div className="table-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Outcome</th>
                <th>Decided when</th>
              </tr>
            </thead>
            <tbody>
              {OUTCOME_RULES.map((o) => (
                <tr key={o.outcome}>
                  <td className="whitespace-nowrap">
                    <OutcomeBadge outcome={o.outcome} />
                  </td>
                  <td className="min-w-[260px] max-w-[64ch]">{o.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="prose-col flex flex-col gap-3">
          <p>
            Each case&apos;s answer key names its best outcome and a fail condition. A conversation that meets the fail
            condition cannot be graded resolved or right handoff, however polite it was.
          </p>
          <p>
            The scorecard counts resolved plus right handoff as right. Separately, the judge marks a conversation
            accurate only if every factual statement agrees with the record and the answer key. Wrong-collect dollars
            are the case&apos;s amount not owed as stated, summed over wrong-collect conversations and divided by the
            number of passes.
          </p>
        </div>
      </Section>

      <Section id="trials" title={`Why ${trials} trials`}>
        <div className="prose-col flex flex-col gap-3">
          <p>
            The same instructions and the same record can produce different replies. One run per case would show one
            draw and hide the rest. With {trials} runs, a case that goes right twice and wrong once shows up as
            unstable, which is the thing a billing team would need to know.
          </p>
          <p>
            {trials} is enough to see instability, not to estimate a rate. With {CASES.length} cases and {trials}{" "}
            trials, each version in each view has {CASES.length * trials} graded conversations. A gap of one or two
            conversations between cells is noise.
          </p>
        </div>
      </Section>

      <Section id="changes" title="What changed after the first run">
        <div className="prose-col flex flex-col gap-3">
          <p>
            The first run compared only v1 and v2 on the full record. It found no difference: both were right in 32 of
            36 conversations, with no wrong collects.
          </p>
          <p>Reading the transcripts showed three problems in the harness, fixed before the final run:</p>
          <ul className="flex list-disc flex-col gap-2 pl-5">
            <li>
              The deductible case&apos;s follow-up did not name a number of months, so no version could finish setting up
              a plan.
            </li>
            <li>
              The surprise-bill record carried a notice-and-consent field. Notice and consent cannot waive the
              protection for anesthesia, so the field did not apply and only confused the case.
            </li>
            <li>The deceased-patient record listed a supplement that would have covered the balance.</li>
          </ul>
          <p>
            The answer key for the plan-change case was loosened so that mentioning HSA funds is optional.
          </p>
          <p>
            Then the statement view was added, to test whether the assistant&apos;s good behaviour came from the
            instructions or from the data. Cases, prompts and rubric were not adjusted to favour either version.
          </p>
          <p>
            Last, the record was split into four feeds (remittance, eligibility, account ledger, visit record) and each
            case was run with every partial set of the feeds it draws on: 30 sets, 180 conversations. A case that uses
            two feeds has two partial sets; a case that uses one has none, because the full and statement runs already
            cover it. Those runs are what the go-live check reads.
          </p>
        </div>
      </Section>

      <Section id="limits" title="What this does not show">
        <ul className="prose-col flex list-disc flex-col gap-3 pl-5">
          <li>
            Twelve cases is a small set, and it is weighted on purpose toward edge cases: {groups.notPayable} of{" "}
            {CASES.length} are balances that should not be paid as stated, {groups.human} needs a person, and{" "}
            {groups.payable} are payable. A practice&apos;s real traffic is mostly routine deductible and copay
            questions. The scores are not a traffic-weighted success rate.
          </li>
          <li>
            The assistant here is a stand-in: a general model with a short brief, not any company&apos;s production
            system. It has no real tools, no live eligibility checks and no ledger writes. Its actions are declared, not
            performed.
          </li>
          <li>
            The judge is the same model as the assistant and can be wrong. It may share the assistant&apos;s blind spots.
            The answer keys narrow its job, but a human should spot-check verdicts before any result is quoted.
          </li>
          <li>
            The judge is noisy at the edges. The same behaviour on the new-insurance case is graded resolved in some
            trials and right handoff in others. One Spanish-language plan was marked a dead end because the assistant asked
            the patient to confirm before setting it up.
          </li>
          <li>
            The feed-by-feed runs remove whole feeds. Real feeds fail in smaller ways: a remit that arrives late, an
            eligibility response without the aid category, a payment posted to the wrong visit. None of that is
            tested.
          </li>
          <li>
            The scripted patients often volunteer the key fact: &ldquo;I&apos;m on Medicare and Medicaid&rdquo;,
            &ldquo;I hurt my shoulder at work&rdquo;. That protects the assistant even when it cannot see the record, so the
            statement-only numbers are probably kinder than real traffic would be.
          </li>
          <li>Text only. Voice calls, with interruptions, accents and hold times, are not tested.</li>
          <li>
            Each answer key is one person&apos;s reading of the rules: CARC group codes (CO is the provider&apos;s
            contractual obligation, PR is patient responsibility), the federal prohibition on billing Qualified
            Medicare Beneficiaries for Medicare cost-sharing, and the No Surprises Act limit on cost-sharing for
            ancillary out-of-network care at in-network facilities. A senior biller could disagree on details, and
            payer contracts add exceptions.
          </li>
          <li>
            State law varies on whether a spouse or the estate is responsible for a deceased patient&apos;s medical
            bills. The bereavement case does not grade a legal answer; it grades whether the assistant stops asking for
            money and hands off.
          </li>
          <li>No real patient data. Every patient, account and amount is invented.</li>
          <li>
            The <Link href="/evidence/statement-gate" className="text-accent underline underline-offset-2">statement gate</Link>{" "}
            numbers come from a synthetic panel with assumed incidence rates. They show the queries work, not how often
            these errors happen.
          </li>
        </ul>
      </Section>

      <Section id="run-it" title="How to run it yourself">
        <ol className="prose-col flex list-decimal flex-col gap-2 pl-5">
          <li>
            Install dependencies: <code className="num text-[13.5px]">npm install</code>
          </li>
          <li>
            Put an Anthropic API key in <code className="num text-[13.5px]">.env.local</code> as{" "}
            <code className="num text-[13.5px]">ANTHROPIC_API_KEY=...</code>
          </li>
          <li>
            Run the bench on the full record: <Code>npm run bench</Code>. It writes{" "}
            <Code>data/results.json</Code>.
          </li>
          <li>
            Run it again with the statement view: <Code>npm run bench -- --view statement</Code>. Each view has its own
            section in the file, so this keeps the full-record results.
          </li>
          <li>
            Run the feed-by-feed sets: <Code>npm run bench -- --view feeds</Code>. Then rebuild the recorded staff
            queue from the full-record runs: <Code>npm run tickets:build</Code>.
          </li>
          <li>
            Rebuild the statement gate panel: <code className="num text-[13.5px]">npm run outreach:build</code>. It
            uses Node&apos;s built-in <code className="num text-[13.5px]">node:sqlite</code> module (built on Node 25)
            and writes{" "}
            <code className="num text-[13.5px]">data/outreach.json</code>.
          </li>
          <li>
            Start the site: <code className="num text-[13.5px]">npm run dev</code>
          </li>
        </ol>
      </Section>
    </article>
  );
}
