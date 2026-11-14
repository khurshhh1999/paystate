"use client";
// The text thread as the patient sees it: the statement text, the replies, and what the
// assistant did, written the way the patient would read it.

import { useEffect, useRef, useState } from "react";
import type { Action, Turn } from "@/lib/types";
import { Button, ErrorText } from "@/components/ui";

const MAX_CHARS = 600;

const RECEIPT: Record<Action, string> = {
  place_hold: "Balance on hold. No statements or reminders while this is reviewed.",
  handoff_to_staff: "Sent to the billing team. They reply by the end of the next business day.",
  set_up_plan: "Payment plan set up.",
  send_pay_link: "Payment link sent.",
  update_insurance: "New insurance saved to the account.",
  offer_financial_assistance: "Financial assistance application started.",
};

function Bubble({ from, children }: { from: "patient" | "practice"; children: React.ReactNode }) {
  const mine = from === "patient";
  return (
    <div className={"flex " + (mine ? "justify-end" : "justify-start")}>
      <p
        className={
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug " +
          (mine ? "rounded-br-md bg-accent text-accent-ink" : "rounded-bl-md bg-sunken text-ink")
        }
      >
        {children}
      </p>
    </div>
  );
}

function Receipt({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
      <span aria-hidden className="h-px flex-1 bg-rule" />
      <span className="max-w-[80%] text-center leading-snug">{children}</span>
      <span aria-hidden className="h-px flex-1 bg-rule" />
    </div>
  );
}

export function Thread({
  patientName,
  statement,
  transcript,
  pending,
  suggestion,
  canSend,
  atCap,
  error,
  onSend,
  onRetry,
  onStartOver,
}: {
  patientName: string;
  statement: string;
  transcript: Turn[];
  pending: boolean;
  suggestion: string | null;
  canSend: boolean;
  atCap: boolean;
  error: string | null;
  onSend: (text: string) => void;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest message in view.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length, pending, error]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || !canSend) return;
    onSend(t);
    setDraft("");
  }

  const last = transcript[transcript.length - 1];
  const latestReply = last && last.role === "agent" ? last.text : "";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col overflow-hidden rounded-2xl border border-rule-strong bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
          <div className="leading-tight">
            <p className="text-[14.5px] font-medium">Northfield Medical Group</p>
            <p className="text-[13px] text-ink-3">Billing</p>
          </div>
          <Button
            variant="quiet"
            className="h-7 px-2.5 text-[13px]"
            onClick={onStartOver}
            disabled={transcript.length === 0 && !error}
          >
            Start over
          </Button>
        </div>

        <div
          ref={scroller}
          className="flex h-[440px] flex-col gap-2.5 overflow-y-auto px-3 py-4 lg:h-[520px]"
          aria-label={`Text thread with Northfield Medical Group, as ${patientName}`}
          role="region"
          tabIndex={0}
        >
          <Bubble from="practice">{statement}</Bubble>
          {transcript.map((t, i) =>
            t.role === "patient" ? (
              <Bubble key={i} from="patient">
                {t.text}
              </Bubble>
            ) : (
              <div key={i} className="flex flex-col gap-2.5">
                <Bubble from="practice">{t.text}</Bubble>
                {(t.actions ?? []).map((a) => (
                  <Receipt key={a}>{RECEIPT[a]}</Receipt>
                ))}
              </div>
            ),
          )}
          {pending && (
            <div className="flex justify-start">
              <p className="rounded-2xl rounded-bl-md bg-sunken px-3.5 py-2 text-[14px] text-ink-3">Typing</p>
            </div>
          )}
        </div>

        {/* Screen readers hear each reply once it arrives. */}
        <div aria-live="polite" className="sr-only">
          {latestReply}
        </div>

        <div className="flex flex-col gap-2 border-t border-rule p-3">
          {atCap ? (
            <p className="text-[13.5px] text-ink-2">This thread stops at five messages. Start over to keep going.</p>
          ) : (
            <>
              {suggestion && (
                <div className="flex">
                  <button
                    type="button"
                    onClick={() => submit(suggestion)}
                    disabled={!canSend}
                    className="max-w-full rounded-2xl border border-rule-strong px-3 py-1.5 text-left text-[13.5px] leading-snug text-ink hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="sr-only">Send suggested reply: </span>
                    {suggestion}
                  </button>
                </div>
              )}
              <form
                className="flex items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit(draft);
                }}
              >
                <label htmlFor="patient-message" className="sr-only">
                  Message as {patientName}
                </label>
                <textarea
                  id="patient-message"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      submit(draft);
                    }
                  }}
                  rows={2}
                  maxLength={MAX_CHARS}
                  placeholder="Text message"
                  className="min-h-10 flex-1 resize-none rounded-xl border border-rule-strong bg-surface px-3 py-2 text-[14.5px] text-ink placeholder:text-ink-3"
                />
                <Button type="submit" disabled={!canSend || !draft.trim()}>
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <ErrorText>{error}</ErrorText>
          <Button variant="quiet" className="h-8" onClick={onRetry} disabled={pending}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
