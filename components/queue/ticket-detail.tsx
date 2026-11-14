"use client";
// One ticket, laid out in the order a biller works it: what it is, when it is due,
// what to do, why, what the patient expects, the details to copy, then close it.

import { useState, type ReactNode } from "react";
import type { Ticket } from "@/lib/types";
import { TICKET_KINDS } from "@/lib/ticket-kinds.mjs";
import { resolutionsFor } from "@/lib/closeout";
import { reopenTicket, type Closure } from "@/components/ticket-store";
import { Transcript } from "@/components/case/transcript";
import { Button, Money } from "@/components/ui";
import { CloseForm } from "./close-form";
import { CopyButton } from "./copy-button";
import { patientName } from "./order";
import { formatCentral, formatReplyDue } from "./time";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-4">
      <h3 className="mb-1.5 text-[16px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export function TicketDetail({ ticket, closure }: { ticket: Ticket; closure: Closure | undefined }) {
  const [showThread, setShowThread] = useState(false);

  return (
    <article className="flex flex-col gap-5">
      <header>
        <h2 className="text-[20px] font-semibold">{TICKET_KINDS[ticket.kind]}</h2>
        <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[14px]">
          <div className="flex gap-1.5">
            <dt className="text-ink-2">Patient</dt>
            <dd>{patientName(ticket.patient)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-2">Statement balance</dt>
            <dd>
              <Money value={ticket.balance} />
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-ink-2">In question</dt>
            <dd>
              <Money value={ticket.amount} />
            </dd>
          </div>
        </dl>
        <p className={"mt-1 text-[14px] " + (ticket.hold ? "text-ok" : "text-stuck")}>
          {ticket.hold ? "Statements and reminders paused" : "No hold placed"}
        </p>
        <p className="mt-2 text-[14px] text-ink-2">
          Arrived <span className="text-ink">{formatCentral(ticket.createdAt)}</span>
          <span aria-hidden="true"> · </span>
          Reply due <span className="text-ink">{formatReplyDue(ticket.createdAt)}</span>
        </p>
      </header>

      <Section title="Next step">
        <p className="prose-col font-medium">{ticket.next_step}</p>
      </Section>

      <Section title="Why this needs a person">
        <p className="prose-col">{ticket.reason}</p>
      </Section>

      <Section title="Patient was told">
        <p className="prose-col">{ticket.told_patient}</p>
      </Section>

      <Section title="Details already collected">
        {ticket.captured.length === 0 ? (
          <p className="text-[14px] text-ink-2">Nothing to copy. The record has what you need.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-4 text-[14px] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            {ticket.captured.map((c, i) => (
              <div key={i} className="contents">
                <dt className="pt-2 text-ink-2 sm:border-b sm:border-rule sm:pb-2">{c.label}</dt>
                <dd className="flex items-start justify-between gap-3 border-b border-rule pb-2 sm:pt-2">
                  <span className="num min-w-0 break-words text-[13.5px]">{c.value}</span>
                  <CopyButton value={c.value} label={c.label} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Section>

      <Section title="Conversation">
        <Button
          type="button"
          variant="quiet"
          aria-expanded={showThread}
          onClick={() => setShowThread((v) => !v)}
        >
          {showThread ? "Hide the conversation" : `Show the conversation (${ticket.transcript.length} messages)`}
        </Button>
        {showThread && (
          <div className="mt-4">
            <Transcript turns={ticket.transcript} agentLabel="Assistant" />
          </div>
        )}
      </Section>

      <Section title={closure ? "Closed" : "Close the ticket"}>
        <div aria-live="polite">
          {closure ? <ClosedView ticket={ticket} closure={closure} /> : <CloseForm key={ticket.id} ticket={ticket} />}
        </div>
      </Section>
    </article>
  );
}

function ClosedView({ ticket, closure }: { ticket: Ticket; closure: Closure }) {
  const resolution = resolutionsFor(ticket).find((r) => r.id === closure.resolution);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14.5px]">
        <span className="font-medium">{resolution?.label ?? "Closed"}</span>
        <span className="text-ink-2"> · {formatCentral(closure.closedAt)}</span>
      </p>
      {closure.message ? (
        <div className="flex flex-col items-end">
          <span className="mb-1 px-1 text-[12.5px] text-ink-3">Sent to {patientName(ticket.patient)}</span>
          <div className="max-w-[92%] whitespace-pre-wrap break-words rounded-lg rounded-tr-sm border border-rule bg-surface px-3 py-2 text-[14.5px] leading-[1.5]">
            {closure.message}
          </div>
        </div>
      ) : (
        <p className="text-[14px] text-ink-2">{resolution?.note ?? "No text was sent."}</p>
      )}
      <div>
        <Button type="button" variant="quiet" onClick={() => reopenTicket(ticket.id)}>
          Reopen
        </Button>
      </div>
    </div>
  );
}
