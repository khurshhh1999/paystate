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
  update_insurance: "New insurance details sent to the billing team to check.",
  offer_financial_assistance: "Financial assistance offered.",
  send_document: "Receipt or itemized statement sent.",
  stop_messages: "Text messages stopped. Paper statements continue.",
  update_contact: "Contact details updated.",
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
    <p className="mx-auto max-w-[85%] text-center text-[12.5px] leading-snug text-ink-2">{children}</p>
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
  limited = false,
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
  limited?: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  // Keep the newest message in view. A reply taller than the thread is shown from its first
  // line, so the patient does not land at the bottom of a long answer.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const newest = el.lastElementChild as HTMLElement | null;
    const tall = newest && newest.offsetHeight > el.clientHeight - 32;
    el.scrollTop = tall ? newest.offsetTop - 16 : el.scrollHeight;
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
          className="relative flex h-[360px] flex-col gap-2.5 overflow-y-auto px-3 py-4 lg:h-[360px]"
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
                {(t.gate?.removed?.length ?? 0) > 0 && <Receipt>A payment step was blocked by the gate.</Receipt>}
              </div>
            ),
          )}
          {pending && (
            <div className="flex justify-start">
              <p className="flex h-[36px] items-center gap-1 rounded-2xl rounded-bl-md bg-sunken px-3.5">
                <span className="sr-only">Typing</span>
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    aria-hidden
                    style={{ animationDelay: `${d}ms` }}
                    className="h-1.5 w-1.5 rounded-full bg-ink-2 motion-safe:animate-pulse"
                  />
                ))}
              </p>
            </div>
          )}
          {/* A failed reply sits under the message that did not get an answer, as on a phone. */}
          {error && (
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-right">
              {limited ? (
                <p className="text-[13.5px] text-ink-2" aria-live="polite">
                  {error}
                </p>
              ) : (
                <>
                  <ErrorText>{error}</ErrorText>
                  <Button variant="quiet" className="h-7 px-2.5 text-[13px]" onClick={onRetry} disabled={pending}>
                    Retry
                  </Button>
                </>
              )}
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
                <div className="flex flex-col items-end gap-1">
                  <span aria-hidden className="text-[12.5px] text-ink-3">
                    Suggested reply. Tap to send.
                  </span>
                  <button
                    type="button"
                    onClick={() => submit(suggestion)}
                    disabled={!canSend}
                    className="max-w-[85%] rounded-2xl rounded-br-md border border-accent bg-accent-soft px-3.5 py-2 text-left text-[14px] leading-snug text-accent transition-colors hover:bg-accent hover:text-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
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
                  rows={1}
                  maxLength={MAX_CHARS}
                  placeholder="Text message"
                  className="field-sizing-content max-h-28 min-h-9 flex-1 resize-none rounded-xl border border-rule-strong bg-surface px-3 py-2 text-[14.5px] text-ink placeholder:text-ink-3"
                />
                <Button type="submit" className="h-10" disabled={!canSend || !draft.trim()}>
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
