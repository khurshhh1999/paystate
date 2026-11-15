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
import { patientName, toldPatient } from "./order";
import { formatCentral, formatReplyDue } from "./time";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-rule pt-4">
      <h3 className="mb-1.5 text-[16px] font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-ink-2">{label}</dt>
      <dd className="whitespace-nowrap">{children}</dd>
    </div>
  );
}

export function TicketDetail({
  ticket,
  closure,
  onClosed,
  onReopened,
}: {
  ticket: Ticket;
  closure: Closure | undefined;
  onClosed: () => void;
  onReopened: () => void;
}) {
  const [showThread, setShowThread] = useState(false);
  const resolution = closure ? resolutionsFor(ticket).find((r) => r.id === closure.resolution) : undefined;
  const told = toldPatient(ticket.told_patient);

  return (
    <article className="flex flex-col gap-5">
      {/* Two lines: what it is and when it is due, then who, how much, hold and arrival. */}
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h2 className="text-[20px] font-semibold">{TICKET_KINDS[ticket.kind]}</h2>
          {closure ? (
            <p className="text-[14px] text-ink-2">
              Closed <span className="whitespace-nowrap text-ink">{formatCentral(closure.closedAt)}</span>
            </p>
          ) : (
            <p className="text-[14px] text-ink-2">
              Reply due <span className="whitespace-nowrap text-ink">{formatReplyDue(ticket.createdAt)}</span>
            </p>
          )}
        </div>
        <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[14px]">
          <Meta label="Patient">{patientName(ticket.patient)}</Meta>
          <Meta label="Statement balance">
            <Money value={ticket.balance} />
          </Meta>
          <Meta label="In question">
            <Money value={ticket.amount} />
          </Meta>
          {/* The hold belongs to open work; the queue's on-hold total leaves closed tickets out too. */}
          {!closure && (
            <Meta label="Hold">
              <span className={ticket.hold ? "text-ok" : "text-stuck"}>
                {ticket.hold ? "Statements paused" : "None placed"}
              </span>
            </Meta>
          )}
          <Meta label="Arrived">{formatCentral(ticket.createdAt)}</Meta>
          {closure && (
            <div className="flex min-w-0 gap-1.5">
              <dt className="text-ink-2">Closed as</dt>
              <dd className="min-w-0">{resolution?.label ?? "Closed"}</dd>
            </div>
          )}
        </dl>
      </header>

      <Section title="Next step">
        {/* Once closed it is history, not a to-do, so it loses the emphasis. */}
        <p
          className={
            "prose-col border-l-2 pl-3 leading-[1.5] " +
            (closure ? "border-rule-strong text-ink-2" : "border-accent text-[16px] font-medium")
          }
        >
          {ticket.next_step}
        </p>
      </Section>

      {/* Side by side when the detail column is wide enough to keep each at a readable measure. */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2 xl:gap-8">
        <Section title="Why this needs a person">
          <p className="prose-col">{ticket.reason}</p>
        </Section>

        <Section title="Patient was told">
          <p className="prose-col">{told.clause ? told.text.charAt(0).toUpperCase() + told.text.slice(1) : told.text}</p>
        </Section>
      </div>

      <Section title="Details already collected">
        {ticket.captured.length === 0 ? (
          <p className="text-[14px] text-ink-2">Nothing to copy. The record has what you need.</p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-4 text-[14px] sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
            {ticket.captured.map((c, i) => (
              <div key={i} className="group contents">
                <dt className="pt-2 text-ink-2 sm:border-b sm:border-rule sm:pb-2">{c.label}</dt>
                <dd className="flex items-start justify-between gap-3 border-b border-rule pb-2 sm:pt-2">
                  {/* Figures, dates and codes in mono so they read like the record; words stay in text. */}
                  <span className={"min-w-0 break-words " + (/[a-z]/.test(c.value) ? "" : "num text-[13.5px]")}>
                    {c.value}
                  </span>
                  {/* Shown on row hover or keyboard focus where there is a mouse; always shown on touch. */}
                  <CopyButton
                    value={c.value}
                    label={c.label}
                    className="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                  />
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
          {closure ? (
            <ClosedView ticket={ticket} closure={closure} onReopened={onReopened} />
          ) : (
            <CloseForm key={ticket.id} ticket={ticket} onClosed={onClosed} />
          )}
        </div>
      </Section>
    </article>
  );
}

// How and when it was closed sit in the header; this shows what the patient got.
function ClosedView({ ticket, closure, onReopened }: { ticket: Ticket; closure: Closure; onReopened: () => void }) {
  const resolution = resolutionsFor(ticket).find((r) => r.id === closure.resolution);
  return (
    <div className="flex flex-col gap-3">
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
        <Button type="button" variant="quiet" onClick={() => {
            reopenTicket(ticket.id);
            onReopened();
          }}
        >
          Reopen
        </Button>
      </div>
    </div>
  );
}
