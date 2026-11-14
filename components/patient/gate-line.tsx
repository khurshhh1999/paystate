// The payment gate for the selected patient under the selected feeds. Computed here from the
// same record the assistant reads, so it shows before any message is sent.

import type { Gate } from "@/lib/types";
import { money } from "@/components/ui";

const TONE: Record<Gate["status"], string> = {
  not_payable: "text-wrong",
  payable: "text-ok",
  partial: "text-stuck",
  unverified: "text-ink-2",
};

function statusText(gate: Omit<Gate, "removed">, balance: number | null): string {
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
      return "Cannot verify with these feeds";
  }
}

export function GateLine({ gate, balance }: { gate: Omit<Gate, "removed">; balance: number | null }) {
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
      <p className="text-[13px] text-ink-3">
        Computed by rules in code. The assistant cannot take money the gate does not allow.
      </p>
    </div>
  );
}
