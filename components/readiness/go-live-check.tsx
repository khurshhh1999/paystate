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

// Three runs per question: a swing of one or two conversations is run-to-run noise.
// Any change in wrong collects is reported as is, since each one is money taken that is not owed.
const NOISE = 2;

function suggestionText(s: Suggestion): { text: string; clear: boolean } {
  if (!s.ran) return { text: "not run yet", clear: false };
  const parts: string[] = [];
  const smallRight = Math.abs(s.moreRight) <= NOISE;
  if (s.moreRight > NOISE) parts.push(`${plural(s.moreRight, "more conversation", "more conversations")} right`);
  if (s.moreRight < -NOISE) parts.push(`${plural(-s.moreRight, "fewer conversation", "fewer conversations")} right`);
  if (s.fewerWrong > 0) parts.push(plural(s.fewerWrong, "fewer wrong collect", "fewer wrong collects"));
  if (s.fewerWrong < 0) parts.push(plural(-s.fewerWrong, "more wrong collect", "more wrong collects"));
  if (parts.length > 0) {
    if (smallRight && s.moreRight !== 0) parts.push(`${s.moreRight > 0 ? "+" : "−"}${Math.abs(s.moreRight)} right, within noise`);
    return { text: parts.join(", "), clear: true };
  }
  if (s.moreRight === 0) return { text: "no change", clear: false };
  return { text: `no clear change (${s.moreRight > 0 ? "+" : "−"}${Math.abs(s.moreRight)} right, within noise)`, clear: false };
}

function Toggle({
  id,
  label,
  standard,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  standard?: string;
  description: string;
  checked: boolean;
  onChange?: (on: boolean) => void;
}) {
  return (
    <div className="flex gap-3 py-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-describedby={`${id}-desc`}
        className="mt-1 size-4 shrink-0 accent-accent"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="font-medium text-ink">
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

  const allConnected = connected.length === FEED_IDS.length;

  return (
    <div className="mt-8 flex flex-col gap-10">
      {/* Controls on the left, their result on the right on desktop, so a tick visibly changes something. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-12">
      <section aria-labelledby="feeds-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="feeds-h" className="text-[20px] font-semibold">
            Connected feeds
          </h2>
          <div className="flex gap-2">
            <Button
              variant="quiet"
              type="button"
              onClick={() => setConnected([])}
              disabled={connected.length === 0}
              className="h-8 text-[13.5px]"
            >
              Balance only
            </Button>
            <Button
              variant="quiet"
              type="button"
              onClick={() => setConnected([...FEED_IDS])}
              disabled={allConnected}
              className="h-8 text-[13.5px]"
            >
              Everything
            </Button>
          </div>
        </div>
        <div className="mt-2 divide-y divide-rule border-t border-rule">
          {/* Not a control: every practice sends the statement, so it is shown as a fixed row. */}
          <div className="flex items-baseline justify-between gap-4 py-3 pl-7">
            <div className="min-w-0">
              <p className="font-medium text-ink">Statement balance</p>
              <p className="text-[13.5px] text-ink-2">
                Every practice sends this: the service, the amounts billed and paid, and the payer&apos;s name.
              </p>
            </div>
            <span className="shrink-0 text-[13px] text-ink-3">Always on</span>
          </div>
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
        <div className="border-y border-rule-strong">
          <Toggle
            id="payable-check"
            label="Check the balance is owed before taking money"
            description="A rule in the assistant's instructions. On by default. Turn it off to see what the feeds alone protect against."
            checked={checkOn}
            onChange={setCheckOn}
          />
        </div>
      </section>

      <div className="flex flex-col gap-10">
        <section aria-labelledby="result-h">
          <h2 id="result-h" className="text-[20px] font-semibold">
            With this setting
          </h2>
          <div className="mt-3">
            <ReadinessSummary s={summary} staffWithAll={staffWithAll} allConnected={allConnected} />
          </div>
        </section>

        <section aria-labelledby="next-h">
          <h2 id="next-h" className="text-[20px] font-semibold">
            Connect next
          </h2>
          {next.length === 0 ? (
            <p className="mt-2 text-ink-2">Everything is connected.</p>
          ) : (
            <>
              <p className="mt-1 text-[13.5px] text-ink-2">
                What adding one feed changes across the {summary.trials} conversations. Each question ran three times,
                so a change of one or two conversations is noise.
              </p>
              <ol className="mt-2 divide-y divide-rule border-y border-rule" aria-live="polite">
                {next.map((s) => {
                  const { text, clear } = suggestionText(s);
                  return (
                    <li key={s.feed} className="flex items-baseline justify-between gap-4 py-2.5">
                      <p className="min-w-0 text-[14.5px]">
                        <span className="font-medium">{FEED_LABEL[s.feed]}</span>
                        <span className={clear ? "text-ink" : "text-ink-3"}>: {text}</span>
                      </p>
                      <button
                        type="button"
                        onClick={() => setFeed(s.feed, true)}
                        aria-label={`Connect ${FEED_LABEL[s.feed]}`}
                        className="shrink-0 text-[13.5px] text-accent underline-offset-2 hover:underline"
                      >
                        Connect
                      </button>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
      </div>
      </div>

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
        These twelve questions were chosen because they are hard, and each ran three times. They are not weighted by
        how often patients ask them, so the table shows what breaks. It does not forecast volume.{" "}
        <Link href="/evidence/method" className="text-accent underline underline-offset-2">
          How the runs work
        </Link>
      </p>
    </div>
  );
}
