"use client";

// Owns the go-live check state: which feeds are connected and whether the payable check is on.
// Everything below the controls is recomputed from recorded runs on each change.

import { useMemo, useState } from "react";
import Link from "next/link";
import { FEEDS, FEED_IDS } from "@/lib/feeds.mjs";
import type { FeedId, Version } from "@/lib/types";
import { RESULTS } from "@/components/bench";
import { Button } from "@/components/ui";
import { caseRows, summarize, suggestions, type Suggestion } from "./compute";
import { ReadinessSummary } from "./summary";
import { CaseTable } from "./case-table";

const FEED_LABEL = Object.fromEntries(FEEDS.map((f) => [f.id, f.label])) as Record<FeedId, string>;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function suggestionText(s: Suggestion): string {
  if (!s.ran) return "not run yet";
  if (s.moreRight === 0 && s.fewerWrong === 0) return "no change for these twelve questions";
  const parts: string[] = [];
  if (s.moreRight > 0) parts.push(`${plural(s.moreRight, "more conversation", "more conversations")} right`);
  if (s.moreRight < 0) parts.push(`${plural(-s.moreRight, "fewer conversation", "fewer conversations")} right`);
  if (s.fewerWrong > 0) parts.push(plural(s.fewerWrong, "fewer wrong collect", "fewer wrong collects"));
  if (s.fewerWrong < 0) parts.push(plural(-s.fewerWrong, "more wrong collect", "more wrong collects"));
  return parts.join(", ");
}

function Toggle({
  id,
  label,
  standard,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  standard?: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (on: boolean) => void;
}) {
  return (
    <div className="flex gap-3 py-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-describedby={`${id}-desc`}
        className="mt-1 size-4 shrink-0 accent-accent disabled:opacity-60"
      />
      <div className="min-w-0">
        <label htmlFor={id} className={"font-medium " + (disabled ? "text-ink-2" : "text-ink")}>
          {label}
          {standard && <span className="num ml-2 text-[13px] font-normal text-ink-3">{standard}</span>}
        </label>
        <p id={`${id}-desc`} className="text-[13.5px] text-ink-2">
          {description}
        </p>
      </div>
    </div>
  );
}

export function GoLiveCheck() {
  const [connected, setConnected] = useState<FeedId[]>([]);
  const [checkOn, setCheckOn] = useState(true);
  const version: Version = checkOn ? "v2" : "v1";

  // Keep FEEDS order so the same set always maps to the same recorded run.
  const setFeed = (id: FeedId, on: boolean) =>
    setConnected((cur) => FEED_IDS.filter((f) => (f === id ? on : cur.includes(f))));

  const { rows, summary, staffWithAll, next } = useMemo(() => {
    const all = summarize(RESULTS, version, FEED_IDS);
    return {
      rows: caseRows(RESULTS, version, connected),
      summary: summarize(RESULTS, version, connected),
      staffWithAll: all.unrun === 0 ? all.staffEnds : null,
      next: suggestions(RESULTS, version, connected),
    };
  }, [connected, version]);

  return (
    <div className="mt-8 flex flex-col gap-10">
      <section aria-labelledby="feeds-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="feeds-h" className="text-[20px] font-semibold">
            Connected feeds
          </h2>
          <div className="flex gap-2">
            <Button variant="quiet" type="button" onClick={() => setConnected([])} className="h-8 text-[13.5px]">
              Balance only
            </Button>
            <Button variant="quiet" type="button" onClick={() => setConnected([...FEED_IDS])} className="h-8 text-[13.5px]">
              Everything
            </Button>
          </div>
        </div>
        <div className="mt-2 divide-y divide-rule border-y border-rule">
          <Toggle
            id="feed-statement"
            label="Statement balance"
            description="Always there: the service, the amounts and the payer's name."
            checked
            disabled
          />
          <div className="grid divide-y divide-rule sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
            {FEEDS.map((f) => (
              <Toggle
                key={f.id}
                id={`feed-${f.id}`}
                label={f.label}
                standard={f.standard}
                description={f.carries}
                checked={connected.includes(f.id)}
                onChange={(on) => setFeed(f.id, on)}
              />
            ))}
          </div>
        </div>
        <div className="mt-6 border-t border-rule-strong pt-1">
          <Toggle
            id="payable-check"
            label="Check the balance is owed before taking money"
            description="A rule in the assistant's instructions. On by default. Turn it off to see what the feeds alone protect against."
            checked={checkOn}
            onChange={setCheckOn}
          />
        </div>
      </section>

      <section aria-labelledby="result-h">
        <h2 id="result-h" className="text-[20px] font-semibold">
          With this setting
        </h2>
        <div className="mt-3">
          <ReadinessSummary s={summary} staffWithAll={staffWithAll} />
        </div>
      </section>

      <section aria-labelledby="next-h">
        <h2 id="next-h" className="text-[20px] font-semibold">
          Connect next
        </h2>
        {next.length === 0 ? (
          <p className="mt-2 text-ink-2">Everything is connected.</p>
        ) : (
          <ol className="mt-2 divide-y divide-rule border-y border-rule" aria-live="polite">
            {next.map((s) => (
              <li key={s.feed} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                <p className="min-w-0 text-[14.5px]">
                  <span className="font-medium">{FEED_LABEL[s.feed]}</span>
                  <span className={s.ran ? "text-ink" : "text-ink-3"}>: {suggestionText(s)}</span>
                </p>
                <Button variant="quiet" type="button" onClick={() => setFeed(s.feed, true)} className="h-8 text-[13.5px]">
                  Connect
                </Button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="table-h">
        <h2 id="table-h" className="text-[20px] font-semibold">
          The twelve questions
        </h2>
        <p className="mt-1 text-[14px] text-ink-2">Worst first under the current setting.</p>
        <div className="mt-3">
          <CaseTable rows={rows} trialsPerCase={RESULTS.trials || 3} />
        </div>
      </section>

      <p className="prose-col text-[13.5px] text-ink-2">
        These are twelve questions chosen because they are hard, three runs each. They are not weighted by how often
        patients ask them, so read the table as a list of what breaks, not as a forecast of volume.{" "}
        <Link href="/evidence/method" className="text-accent underline underline-offset-2">
          How the runs work
        </Link>
      </p>
    </div>
  );
}
