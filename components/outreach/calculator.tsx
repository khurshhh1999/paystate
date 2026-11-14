"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui";

export interface CalcTrigger {
  id: string;
  number: number;
  name: string;
  ratePct: number; // assumed incidence, percent of open balances
  avgStatement: number; // mean statement balance of caught accounts in the synthetic panel
  avgInQuestion: number; // mean amount not owed as stated
}

const DEFAULTS = { volume: 4000, contactsAvoided: 0.25, minutesPerContact: 8 };

const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const dollars = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function clampNum(raw: string, min: number, max: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

const inputClass =
  "num h-8 rounded-md border border-rule-strong bg-surface px-2 text-right text-[14px] text-ink";

function Field({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  width = "w-28",
}: {
  label: string;
  hint: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  width?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[14px] font-medium">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clampNum(e.target.value, min, max))}
        className={inputClass + " " + width}
      />
      <span className="text-[13px] text-ink-3">{hint}</span>
    </div>
  );
}

export function GateCalculator({ triggers }: { triggers: CalcTrigger[] }) {
  const baseRates = Object.fromEntries(triggers.map((t) => [t.id, t.ratePct]));
  const [rates, setRates] = useState<Record<string, number>>(baseRates);
  const [volume, setVolume] = useState(DEFAULTS.volume);
  const [contactsAvoided, setContactsAvoided] = useState(DEFAULTS.contactsAvoided);
  const [minutes, setMinutes] = useState(DEFAULTS.minutesPerContact);

  const rows = triggers.map((t) => {
    const held = (volume * (rates[t.id] ?? 0)) / 100;
    return { ...t, held, onStatements: held * t.avgStatement, inQuestion: held * t.avgInQuestion };
  });
  const held = rows.reduce((s, r) => s + r.held, 0);
  const onStatements = rows.reduce((s, r) => s + r.onStatements, 0);
  const inQuestion = rows.reduce((s, r) => s + r.inQuestion, 0);
  const contacts = held * contactsAvoided;
  const staffHours = (contacts * minutes) / 60;

  const reset = () => {
    setRates(baseRates);
    setVolume(DEFAULTS.volume);
    setContactsAvoided(DEFAULTS.contactsAvoided);
    setMinutes(DEFAULTS.minutesPerContact);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Field
          label="Open balances per month"
          hint="Accounts that would get a statement or reminder."
          value={volume}
          onChange={setVolume}
          min={0}
          max={1000000}
          step={100}
          width="w-32"
        />
        <Field
          label="Inbound contacts avoided per held account"
          hint="Calls, texts and portal messages that do not happen."
          value={contactsAvoided}
          onChange={setContactsAvoided}
          min={0}
          max={5}
          step={0.05}
        />
        <Field
          label="Staff minutes per contact"
          hint="Average handling time for one billing contact."
          value={minutes}
          onChange={setMinutes}
          min={0}
          max={120}
          step={1}
        />
      </div>

      <div className="table-scroll">
        <table className="ledger">
          <thead>
            <tr>
              <th>Rule</th>
              <th className="r">Assumed rate, %</th>
              <th className="r">Held per month</th>
              <th className="r">On those statements</th>
              <th className="r">Not owed as stated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="min-w-[180px]">
                  <label htmlFor={`rate-${r.id}`}>
                    <span className="num text-ink-3">{r.number}.</span> {r.name}
                  </label>
                </td>
                <td className="r">
                  <input
                    id={`rate-${r.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={20}
                    step={0.1}
                    value={rates[r.id]}
                    onChange={(e) => setRates((prev) => ({ ...prev, [r.id]: clampNum(e.target.value, 0, 20) }))}
                    className={inputClass + " w-20"}
                  />
                </td>
                <td className="r num">{whole(r.held)}</td>
                <td className="r num">{dollars(r.onStatements)}</td>
                <td className="r num">{dollars(r.inQuestion)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="font-medium">
                All rules
              </td>
              <td />
              <td className="r num font-medium">
                {whole(held)}
              </td>
              <td className="r num font-medium">
                {dollars(onStatements)}
              </td>
              <td className="r num font-medium">
                {dollars(inQuestion)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4" aria-live="polite">
        <div>
          <dt className="text-[13px] text-ink-2">Statements held per month</dt>
          <dd className="num text-[20px]">{whole(held)}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-2">Dollars on those statements</dt>
          <dd className="num text-[20px]">{dollars(onStatements)}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-2">Inbound contacts avoided</dt>
          <dd className="num text-[20px]">{whole(contacts)}</dd>
        </div>
        <div>
          <dt className="text-[13px] text-ink-2">Staff hours not spent on them</dt>
          <dd className="num text-[20px]">{staffHours.toFixed(1)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="quiet" type="button" onClick={reset}>
          Reset to the page&apos;s assumptions
        </Button>
        <p className="text-[13px] text-ink-3 prose-col">
          Average dollars per held account come from the synthetic panel. Rules are summed, so an account that trips two
          rules counts twice. Staff time to fix the held accounts is not netted out.
        </p>
      </div>
    </div>
  );
}
