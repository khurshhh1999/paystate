"use client";
// The home page demo: pick a patient, reply to their statement text, and watch what lands
// on the practice's side. Owns the conversation, the feed setting and the staff ticket.

import { useRef, useState } from "react";
import type { Action, Gate, Ticket, Turn } from "@/lib/types";
import { CASES } from "@/lib/cases.mjs";
import { needsTicket } from "@/lib/ticket-kinds.mjs";
import type { TicketBody } from "@/lib/tickets.mjs";
import { ApiError, isLimited, postJSON } from "@/components/api";
import { saveTicket } from "@/components/ticket-store";
import { PatientList } from "./patient-list";
import { HEADLINE } from "./headlines";
import { Thread } from "./thread";
import { PracticeSide, type FeedSetting, type TicketState } from "./practice-side";
import { PATIENT_ORDER, STATEMENT_TEXT, patientName } from "./statement-text";

// The chat API takes at most 10 turns, so five patient messages.
const MAX_PATIENT_TURNS = 5;

const ORDERED_CASES = PATIENT_ORDER.map((id) => CASES.find((c) => c.id === id)).filter(
  (c): c is (typeof CASES)[number] => Boolean(c),
);

function messageOf(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Try again.";
}

const isAbort = (err: unknown) => err instanceof Error && err.name === "AbortError";

export function PatientDesk() {
  const [caseId, setCaseId] = useState("timely-filing");
  const [view, setView] = useState<FeedSetting>("full");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A request limit is not a failure: it is shown as a note, without a retry button.
  const [limited, setLimited] = useState(false);
  const [ticket, setTicket] = useState<TicketState>({ status: "idle" });
  // The feed setting the visitor picked while a conversation is open, waiting on their yes.
  const [confirmView, setConfirmView] = useState<FeedSetting | null>(null);
  // Bumped on every reset so the thread drops its draft.
  const [threadKey, setThreadKey] = useState(0);

  const chatAbort = useRef<AbortController | null>(null);
  const ticketAbort = useRef<AbortController | null>(null);
  const conversationId = useRef<string | null>(null);
  const ticketTranscript = useRef<Turn[]>([]);
  // Bumped on every reset; a ticket that arrives for an earlier conversation is saved but not shown.
  const generation = useRef(0);

  const kase = ORDERED_CASES.find((c) => c.id === caseId) ?? ORDERED_CASES[0];
  const patientTurns = transcript.filter((t) => t.role === "patient").length;
  const last = transcript[transcript.length - 1];
  const awaitingReply = last?.role === "patient";
  const atCap = patientTurns >= MAX_PATIENT_TURNS && last?.role === "agent";
  const hasReply = transcript.some((t) => t.role === "agent");

  const suggestion = transcript.length === 0 ? kase.opener : transcript.length === 2 ? kase.followup : null;

  function reset() {
    chatAbort.current?.abort();
    chatAbort.current = null;
    // A handoff being written is left to finish: the patient was told staff will follow up,
    // so it still belongs in the queue. It just no longer updates this page.
    ticketAbort.current = null;
    generation.current += 1;
    conversationId.current = null;
    ticketTranscript.current = [];
    setTranscript([]);
    setPending(false);
    setError(null);
    setTicket({ status: "idle" });
    setConfirmView(null);
    setThreadKey((k) => k + 1);
  }

  async function requestTicket(full: Turn[]) {
    ticketAbort.current?.abort();
    const ctrl = new AbortController();
    ticketAbort.current = ctrl;
    ticketTranscript.current = full;
    const gen = generation.current;
    if (!conversationId.current) conversationId.current = crypto.randomUUID();
    const id = "live-" + conversationId.current;
    setTicket({ status: "pending" });
    try {
      const body = await postJSON<TicketBody & Pick<Ticket, "caseId" | "patient" | "balance" | "hold">>(
        "/api/ticket",
        { caseId: kase.id, transcript: full },
        ctrl.signal,
      );
      const t: Ticket = { ...body, id, createdAt: new Date().toISOString(), transcript: full, source: "live" };
      saveTicket(t);
      if (gen === generation.current) setTicket({ status: "done", ticket: t });
    } catch (err) {
      if (isAbort(err) || gen !== generation.current) return;
      setTicket({ status: "error", message: messageOf(err) });
    } finally {
      if (ticketAbort.current === ctrl) ticketAbort.current = null;
    }
  }

  async function ask(next: Turn[]) {
    chatAbort.current?.abort();
    const ctrl = new AbortController();
    chatAbort.current = ctrl;
    setPending(true);
    setError(null);
    try {
      // The product instructions: the assistant runs with the payment gate.
      const reply = await postJSON<{ text: string; actions?: Action[]; gate?: Gate }>(
        "/api/chat",
        { caseId: kase.id, version: "product", view, transcript: next },
        ctrl.signal,
      );
      const agent: Turn = { role: "agent", text: reply.text, actions: reply.actions ?? [], gate: reply.gate };
      const full = [...next, agent];
      setTranscript(full);
      // One ticket request per turn that hands off. A later handoff rewrites the same ticket.
      if (needsTicket([agent])) void requestTicket(full);
    } catch (err) {
      if (isAbort(err)) return;
      setLimited(isLimited(err));
      setError(messageOf(err));
    } finally {
      if (chatAbort.current === ctrl) {
        chatAbort.current = null;
        setPending(false);
      }
    }
  }

  function send(text: string) {
    if (pending || awaitingReply || atCap) return;
    if (!conversationId.current) conversationId.current = crypto.randomUUID();
    const next: Turn[] = [...transcript, { role: "patient", text }];
    setTranscript(next);
    void ask(next);
  }

  function retry() {
    if (awaitingReply && !pending) void ask(transcript);
  }

  function selectCase(id: string) {
    if (id === caseId) return;
    reset();
    setCaseId(id);
  }

  // A practice's feeds do not change mid-conversation, so a different setting means a new
  // conversation. Once anything has been sent, ask before clearing it.
  function changeView(v: FeedSetting) {
    if (v === view) {
      setConfirmView(null);
      return;
    }
    if (transcript.length > 0 || pending) {
      setConfirmView(v);
      return;
    }
    reset();
    setView(v);
  }

  function confirmChangeView() {
    if (!confirmView) return;
    const v = confirmView;
    reset();
    setView(v);
  }

  const headline = HEADLINE[kase.id];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[28px] font-semibold leading-tight sm:text-[32px]">{headline.title}</h1>
        <p className="prose-col">
          {headline.body} Reply as {patientName(kase).split(" ")[0]} and see what the assistant does.
        </p>
        <p className="prose-col text-ink-2">
          Paystate is a billing assistant that reads the practice&apos;s account before it asks a patient for money.
          Twelve patients are in the list. Some of them owe every cent.
        </p>
        <p className="prose-col text-[13.5px] text-ink-3">
          Khursheed Khan built this as an independent project, and every patient, account and amount in it is made up.
        </p>
      </header>
    <div className="grid gap-8 lg:grid-cols-[236px_420px_minmax(0,1fr)] lg:gap-6">
      <PatientList cases={ORDERED_CASES} selected={kase.id} onSelect={selectCase} />
      <Thread
        key={`${kase.id}-${threadKey}`}
        patientName={patientName(kase)}
        statement={STATEMENT_TEXT[kase.id]}
        transcript={transcript}
        pending={pending}
        suggestion={suggestion}
        canSend={!pending && !awaitingReply && !atCap}
        atCap={atCap}
        error={error}
        limited={limited}
        onSend={send}
        onRetry={retry}
        onStartOver={reset}
      />
      <PracticeSide
        kase={kase}
        view={view}
        onViewChange={changeView}
        confirmView={confirmView}
        onConfirmView={confirmChangeView}
        onCancelView={() => setConfirmView(null)}
        ticket={ticket}
        onRetryTicket={() => void requestTicket(ticketTranscript.current)}
        hasReply={hasReply}
      />
    </div>
    </div>
  );
}
