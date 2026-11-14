// Renders a case record (arbitrary JSON) as a billing record: key/value rows, arrays of
// objects as small ruled tables, nested objects as indented key/values. Every number in a
// case record is a dollar amount, so numbers render as money.

import type { ReactNode } from "react";
import { money } from "@/components/ui";

const WORDS: Record<string, string> = {
  carc: "Code",
  cpt: "CPT",
  desc: "Description",
  eob: "EOB",
  sms: "SMS",
  ehr: "EHR",
  dos: "Date of service",
};

export function humanize(key: string): string {
  if (WORDS[key]) return WORDS[key];
  const words = key.split("_").map((w) => WORDS[w] ?? w);
  const s = words.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CARC = /^(CO|PR|OA|PI)-\d+/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A claim adjustment code with its group visibly marked: CO (practice write-off) vs PR (patient owes). */
function CarcCode({ value }: { value: string }) {
  const group = value.slice(0, 2);
  const cls =
    group === "PR"
      ? "border-rule-strong bg-sunken text-ink font-medium"
      : group === "CO"
        ? "border-dashed border-rule-strong text-ink-2"
        : "border-rule text-ink-2";
  const title =
    group === "PR" ? "Patient responsibility" : group === "CO" ? "Contractual obligation: the practice's write-off" : undefined;
  const m = value.match(CARC);
  const code = m ? m[0] : value;
  const rest = m ? value.slice(code.length).trim() : "";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span title={title} className={"num rounded border px-1.5 py-px text-[12.5px] " + cls}>
        {code}
      </span>
      {rest && <span className="text-ink-2">{rest}</span>}
    </span>
  );
}

function Scalar({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-ink-3">None</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number") return <span className="num">{money(value)}</span>;
  const s = String(value);
  if (CARC.test(s)) return <CarcCode value={s} />;
  return <span>{s}</span>;
}

function hasCarc(rows: Record<string, unknown>[]): boolean {
  return rows.some((r) => Object.values(r).some((v) => typeof v === "string" && CARC.test(v)));
}

function ObjectTable({ rows }: { rows: Record<string, unknown>[] }) {
  const cols: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!cols.includes(k)) cols.push(k);
  const numeric = (k: string) => rows.every((r) => r[k] === undefined || r[k] === null || typeof r[k] === "number");
  return (
    <div>
      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              {cols.map((c) => (
                <th key={c} scope="col" className={numeric(c) ? "r" : undefined}>
                  {humanize(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map((c) => (
                  <td key={c} className={numeric(c) ? "r" : undefined}>
                    {r[c] === undefined ? <span className="text-ink-3">–</span> : <Value value={r[c]} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasCarc(rows) && (
        <p className="mt-2 text-[13px] text-ink-2">
          <span className="num rounded border border-dashed border-rule-strong px-1 text-[12px]">CO</span>: the
          practice&apos;s contractual write-off.{" "}
          <span className="num rounded border border-rule-strong bg-sunken px-1 text-[12px]">PR</span>: patient
          responsibility.
        </p>
      )}
    </div>
  );
}

function Value({ value }: { value: unknown }): ReactNode {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-ink-3">None</span>;
    if (value.every(isPlainObject)) return <ObjectTable rows={value as Record<string, unknown>[]} />;
    return (
      <span>
        {value.map((v, i) => (
          <span key={i}>
            {i > 0 && ", "}
            <Scalar value={v} />
          </span>
        ))}
      </span>
    );
  }
  if (isPlainObject(value)) return <KeyValues obj={value} nested />;
  return <Scalar value={value} />;
}

export function KeyValues({
  obj,
  nested = false,
  notes,
}: {
  obj: Record<string, unknown>;
  nested?: boolean;
  /** Optional quiet note per top-level key, shown under the field name. */
  notes?: Record<string, string>;
}) {
  const entries = Object.entries(obj);
  return (
    <dl className={nested ? "flex flex-col gap-1 pl-4" : "divide-y divide-rule"}>
      {entries.map(([k, v]) => {
        const block = Array.isArray(v) && v.length > 0 && v.every(isPlainObject);
        return (
          <div
            key={k}
            className={
              nested
                ? "flex flex-wrap gap-x-3"
                : block
                  ? "py-3"
                  : "grid gap-x-6 gap-y-0.5 py-2.5 sm:grid-cols-[200px_minmax(0,1fr)]"
            }
          >
            <dt className={"text-ink-2 " + (nested ? "min-w-[12ch]" : block ? "mb-2" : "")}>
              {humanize(k)}
              {notes?.[k] && <span className="block text-[12.5px] text-ink-3">{notes[k]}</span>}
            </dt>
            <dd className="min-w-0 break-words">
              <Value value={v} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function RecordView({ record, notes }: { record: Record<string, unknown>; notes?: Record<string, string> }) {
  return <KeyValues obj={record} notes={notes} />;
}
