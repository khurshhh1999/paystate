// The live result line for the current setting: four figures, then staff load.
// The first three count questions; wrong collects count conversations. The line above the grid says both.

import { money } from "@/components/ui";
import type { Summary } from "./compute";

function Figure({ value, label, tone = "", note }: { value: number; label: string; tone?: string; note?: string }) {
  return (
    <div className="min-w-0 py-3">
      <p className={"num text-[26px] font-medium leading-none " + tone}>{value}</p>
      <p className="mt-1.5 whitespace-nowrap text-[13.5px] text-ink-2">{label}</p>
      {note && <p className="mt-0.5 text-[13px] text-ink-2">{note}</p>}
    </div>
  );
}

export function ReadinessSummary({
  s,
  staffWithAll,
  allConnected,
}: {
  s: Summary;
  staffWithAll: number | null;
  allConnected: boolean;
}) {
  const ran = s.cases - s.unrun;
  return (
    <div aria-live="polite">
      <p className="text-[13.5px] text-ink-2">
        Questions out of {ran}. Wrong collects out of {s.trials} conversations.
      </p>
      <div className="mt-1 grid grid-cols-2 gap-x-6 border-y border-rule sm:grid-cols-4 lg:grid-cols-2">
        <Figure value={s.allRight} label="right every time" />
        <Figure value={s.mixed} label="right in some runs" />
        <Figure value={s.neverRight} label="never right" />
        <Figure
          value={s.wrongCollects}
          label="wrong collects"
          tone={s.wrongCollects > 0 ? "text-wrong" : ""}
          note={s.wrongCollects > 0 ? `Averages ${money(s.wrongDollarsPerPass)} not owed each time all twelve are asked` : undefined}
        />
      </div>
      {s.unrun > 0 && (
        <p className="mt-3 text-[14px] text-ink-2">
          {s.unrun} of {s.cases} questions have not been run with these feeds yet. The figures cover the other {ran}.
        </p>
      )}
      {s.trials > 0 && (
        <p className="mt-3 text-[14.5px]">
          <span className="font-medium tabular-nums">
            {s.staffEnds} of {s.trials}
          </span>{" "}
          conversations end with staff.
          {staffWithAll !== null && !allConnected && (
            <>
              {" "}
              With everything connected it is <span className="tabular-nums">{staffWithAll}</span>.
            </>
          )}
        </p>
      )}
    </div>
  );
}
