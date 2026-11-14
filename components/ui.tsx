// Shared primitives. Every page uses these so outcomes, money and buttons look the same everywhere.

import type { ReactNode } from "react";

export type Outcome = "resolved" | "correct_handoff" | "dead_end" | "wrong_collect";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  resolved: "Resolved",
  correct_handoff: "Right handoff",
  dead_end: "Dead end",
  wrong_collect: "Wrong collect",
};

const OUTCOME_CLASS: Record<Outcome, string> = {
  resolved: "bg-ok-soft text-ok",
  correct_handoff: "bg-handoff-soft text-handoff",
  dead_end: "bg-stuck-soft text-stuck",
  wrong_collect: "bg-wrong-soft text-wrong",
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  return (
    <span
      className={
        "inline-flex items-center rounded px-1.5 py-0.5 text-[12.5px] font-medium whitespace-nowrap " +
        OUTCOME_CLASS[outcome]
      }
    >
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

// One small square per trial, for showing three trials of a case in a table cell.
export function OutcomeDot({ outcome }: { outcome: Outcome }) {
  const bg: Record<Outcome, string> = {
    resolved: "bg-ok",
    correct_handoff: "bg-handoff",
    dead_end: "bg-stuck",
    wrong_collect: "bg-wrong",
  };
  return (
    <span
      role="img"
      title={OUTCOME_LABEL[outcome]}
      aria-label={OUTCOME_LABEL[outcome]}
      className={"inline-block h-3 w-3 rounded-[3px] " + bg[outcome]}
    />
  );
}

export function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function Money({ value, className = "" }: { value: number; className?: string }) {
  return <span className={"num " + className}>{money(value)}</span>;
}

export function ActionChip({ action }: { action: string }) {
  const collecting = action === "send_pay_link" || action === "set_up_plan";
  return (
    <span
      className={
        "num inline-flex rounded border px-1.5 py-0.5 text-[11.5px] " +
        (collecting ? "border-rule-strong text-ink" : "border-rule text-ink-2")
      }
    >
      {action}
    </span>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: "primary" | "quiet";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-md px-3.5 h-9 text-[14px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const look =
    variant === "primary"
      ? "bg-accent text-accent-ink hover:opacity-90"
      : "border border-rule-strong text-ink hover:bg-sunken";
  return (
    <button className={`${base} ${look} ${className}`} {...rest}>
      {children}
    </button>
  );
}

// A bordered block for one self-contained object (a record, a transcript). Use sparingly.
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={"rounded-lg border border-rule bg-surface " + className}>{children}</div>;
}

// Placeholder square for a trial that has not been run.
export function EmptyDot() {
  return (
    <span
      role="img"
      title="Not run yet"
      aria-label="Not run yet"
      className="inline-block h-3 w-3 rounded-[3px] border border-rule-strong"
    />
  );
}

// A small row of mutually exclusive buttons (trial 1/2/3, v1/v2). Real buttons with aria-pressed.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-rule-strong p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={
            "h-7 min-w-8 rounded px-2.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
            (o.value === value ? "bg-accent-soft font-medium text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Inline error shown next to the control that caused it.
export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="text-[13.5px] text-wrong">
      {children}
    </p>
  );
}
