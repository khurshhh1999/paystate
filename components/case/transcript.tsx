// A conversation rendered as a chat, plus the judge's verdict. Used for recorded runs,
// live runs, the visitor's own chat and the Prompt lab. The traffic set turns on two extras:
// patient turns after the opener marked as simulated, and collect actions the gate removed.

import type { Turn, Verdict } from "@/lib/types";
import { ActionChip, OutcomeBadge } from "@/components/ui";

export function Transcript({
  turns,
  agentLabel = "Assistant",
  simulatedPatient = false,
  showGate = false,
}: {
  turns: Turn[];
  agentLabel?: string;
  simulatedPatient?: boolean;
  showGate?: boolean;
}) {
  if (turns.length === 0) {
    return <p className="text-[14px] text-ink-3">No messages.</p>;
  }
  return (
    <ol className="flex flex-col gap-3">
      {turns.map((t, i) => (
        <li key={i} className={t.role === "patient" ? "flex flex-col items-start" : "flex flex-col items-end"}>
          <span className="mb-1 px-1 text-[12.5px] text-ink-3">
            {t.role === "agent" ? agentLabel : simulatedPatient && i > 0 ? "Patient (simulated)" : "Patient"}
          </span>
          <div
            className={
              "max-w-[92%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-[14.5px] leading-[1.5] " +
              (t.role === "patient"
                ? "rounded-tl-sm bg-sunken text-ink"
                : "rounded-tr-sm border border-rule bg-surface text-ink")
            }
          >
            {t.text}
          </div>
          {t.role === "agent" && (
            <div className="mt-1.5 flex max-w-[92%] flex-wrap justify-end gap-1">
              {t.actions && t.actions.length > 0 ? (
                t.actions.map((a) => <ActionChip key={a} action={a} />)
              ) : (
                <span className="text-[12px] text-ink-3">No action</span>
              )}
            </div>
          )}
          {showGate && t.role === "agent" && t.gate?.removed && t.gate.removed.length > 0 && (
            <p className="mt-1 max-w-[92%] text-right text-[12.5px] text-ink-3">
              Blocked by the gate: <span className="num">{t.gate.removed.join(", ")}</span>
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

export function VerdictBlock({ verdict }: { verdict: Verdict }) {
  return (
    <div className="border-t border-rule pt-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px]">
        <span className="text-ink-2">Judge</span>
        <OutcomeBadge outcome={verdict.outcome} />
        <span className="text-ink-2">
          Accurate: <span className="text-ink">{verdict.accurate ? "yes" : "no"}</span>
        </span>
      </div>
      {verdict.reason && <p className="mt-1.5 text-[14px] text-ink">{verdict.reason}</p>}
    </div>
  );
}
