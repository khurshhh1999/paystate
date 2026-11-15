// The work item staff receive when the assistant hands a conversation off.

import Link from "next/link";
import type { Ticket } from "@/lib/types";
import { TICKET_KINDS } from "@/lib/ticket-kinds.mjs";
import { Money, Panel } from "@/components/ui";
import { toldPatient } from "@/components/queue/order";

export function TicketCard({ ticket }: { ticket: Ticket }) {
  const told = toldPatient(ticket.told_patient ?? "");
  return (
    <Panel className="flex flex-col text-[14px]">
      {/* What it is and how much, then why, then what staff do next. */}
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline gap-3">
          <span className="font-semibold">{TICKET_KINDS[ticket.kind]}</span>
          {ticket.hold && (
            <span className="rounded bg-handoff-soft px-1.5 py-0.5 text-[12.5px] font-medium text-handoff">On hold</span>
          )}
          <Money value={ticket.amount} className="ml-auto text-[14px]" />
        </div>
        <p>{ticket.reason}</p>
        {told.text && (
          <p className="text-ink-2">
            <span className="text-ink-3">Patient was told: </span>
            {told.text}
          </p>
        )}
      </div>
      {ticket.captured.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 border-t border-rule px-4 py-3 text-[13px]">
          {ticket.captured.map((c, i) => (
            <div key={i} className="contents">
              <dt className="text-ink-2">{c.label}</dt>
              <dd className="num break-words">{c.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="flex flex-col gap-2 border-t border-rule px-4 py-3">
        <p>
          <span className="font-medium">Next step: </span>
          {ticket.next_step}
        </p>
        <Link href={`/queue#${ticket.id}`} className="self-start text-[13.5px] text-accent underline underline-offset-2">
          Open in the staff queue
        </Link>
      </div>
    </Panel>
  );
}
