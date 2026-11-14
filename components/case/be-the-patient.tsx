"use client";

import { useState } from "react";
import type { Action, Turn, Verdict, Version, View } from "@/lib/types";
import { Button, ErrorText, Panel, Segmented } from "@/components/ui";
import { postJSON } from "@/components/api";
import { Transcript, VerdictBlock } from "./transcript";
import { VIEW_OPTIONS } from "./views";

const MAX_PATIENT_TURNS = 5;

export function BeThePatient({ caseId, opener, defaultView }: { caseId: string; opener: string; defaultView: View }) {
  const [version, setVersion] = useState<Version>("v2");
  const [view, setView] = useState<View>(defaultView);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState(opener);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  const patientTurns = turns.filter((t) => t.role === "patient").length;
  const atCap = patientTurns >= MAX_PATIENT_TURNS;
  const started = turns.length > 0;
  const lastIsAgent = turns.length > 0 && turns[turns.length - 1].role === "agent";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending || atCap) return;
    const next: Turn[] = [...turns, { role: "patient", text }];
    setTurns(next);
    setDraft("");
    setSending(true);
    setSendError(null);
    setVerdict(null);
    try {
      const reply = await postJSON<{ text: string; actions: Action[] }>("/api/chat", {
        caseId,
        version,
        view,
        transcript: next,
      });
      setTurns([...next, { role: "agent", text: reply.text, actions: reply.actions ?? [] }]);
    } catch (err) {
      // Put the message back so the visitor can retry without retyping.
      setTurns(turns);
      setDraft(text);
      setSendError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function grade() {
    setGrading(true);
    setGradeError(null);
    try {
      const v = await postJSON<Verdict>("/api/judge", { caseId, view, transcript: turns });
      setVerdict(v);
    } catch (err) {
      setGradeError((err as Error).message);
    } finally {
      setGrading(false);
    }
  }

  function reset() {
    setTurns([]);
    setDraft(opener);
    setVerdict(null);
    setSendError(null);
    setGradeError(null);
  }

  return (
    <Panel className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-ink-2">Talk to</span>
          <Segmented
            label="Agent version"
            value={version}
            onChange={setVersion}
            disabled={started}
            options={[
              { value: "v1", label: "v1" },
              { value: "v2", label: "v2" },
            ]}
          />
          <Segmented label="What the agent sees" value={view} onChange={setView} disabled={started} options={VIEW_OPTIONS} />
          {started && <span className="text-[13px] text-ink-3">Start over to switch.</span>}
        </div>
        <span className="num text-[13px] text-ink-2">
          {patientTurns}/{MAX_PATIENT_TURNS} messages
        </span>
      </div>

      <div className="flex flex-col gap-4 p-4">
        {started ? (
          <Transcript turns={turns} agentLabel={`Agent ${version}`} />
        ) : (
          <p className="text-[14px] text-ink-2">
            The first message is the scripted patient&apos;s opener. Edit it or send it as is, then reply however you
            like. Try offering to pay.
          </p>
        )}
        {sending && (
          <p className="text-right text-[13.5px] text-ink-3" aria-live="polite">
            Agent is replying…
          </p>
        )}

        {!atCap ? (
          <form onSubmit={send} className="flex flex-col gap-2">
            <label htmlFor={`msg-${caseId}`} className="text-[13.5px] text-ink-2">
              Your message as the patient
            </label>
            <textarea
              id={`msg-${caseId}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              maxLength={1000}
              disabled={sending}
              className="w-full resize-y rounded-md border border-rule-strong bg-surface px-3 py-2 text-[14.5px] text-ink placeholder:text-ink-3 disabled:opacity-60"
              placeholder="Write as the patient"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={sending || !draft.trim()}>
                {sending ? "Sending…" : "Send"}
              </Button>
              <span className="text-[12.5px] text-ink-3">Ctrl or Cmd + Enter to send</span>
            </div>
            {sendError && <ErrorText>{sendError}</ErrorText>}
          </form>
        ) : (
          <p className="text-[14px] text-ink-2">That is the limit of {MAX_PATIENT_TURNS} patient messages. Grade it or start over.</p>
        )}

        {started && (
          <div className="flex flex-col gap-3 border-t border-rule pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="quiet" onClick={grade} disabled={grading || sending || !lastIsAgent}>
                {grading ? "Grading…" : "Grade this conversation"}
              </Button>
              <Button variant="quiet" onClick={reset} disabled={sending || grading}>
                Start over
              </Button>
            </div>
            {gradeError && <ErrorText>{gradeError}</ErrorText>}
            {verdict && <VerdictBlock verdict={verdict} />}
          </div>
        )}
      </div>
    </Panel>
  );
}
