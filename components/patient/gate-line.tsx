// The payment gate for the selected patient under the selected feeds. Computed here from the
// same record the assistant reads, so it shows before any message is sent.

import type { Gate } from "@/lib/types";
import { money } from "@/components/ui";

type GateResult = Omit<Gate, "removed">;

const TONE: Record<Gate["status"], string> = {
  not_payable: "text-wrong",
  payable: "text-ok",
  partial: "text-stuck",
  unverified: "text-ink-2",
};

function statusText(gate: GateResult, balance: number | null): string {
  switch (gate.status) {
    case "not_payable":
      return "Not payable as stated";
    case "payable":
      return `Payable: ${money(gate.owed ?? 0)}`;
    case "partial":
      return balance === null
        ? `Part payable: ${money(gate.owed ?? 0)}`
        : `Part payable: ${money(gate.owed ?? 0)} of ${money(balance)}`;
    case "unverified":
      return gate.block ? "Cannot verify, held for staff" : "Cannot verify with these feeds";
  }
}

// What the code does with this result. Each sentence has to stay true of enforceGate.
function enforcedText(gate: GateResult): string {
  if (gate.block) return "The assistant cannot send a pay link or set up a plan on a balance the gate has blocked.";
  switch (gate.status) {
    case "partial":
      return "Nothing is blocked. The assistant is told the supported amount, but the amount on a pay link is not checked in code.";
    case "unverified":
      return "Where there is no remittance to check, the gate blocks nothing. The assistant's instructions decide.";
    default:
      return "Nothing is blocked.";
  }
}

export function GateLine({ gate, balance }: { gate: GateResult; balance: number | null }) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-rule-strong pl-3" aria-live="polite">
      <p>
        <span className="font-medium">Payment gate</span>{" "}
        <span className={"font-medium " + TONE[gate.status]}>{statusText(gate, balance)}</span>
      </p>
      <ul className="flex flex-col gap-0.5 text-ink-2">
        {gate.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <p className="text-[13px] text-ink-3">Rules in code. {enforcedText(gate)}</p>
    </div>
  );
}
