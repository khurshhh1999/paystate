"use client";
// What the practice sees beside the thread: the record the assistant reads from, and the
// staff queue entry once a conversation is handed off.

import Link from "next/link";
import type { Case, Ticket, View } from "@/lib/types";
import { recordForView } from "@/lib/prompts.mjs";
import { Button, ErrorText, Panel, Segmented } from "@/components/ui";
import { RecordView } from "@/components/case/record-view";
import { TicketCard } from "./ticket-card";

export type FeedSetting = "full" | "statement";

export type TicketState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "done"; ticket: Ticket }
  | { status: "error"; message: string };

const FEED_OPTIONS: { value: FeedSetting; label: string }[] = [
  { value: "full", label: "All feeds" },
  { value: "statement", label: "Balance only" },
];

export function PracticeSide({
  kase,
  view,
  onViewChange,
  ticket,
  onRetryTicket,
  hasReply,
}: {
  kase: Case;
  view: FeedSetting;
  onViewChange: (v: FeedSetting) => void;
  ticket: TicketState;
  onRetryTicket: () => void;
  hasReply: boolean;
}) {
  const record = recordForView(kase, view as View);

  return (
    <section aria-labelledby="practice-side" className="flex min-w-0 flex-col gap-6">
      <h2 id="practice-side" className="text-[20px] font-semibold">
        On the practice&apos;s side
      </h2>

      <div className="flex flex-col gap-3">
        <h3 className="text-[16px] font-semibold">What the assistant can read</h3>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[13.5px] text-ink-2">Feeds connected</span>
          <Segmented label="Feeds connected" options={FEED_OPTIONS} value={view} onChange={onViewChange} />
        </div>
        <p className="text-[14px] text-ink-2">
          {view === "full"
            ? "Remittance, eligibility, ledger and visit record are connected."
            : "Only the statement balance reaches the assistant. Try the same patient both ways."}{" "}
          <Link href="/readiness" className="text-accent underline underline-offset-2">
            Check a practice before go-live
          </Link>
        </p>
        <Panel className="max-h-[300px] overflow-y-auto px-4 py-1 text-[14px]">
          <RecordView record={record} />
        </Panel>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-[16px] font-semibold">Staff queue</h3>
        <div aria-live="polite" className="flex flex-col gap-3">
          {ticket.status === "idle" && (
            <p className="text-[14px] text-ink-2">
              Nothing for staff yet. If the assistant can finish this itself, nothing lands here.
            </p>
          )}
          {ticket.status === "pending" && <p className="text-[14px] text-ink-3">Writing the handoff for staff</p>}
          {ticket.status === "done" && <TicketCard ticket={ticket.ticket} />}
          {ticket.status === "error" && (
            <div className="flex flex-wrap items-center gap-3">
              <ErrorText>{ticket.message}</ErrorText>
              <Button variant="quiet" className="h-8" onClick={onRetryTicket}>
                Retry
              </Button>
            </div>
          )}
        </div>
      </div>

      {hasReply && (
        <p className="text-[13.5px]">
          <Link href={`/cases/${kase.id}`} className="text-ink-2 underline underline-offset-2 hover:text-ink">
            See how recorded runs of this case were graded
          </Link>
        </p>
      )}
    </section>
  );
}
