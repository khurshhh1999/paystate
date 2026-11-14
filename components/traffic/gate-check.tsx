// The payment gate run over all 28 records with no model involved: first against the answer
// key on the full record, then with less and less of the record connected.

import { money } from "@/components/ui";
import { GATE_STATUS_LABEL, GATE_STATUSES, gateByView, gateCheck } from "./compute";

const STATUS_TEXT: Record<string, string> = {
  payable: "payable",
  partial: "part payable",
  not_payable: "not payable",
  unverified: "cannot verify",
};

const describe = (status: string, owed: number | null | undefined) =>
  `${STATUS_TEXT[status] ?? status}${owed !== null && owed !== undefined && owed > 0 ? ` ${money(owed)}` : ""}`;

export function GateCheck() {
  const check = gateCheck();
  const byView = gateByView();

  return (
    <section className="mt-12 border-t border-rule pt-8" aria-labelledby="gate">
      <h2 id="gate" className="text-[20px] font-semibold">
        The gate, checked without a model
      </h2>
      <p className="prose-col mt-2 text-ink-2">
        The gate reads the reason codes on the remittance, the eligibility response, the ledger and the payer&apos;s
        stated patient share, and decides whether the balance can be collected and how much of it. It is rules in code,
        so it gives the same answer every time and costs nothing to run. When it cannot verify the balance, the
        assistant does not push for payment and staff confirm the amount.
      </p>

      <p className="mt-5 text-[15px]">
        <span className={"font-medium tabular-nums " + (check.mismatches.length > 0 ? "text-wrong" : "")}>
          {check.matches} of {check.total}
        </span>{" "}
        match the answer key on the full record.
      </p>
      {check.mismatches.length > 0 && (
        <ul className="prose-col mt-2 divide-y divide-rule border-y border-rule text-[14px]">
          {check.mismatches.map((m) => (
            <li key={m.kase.id} className="py-2">
              <span className="font-medium">{m.kase.title}</span>
              <span className="text-ink-2">
                : expected {m.expected ? describe(m.expected.status, m.expected.owed) : "no answer"}, gate says{" "}
                {describe(m.actual.status, m.actual.owed)}.
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-8 text-[16px] font-semibold">As the record shrinks</h3>
      <p className="prose-col mt-1 text-[14px] text-ink-2">
        Number of the {check.total} situations in each result, by how much of the account record is connected.
      </p>
      <div className="table-scroll mt-3">
        <table className="ledger min-w-[560px] max-w-[760px]">
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
