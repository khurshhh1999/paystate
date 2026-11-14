import { money } from "@/components/ui";
import type { SampleRow } from "@/lib/outreach/types";

const MONEY_COLUMNS = new Set(["statement_balance", "amount_in_question", "in_network_cost_share", "unapplied_total"]);

export function SampleTable({ columns, rows }: { columns: string[]; rows: SampleRow[] }) {
  if (!rows.length) return <p className="text-[14px] text-ink-3">The query returned no rows.</p>;
  return (
    <div className="table-scroll">
      <table className="ledger">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} className={typeof rows[0][c] === "number" ? "r" : undefined}>
                <span className="num text-[12.5px]">{c}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.account_id)}>
              {columns.map((c) => {
                const v = row[c];
                if (typeof v === "number") {
                  return (
                    <td key={c} className="r num whitespace-nowrap">
                      {MONEY_COLUMNS.has(c) ? money(v) : v}
                    </td>
                  );
                }
                return (
                  <td key={c} className="num whitespace-nowrap text-[13px]">
                    {v ?? "null"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
