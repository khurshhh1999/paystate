// The live result line for the current setting: four figures, then staff load.

import { money } from "@/components/ui";
import type { Summary } from "./compute";

function Figure({ value, label, tone = "", note }: { value: number; label: string; tone?: string; note?: string }) {
  return (
    <div className="min-w-0 px-0 py-3 sm:px-5 sm:first:pl-0">
      <p className={"num text-[30px] font-medium leading-none " + tone}>{value}</p>
      <p className="mt-1.5 text-[13.5px] text-ink-2">{label}</p>
      {note && <p className="mt-0.5 text-[13px] text-ink-2">{note}</p>}
    </div>
  );
}

export function ReadinessSummary({ s, staffWithAll }: { s: Summary; staffWithAll: number | null }) {
  const ran = s.cases - s.unrun;
  return (
    <div aria-live="polite">
      <div className="grid grid-cols-2 gap-x-4 border-y border-rule sm:grid-cols-4 sm:divide-x sm:divide-rule">
        <Figure value={s.allRight} label="answered right every time" />
        <Figure value={s.mixed} label="right in some runs" />
        <Figure value={s.neverRight} label="never right" />
        <Figure
          value={s.wrongCollects}
          label="wrong collects"
          tone={s.wrongCollects > 0 ? "text-wrong" : ""}
          note={s.wrongCollects > 0 ? `${money(s.wrongDollarsPerPass)} per pass through the twelve` : undefined}
        />
      </div>
      {s.unrun > 0 && (
        <p className="mt-3 text-[14px] text-ink-2">
          {s.unrun} of {s.cases} questions have not been run with these feeds yet. The figures cover the other {ran}.
        </p>
      )}
      {s.trials > 0 && (
        <p className="mt-3 text-[14.5px]">
          <span className="num font-medium">
            {s.staffEnds} of {s.trials}
          </span>{" "}
          conversations end with staff.
          {staffWithAll !== null && <> With everything connected it is <span className="num">{staffWithAll}</span>.</>}
        </p>
      )}
    </div>
  );
}
