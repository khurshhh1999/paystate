import type { Metadata } from "next";
import type { Ticket } from "@/lib/types";
import ticketsJson from "@/data/tickets.json";
import { Queue } from "@/components/queue/queue";

export const metadata: Metadata = {
  title: "Staff queue · Paystate",
};

const RECORDED = (ticketsJson as unknown as { tickets: Ticket[] }).tickets;

export default function QueuePage() {
  return (
    <div>
      <h1 className="text-[30px] font-semibold leading-tight">Staff queue</h1>
      <p className="prose-col mt-3 text-ink-2">
        Every conversation the assistant could not finish lands here with the reason, what the patient has been told,
        and the details they already gave. Closing a ticket sends the patient the outcome.
      </p>
      <Queue recorded={RECORDED} />
    </div>
  );
}
