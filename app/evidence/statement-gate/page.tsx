import type { Metadata } from "next";
import { Money } from "@/components/ui";
import { GateCalculator, type CalcTrigger } from "@/components/outreach/calculator";
import { CodeBlock, Disclosure } from "@/components/outreach/disclosure";
import { TriggerSection } from "@/components/outreach/trigger-section";
import { EXPERIMENT, sampleSize } from "@/lib/outreach/experiment";
import { PLAYBOOK } from "@/lib/outreach/playbook";
import { outreach } from "@/lib/outreach/types";
import type { TriggerId } from "@/lib/outreach/types";

export const metadata: Metadata = {
  title: "Statement gate · Paystate",
  description:
    "A pre-statement check that holds bills which should not go out as written and sends a correction, or nothing, instead.",
};

const FIRST_CONTACT: Record<TriggerId, string> = {
  t1: "Staff task",
  t2: "Ask for new coverage",
  t3: "Staff task",
  t4: "Corrected amount",
  t5: "Staff task, then confirmation",
  t6: "Ask for the carrier",
  t7: "Stop all outreach",
};

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
const n = (x: number) => x.toLocaleString("en-US");

export default function OutreachPage() {
  const { panel, triggers, union, nearMisses, assumptions } = outreach;
  const byId = Object.fromEntries(triggers.map((t) => [t.id, t])) as Record<TriggerId, (typeof triggers)[number]>;
  const rates = assumptions.triggerRates;
  const ss = sampleSize(rates);
  const allChecksClean = triggers.every((t) => t.check.missed === 0 && t.check.extra === 0);
  const nearMissTotal = nearMisses.reduce((s, m) => s + m.seeded, 0);

  const calcTriggers: CalcTrigger[] = triggers.map((t) => ({
    id: t.id,
    number: t.number,
    name: t.name,
    ratePct: Math.round(t.assumedRate * 1000) / 10,
    avgStatement: t.caught ? t.statementDollars / t.caught : 0,
    avgInQuestion: t.caught ? t.inQuestionDollars / t.caught : 0,
  }));

  return (
    <article className="flex flex-col gap-12">
      <header className="flex flex-col gap-4">
        <h1 className="text-[28px] font-semibold leading-[1.2] sm:text-[32px]">Statement gate</h1>
        <div className="prose-col flex flex-col gap-3 text-ink-2">
          <p>
            Every bench case where the assistant should not have asked for money was visible in the data before the
            patient wrote in. The CO denial is on the remit. The QMB category is on the eligibility response. The
            unapplied payment is on the ledger.
          </p>
          <p>
            So the same checks can run before a statement or reminder goes out. An account that trips a rule gets a
            correction, a question, or no contact and a staff task, instead of a bill the patient should not pay.
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-4">
        <p className="prose-col text-[17px] leading-[1.5]">
          Of <span className="tabular-nums">{n(panel.accounts)}</span> synthetic open balances,{" "}
          <span className="tabular-nums">{n(union.caught)}</span> tripped at least one rule. They carry{" "}
          <Money value={union.statementDollars} /> on statements that should not go out as written, of which{" "}
          <Money value={union.inQuestionDollars} /> is not owed as stated.
        </p>
        <p className="prose-col text-[14px] text-ink-2">
          The panel is synthetic and the incidence rates are assumptions, not measured rates:{" "}
          {triggers.map((t, i) => (
            <span key={t.id}>
              rule {t.number} <span className="tabular-nums">{pct(t.assumedRate)}</span>
              {i < triggers.length - 1 ? ", " : "."}
            </span>
          ))}{" "}
          {assumptions.balance} {assumptions.t6Overlap}
        </p>

        <div className="table-scroll mt-2">
          <table className="ledger">
            <thead>
              <tr>
                <th>Rule</th>
                <th className="r">Assumed rate</th>
                <th className="r">Accounts</th>
                <th className="r">On statements</th>
                <th className="r">Not owed as stated</th>
                <th>Instead of a bill</th>
              </tr>
            </thead>
            <tbody>
              {triggers.map((t) => (
                <tr key={t.id}>
                  <td className="min-w-[220px]">
                    <a href={`#${t.id}`} className="hover:text-accent">
                      <span className="num text-ink-3">{t.number}.</span> {t.name}
                    </a>
                  </td>
                  <td className="r num">{pct(t.assumedRate)}</td>
                  <td className="r num">{n(t.caught)}</td>
                  <td className="r">
                    <Money value={t.statementDollars} />
                  </td>
                  <td className="r">
                    <Money value={t.inQuestionDollars} />
                  </td>
                  <td className="whitespace-nowrap text-ink-2">{FIRST_CONTACT[t.id]}</td>
                </tr>
              ))}
              <tr>
                <td className="font-medium">Any rule, each account once</td>
                <td />
                <td className="r num font-medium">{n(union.caught)}</td>
                <td className="r font-medium">
                  <Money value={union.statementDollars} />
                </td>
                <td className="r font-medium">
                  <Money value={union.inQuestionDollars} />
                </td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        <p className="prose-col text-[14px] text-ink-2">
          The panel also holds <span className="tabular-nums">{n(nearMissTotal)}</span> near misses: accounts that look like
          a trigger but are payable, such as a CO denial already written off or a Medicare patient whose Medicaid
          category is SLMB, which does not carry the QMB billing protection.{" "}
          {allChecksClean
            ? "Each query caught every seeded account for its rule and none of the near misses. "
            : "At least one query missed a seeded account or caught a near miss; the build script reports which. "}
          That shows the SQL matches the rule on clean synthetic data. Real data has missing remits, late
          eligibility responses and payments posted to the wrong visit.
        </p>

        <div>
          <Disclosure summary="Near misses seeded in the panel">
            <div className="table-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Near miss</th>
                    <th>Tests rule</th>
                    <th className="r">Assumed rate</th>
                    <th className="r">Accounts</th>
                  </tr>
                </thead>
                <tbody>
                  {nearMisses.map((m) => (
                    <tr key={m.id}>
                      <td className="min-w-[260px]">{m.label}</td>
                      <td className="num">{byId[m.rule]?.number}</td>
                      <td className="r num">{pct(m.rate)}</td>
                      <td className="r num">{m.seeded}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Disclosure>
          <Disclosure summary="Warehouse schema the queries run against">
            <p className="prose-col mb-3 text-[14px] text-ink-2">
              {n(panel.accounts)} accounts across {panel.practices} practices, as of {outreach.asOf}. Median statement
              balance <Money value={panel.medianBalance} />, mean <Money value={panel.meanBalance} />.{" "}
              {assumptions.payerMix} {assumptions.channels} Built with {outreach.engine}, seed{" "}
              <span className="num">{outreach.seed}</span>. Rebuild with <code className="num">npm run outreach:build</code>.
            </p>
            <CodeBlock>{outreach.schema}</CodeBlock>
          </Disclosure>
        </div>
      </section>

      <section className="prose-col flex flex-col gap-2 text-[14px] text-ink-2">
        <p>
          Two conditions apply to every message below. Texts go only to patients with documented consent to receive
          billing texts, which the TCPA makes a condition of automated texting; everyone else gets email, or a letter. Messages go out in the patient&apos;s
          preferred language, and each translation is reviewed by a fluent speaker before use. The example amounts
          and dates come from the matching bench case.
        </p>
      </section>

      <div className="flex flex-col gap-12">
        {triggers.map((t) => (
          <TriggerSection key={t.id} t={t} play={PLAYBOOK[t.id]} />
        ))}
      </div>

      <section id="experiment" className="flex flex-col gap-5 border-t border-rule pt-8">
        <h2 className="text-[20px] font-semibold">What it would take to trust this</h2>
        <div className="prose-col flex flex-col gap-4">
          <p>
            Rules {EXPERIMENT.liveEverywhere.map((id) => byId[id].number).join(", ")} go live everywhere with no
            holdout. Those statements are either barred (QMB cost-sharing, a protected balance bill), plainly the
            practice&apos;s liability (a CO denial), or addressed to someone who has died. Sending them on purpose to
            build a control group is not acceptable. They are checked by audit instead: each month a biller reviews{" "}
            {EXPERIMENT.auditSample} held accounts per rule and records whether the hold was right.
          </p>
          <p>
            Rules {EXPERIMENT.randomised.map((id) => byId[id].number).join(", ")} are likely errors rather than certain
            ones. The patient may truly have no other coverage, the unapplied payment may belong to another visit, the
            intake answer may be wrong. Those are randomised.
          </p>
        </div>

        <dl className="prose-col border-t border-rule">
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 border-b border-rule py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-2">Unit</dt>
            <dd>
              The flagged account, grouped by guarantor so one person never gets both experiences. Account-level
              randomisation inside each practice removes practice-to-practice differences that would swamp a
              practice-week design at this volume.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 border-b border-rule py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-2">Arms</dt>
            <dd>
              50% gated: hold and the first contact described above. 50% holdout: today&apos;s process, where the
              statement goes out as written and staff correct it when the patient calls.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 border-b border-rule py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-2">Primary metric</dt>
            <dd>
              Inbound billing contacts (calls, texts, portal messages) per 100 flagged accounts within 30 days of the
              first contact, whether that was a statement or a gate message. Reported practice-wide as contacts per 100
              statements as well.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 border-b border-rule py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-2">Secondary</dt>
            <dd>
              Days from first contact to payment on corrected balances. Refunds issued, count and dollars. Patient
              rating of the conversation, one question when the thread closes.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 border-b border-rule py-3 sm:grid-cols-[10rem_1fr]">
            <dt className="text-ink-2">Guardrail</dt>
            <dd>
              Total patient cash collected at 60 days, per 100 open balances, must not fall more than{" "}
              {(EXPERIMENT.guardrailMargin * 100).toFixed(1)}% below the holdout. Per arm: cash from unflagged accounts
              (shared) plus that arm&apos;s flagged-account cash scaled to all flagged accounts. Money later refunded is
              excluded from both arms, so cash the patient did not owe never counts as collected.
            </dd>
          </div>
        </dl>

        <h3 className="mt-2 text-[15px] font-semibold">Sample size</h3>
        <p className="prose-col">
          Assumed baseline: {Math.round(EXPERIMENT.baseline * 100)} of every 100 flagged accounts that get today&apos;s
          statement produce at least one inbound contact within 30 days. The smallest drop worth building for is to{" "}
          {Math.round(EXPERIMENT.target * 100)}. Both numbers are assumptions; a month of the practice&apos;s own contact
          logs would replace the first. Two-sided test at 5%, 80% power, two proportions:
        </p>
        <div className="max-w-[640px]">
          <CodeBlock wrap>
            {[
              "n per arm = (z_0.975 + z_0.80)^2 x [p1(1 - p1) + p2(1 - p2)] / (p1 - p2)^2",
              `          = (${EXPERIMENT.zAlpha} + ${EXPERIMENT.zBeta})^2 x [${EXPERIMENT.baseline} x ${(1 - EXPERIMENT.baseline).toFixed(2)} + ${EXPERIMENT.target.toFixed(2)} x ${(1 - EXPERIMENT.target).toFixed(2)}] / ${ss.delta.toFixed(2)}^2`,
              `          = ${(ss.zSum * ss.zSum).toFixed(2)} x ${ss.variance.toFixed(4)} / ${(ss.delta * ss.delta).toFixed(4)}`,
              `          = ${ss.raw.toFixed(1)}, so ${ss.perArm} per arm, ${ss.perArm * 2} in total`,
              "",
              `Flagged per month = ${n(EXPERIMENT.openBalancesPerMonth)} open balances x (${EXPERIMENT.randomised.map((id) => pct(rates[id])).join(" + ")})`,
              `                  = ${n(EXPERIMENT.openBalancesPerMonth)} x ${pct(ss.flagRate)} = ${Math.round(ss.flaggedPerMonth)}`,
              `Enrolment         = ${ss.perArm * 2} / ${Math.round(ss.flaggedPerMonth)} = ${ss.months.toFixed(1)} months`,
            ].join("\n")}
          </CodeBlock>
        </div>
        <p className="prose-col">
          At an assumed {n(EXPERIMENT.openBalancesPerMonth)} open balances a month, enrolment takes about{" "}
          {Math.ceil(ss.months)} months, and the 60-day guardrail adds two more. The guardrail is underpowered at this
          size, so it is read as a threshold to watch, not a test to pass.
        </p>

        <h3 className="mt-2 text-[15px] font-semibold">What would make me stop</h3>
        <ul className="prose-col flex list-disc flex-col gap-2 pl-5">
          <li>
            The audit finds that more than {Math.round(EXPERIMENT.falsePositiveStop * 100)}% of a rule&apos;s held
            accounts were payable as stated. That rule goes back to a staff worklist and stops changing what the
            patient receives.
          </li>
          <li>The guardrail is breached at the 30-day look.</li>
          <li>
            A gate message reaches the wrong person, or asks a family member for money. One case stops the message
            template until it is fixed.
          </li>
          <li>
            At the end, the drop in contacts is under 5 per 100 and the interval includes zero. The holds stay as a
            staff worklist; the patient messages are dropped.
          </li>
        </ul>
      </section>

      <section id="calculator" className="flex flex-col gap-5 border-t border-rule pt-8">
        <h2 className="text-[20px] font-semibold">Calculator on assumptions</h2>
        <p className="prose-col text-ink-2">
          Change the rates and the practice size to see what the gate would hold each month. This is arithmetic on
          the assumptions above, not a forecast. The starting rates are the ones the synthetic panel was built with.
        </p>
        <GateCalculator triggers={calcTriggers} />
      </section>
    </article>
  );
}
