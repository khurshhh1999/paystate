import Link from "next/link";
import { Money } from "@/components/ui";
import { CASES } from "@/lib/cases.mjs";
import type { GatePlay } from "@/lib/outreach/playbook";
import type { TriggerResult } from "@/lib/outreach/types";
import { CodeBlock, Disclosure } from "./disclosure";
import { SampleTable } from "./sample-table";

const SMS_LIMIT = 320;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 border-b border-rule py-2.5 sm:grid-cols-[9rem_1fr]">
      <dt className="text-[14px] text-ink-2">{label}</dt>
      <dd className="text-[15px]">{children}</dd>
    </div>
  );
}

export function TriggerSection({ t, play }: { t: TriggerResult; play: GatePlay }) {
  const kase = CASES.find((c) => c.id === play.caseId);
  return (
    <section id={t.id} className="scroll-mt-6 border-t border-rule pt-8">
      <h2 className="text-[20px] font-semibold">
        <span className="num text-ink-3">{t.number}.</span> {t.name}
      </h2>
      <p className="prose-col mt-2 text-ink-2">{t.rule}</p>
      {kase && (
        <p className="mt-1 text-[14px] text-ink-3">
          On the bench:{" "}
          <Link href={`/cases/${kase.id}`} className="text-accent underline underline-offset-2">
            {kase.title}
          </Link>
          .
        </p>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:max-w-[600px] sm:grid-cols-3">
        <div>
          <dt className="text-[13px] text-ink-2">Accounts caught</dt>
          <dd className="num text-[17px]">{t.caught.toLocaleString("en-US")}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-2">On statements</dt>
          <dd className="text-[17px]">
            <Money value={t.statementDollars} />
          </dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-2">Not owed as stated</dt>
          <dd className="text-[17px]">
            <Money value={t.inQuestionDollars} />
          </dd>
        </div>
      </dl>

      <h3 className="mt-7 text-[15px] font-semibold">Instead of the statement</h3>
      <dl className="mt-2 border-t border-rule">
        <Row label="Who">{play.who}</Row>
        <Row label="Channel">{play.channel}</Row>
        <Row label="When">{play.when}</Row>
        <Row label="Staff task">{play.staffTask}</Row>
      </dl>

      <div className="mt-6 flex flex-col gap-5">
        {play.messages.map((m) => (
          <figure key={m.when} className="max-w-[560px]">
            <figcaption className="mb-1.5 text-[14px] text-ink-2">
              {m.when}. {m.channel}.
            </figcaption>
            <blockquote className="rounded-md border border-rule bg-surface px-4 py-3 text-[15px] leading-[1.55]">
              {m.text}
            </blockquote>
            <p className="mt-1 text-[13px] text-ink-3">
              <span className="num">{m.text.length}</span> characters
              {m.channel.includes("SMS") && m.text.length <= SMS_LIMIT ? `, within the ${SMS_LIMIT}-character SMS limit` : ""}.
            </p>
          </figure>
        ))}
      </div>

      <h3 className="mt-7 text-[15px] font-semibold">What the patient can do by replying</h3>
      <div className="table-scroll mt-2">
        <table className="ledger">
          <thead>
            <tr>
              <th>Reply</th>
              <th>What happens</th>
            </tr>
          </thead>
          <tbody>
            {play.replies.map((r) => (
              <tr key={r.reply}>
                <td className="whitespace-nowrap font-medium">{r.reply}</td>
                <td className="min-w-[220px]">{r.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <Disclosure summary={`SQL for rule ${t.number}, and the first 3 of ${t.caught} rows it returned`}>
          <CodeBlock>{t.sql}</CodeBlock>
          <div className="mt-4">
            <SampleTable columns={t.columns} rows={t.sample} />
          </div>
        </Disclosure>
      </div>
    </section>
  );
}
