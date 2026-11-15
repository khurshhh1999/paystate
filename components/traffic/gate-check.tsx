// The payment gate run over all 28 records with no model involved: first against the decision
// expected on the full record, then with less and less of the record connected.

import { money } from "@/components/ui";
import type { GateResult } from "./compute";
import { GATE_STATUS_LABEL, GATE_STATUSES, TRAFFIC, gateByView, gateCheck, gateColumn, storedGateChanges } from "./compute";

const STATUS_TEXT: Record<string, string> = {
  payable: "payable",
  partial: "part payable",
  not_payable: "not payable",
  held: "cannot verify, held for staff",
  unverified: "cannot verify",
};

const describe = (status: string, owed: number | null | undefined) =>
  `${STATUS_TEXT[status] ?? status}${owed !== null && owed !== undefined && owed > 0 ? ` ${money(owed)}` : ""}`;

const describeGate = (g: GateResult) => describe(gateColumn(g), g.owed);

function joinAnd(parts: string[]) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function GateCheck() {
  const check = gateCheck();
  const byView = gateByView();
  const changed = storedGateChanges(TRAFFIC);

  return (
    <section className="mt-12 border-t border-rule pt-8" aria-labelledby="gate">
      <h2 id="gate" className="text-[20px] font-semibold">
        The gate, checked without a model
      </h2>
      <div className="prose-col mt-2 space-y-2 text-ink-2">
        <p>
          The gate reads the reason codes on the remittance, the eligibility response, the ledger and the payer&apos;s
          stated patient share, and decides whether the balance can be collected and how much of it. It is rules in
          code, so it gives the same answer every time and costs nothing to run.
        </p>
        <p>
          The assistant cannot send a pay link or set up a plan on a balance the gate has blocked. It blocks a balance
          that is not payable, and one it holds for staff because the record shows something to sort out first:
          coverage the payer says was not active, Medicaid that has not been billed, a patient the record shows has
          died, or patient-share lines that do not add up to the balance.
        </p>
        <p>
          Where there is no remittance to check, the gate says it cannot verify and blocks nothing. The instructions
          decide, which is where both wrong collects in the bench happened. On a part-payable balance the assistant is
          told the supported amount, but the amount on a pay link is not checked in code.
        </p>
        <p>
          One account shows the limit of reading the record. The gate reads the widow&apos;s account as payable because
          the record still lists the patient as active. Only her message says he died, so not asking her for money
          rests on the instructions until staff mark the account.
        </p>
      </div>

      <p className="mt-5 text-[15px]">
        {check.mismatches.length === 0 ? (
          <>On the {check.total} records I wrote, the gate returns the decision I expected for each.</>
        ) : (
          <>
            <span className="font-medium tabular-nums text-wrong">
              {check.matches} of {check.total}
            </span>{" "}
            records get the decision I expected from the gate.
          </>
        )}
      </p>
      {check.mismatches.length > 0 && (
        <ul className="prose-col mt-2 divide-y divide-rule border-y border-rule text-[14px]">
          {check.mismatches.map((m) => (
            <li key={m.kase.id} className="py-2">
              <span className="font-medium">{m.kase.title}</span>
              <span className="text-ink-2">
                : expected {m.expected ? describe(m.expected.status, m.expected.owed) : "no decision"}, gate says{" "}
                {describeGate(m.actual)}.
              </span>
            </li>
          ))}
        </ul>
      )}
      {changed.length > 0 && (
        <p className="prose-col mt-3 text-[14px] text-ink-2">
          The stored conversations for {joinAnd(changed.map((c) => `“${c.kase.title}”`))} were recorded
          before the gate&apos;s rule changed, when it said {joinAnd(changed.map((c) => describe(c.stored.status, c.stored.owed)))}
          ; the Gate column in the table above shows what it decides now.
        </p>
      )}

      <h3 className="mt-8 text-[16px] font-semibold">As the record shrinks</h3>
      <p className="prose-col mt-1 text-[14px] text-ink-2">
        Number of the {check.total} situations in each result, by how much of the account record is connected. Held
        for staff and not payable are blocked; the rest are not.
      </p>
      <div className="table-scroll mt-3">
        <table className="ledger min-w-[640px] max-w-[860px]">
          <thead>
            <tr>
              <th scope="col">Connected</th>
              {GATE_STATUSES.map((s) => (
                <th key={s} scope="col" className="r">
                  {GATE_STATUS_LABEL[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byView.map((row) => (
              <tr key={row.view}>
                <td className="whitespace-nowrap text-ink">{row.label}</td>
                {GATE_STATUSES.map((s) => (
                  <td key={s} className={"r num " + (row.counts[s] === 0 ? "text-ink-3" : "")}>
                    {row.counts[s]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
