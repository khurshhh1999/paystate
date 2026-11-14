// The work item staff receive when the assistant hands a conversation off.

import Link from "next/link";
import type { Ticket } from "@/lib/types";
import { TICKET_KINDS } from "@/lib/ticket-kinds.mjs";
import { Money, Panel } from "@/components/ui";

export function TicketCard({ ticket }: { ticket: Ticket }) {
  return (
    <Panel className="flex flex-col gap-3 p-4 text-[14px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">{TICKET_KINDS[ticket.kind]}</span>
        <Money value={ticket.amount} className="text-[13.5px]" />
        {ticket.hold && (
          <span className="rounded bg-handoff-soft px-1.5 py-0.5 text-[12.5px] font-medium text-handoff">On hold</span>
        )}
      </div>
      <p>{ticket.reason}</p>
      {ticket.told_patient && (
        <p className="text-ink-2">Patient was told: {ticket.told_patient}</p>
      )}
      {ticket.captured.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
          {ticket.captured.map((c, i) => (
            <div key={i} className="contents">
              <dt className="text-ink-2">{c.label}</dt>
              <dd className="num break-words">{c.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p>
        <span className="text-ink-2">Next step: </span>
        {ticket.next_step}
      </p>
      <Link href={`/queue#${ticket.id}`} className="text-[13.5px] text-accent underline underline-offset-2">
        Open in the staff queue
      </Link>
    </Panel>
  );
}
