"use client";
// What the practice sees beside the thread: the record the assistant reads from, the payment
// gate on that record, and the staff queue entry once a conversation is handed off.

import Link from "next/link";
import type { Case, Ticket, View } from "@/lib/types";
import { recordForView } from "@/lib/prompts.mjs";
import { paymentGate } from "@/lib/gate.mjs";
import { Button, ErrorText, Panel, Segmented } from "@/components/ui";
import { RecordView } from "@/components/case/record-view";
import { TicketCard } from "./ticket-card";
import { GateLine } from "./gate-line";

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
  confirmView,
  onConfirmView,
  onCancelView,
  ticket,
  onRetryTicket,
  hasReply,
}: {
  kase: Case;
  view: FeedSetting;
  onViewChange: (v: FeedSetting) => void;
  confirmView: FeedSetting | null;
  onConfirmView: () => void;
  onCancelView: () => void;
  ticket: TicketState;
  onRetryTicket: () => void;
  hasReply: boolean;
}) {
  const seen = recordForView(kase, view as View);
  const record = moneyFirst(seen);
  const gate = paymentGate(seen);
  const balance = typeof seen.statement_balance === "number" ? seen.statement_balance : null;

  return (
    <section aria-labelledby="practice-side" className="flex min-w-0 flex-col gap-6 text-[14px]">
      <h2 id="practice-side" className="text-[20px] font-semibold">
        On the practice&apos;s side
      </h2>

      {/* First, because a handoff is what the practice acts on. */}
      <div className="flex flex-col gap-2">
        <h3 className="text-[16px] font-semibold">Staff queue</h3>
        <div aria-live="polite" className="flex flex-col gap-3">
          {ticket.status === "idle" && <p className="text-ink-2">Nothing from this conversation yet.</p>}
          {ticket.status === "pending" && <p className="text-ink-3">Writing the handoff for staff</p>}
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

      <div className="flex flex-col gap-3">
        <h3 className="text-[16px] font-semibold">What the assistant can read</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Segmented label="Feeds connected" options={FEED_OPTIONS} value={view} onChange={onViewChange} />
          <span className="text-[13.5px] text-ink-2">
            {view === "full"
              ? "Remittance, eligibility, ledger and visit record."
              : "The statement balance only. Try both ways."}
          </span>
        </div>
        {confirmView && (
          <div role="status" className="flex flex-col gap-2 border-l-2 border-stuck pl-3">
            <p>
              {confirmView === "full" ? "All feeds" : "Balance only"} gives the assistant a different record, so
              the conversation starts over.
              {ticket.status === "done" && " The ticket already in the staff queue stays there."}
              {ticket.status === "pending" && " The handoff being written still goes to the staff queue."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button className="h-8" onClick={onConfirmView}>
                Start over with {confirmView === "full" ? "all feeds" : "balance only"}
              </Button>
              <Button variant="quiet" className="h-8" onClick={onCancelView}>
                Keep this conversation
              </Button>
            </div>
          </div>
        )}
        <GateLine gate={gate} balance={balance} />
        {/* The column is narrower than the record's default 200px label width allows for. */}
        <Panel className="px-4 py-1 sm:[&>dl>div]:grid-cols-[132px_minmax(0,1fr)] sm:[&>dl>div]:gap-x-4">
          <RecordView record={record} />
        </Panel>
      </div>

      <p className="flex flex-wrap gap-x-5 gap-y-1 text-[13.5px]">
        <Link href="/readiness" className="text-ink-2 underline underline-offset-2 hover:text-ink">
          Check a practice before go-live
        </Link>
        {hasReply && (
          <Link href={`/cases/${kase.id}`} className="text-ink-2 underline underline-offset-2 hover:text-ink">
            See how recorded runs of this case were graded
          </Link>
        )}
      </p>
    </section>
  );
}

// A biller reads the money first: what is owed, how the payer adjudicated it, what was paid.
const MONEY_KEYS = ["statement_balance", "remit", "payer_paid", "payer_eob", "ledger"];

function moneyFirst(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of MONEY_KEYS) if (k in record) out[k] = record[k];
  for (const [k, v] of Object.entries(record)) if (!(k in out)) out[k] = v;
  return out;
}
