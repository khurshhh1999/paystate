"use client";
// The twelve patients. A list of buttons on wide screens, a native select on narrow ones.

import type { Case } from "@/lib/types";
import { money } from "@/components/ui";
import { SITUATION, patientName } from "./statement-text";

export function PatientList({
  cases,
  selected,
  onSelect,
}: {
  cases: Case[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5 lg:hidden">
        <label htmlFor="patient-picker" className="text-[13.5px] text-ink-2">
          Patient
        </label>
        <select
          id="patient-picker"
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="h-10 w-full rounded-md border border-rule-strong bg-surface px-2.5 text-[14.5px] text-ink"
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {patientName(c)}, {money(c.balance)}
            </option>
          ))}
        </select>
        {/* The closed select is too narrow for the description, so it sits underneath. */}
        <p className="text-[13.5px] leading-snug text-ink-2">{SITUATION[selected]}</p>
      </div>

      <nav aria-label="Patients" className="hidden lg:block">
        <ul className="flex flex-col gap-0.5">
          {cases.map((c) => {
            const on = c.id === selected;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onSelect(c.id)}
                  className={
                    "w-full rounded-md px-3 py-2 text-left transition-colors " +
                    (on ? "bg-accent-soft text-accent" : "text-ink hover:bg-sunken")
                  }
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{patientName(c)}</span>
                    <span className={"num text-[13px] " + (on ? "" : "text-ink-2")}>{money(c.balance)}</span>
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{SITUATION[c.id]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
