// The payment gate under the current feed setting: how many of the twelve accounts it decides
// as it would with the full record, how many it cannot verify, and how many it gets wrong.
// Computed from the record by the gate's own rules, so it does not depend on recorded runs.

import { FEEDS } from "@/lib/feeds.mjs";
import type { FeedId } from "@/lib/types";
import { money } from "@/components/ui";
import { Figure } from "./summary";
import type { GateResult, GateRow, GateSummary } from "./compute";

const FEED_NAME = Object.fromEntries(FEEDS.map((f) => [f.id, f.label.toLowerCase()])) as Record<FeedId, string>;
const ORDINAL = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth"];

function joinWith(parts: string[], word: string) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} ${word} ${parts[parts.length - 1]}`;
}

const feedPhrase = (ids: FeedId[]) => `the ${joinWith(ids.map((id) => FEED_NAME[id]), "or")} feed`;
const accounts = (n: number) => `${n} ${n === 1 ? "account" : "accounts"}`;

/** "Payable $612.40", "Part: $420.00", "Not payable", "Cannot verify": the traffic page's wording. */
export function gateLabel(g: GateResult): string {
  switch (g.status) {
    case "payable":
      return `Payable ${money(g.owed ?? 0)}`;
    case "partial":
      return `Part: ${money(g.owed ?? 0)}`;
    case "not_payable":
      return "Not payable";
    default:
      return "Cannot verify";
  }
}

export const GATE_TONE: Record<GateResult["status"], string> = {
  payable: "text-ok",
  partial: "text-stuck",
  not_payable: "text-wrong",
  unverified: "text-ink-2",
};

function decidingSentence(rows: GateRow[]): string {
  const keys = rows.map((r) => r.decidingFeeds.join("+"));
  if (rows.length === 1) return `The deciding fact is in ${feedPhrase(rows[0].decidingFeeds)}.`;
  if (keys.every((k) => k === keys[0])) return `In each case the deciding fact is in ${feedPhrase(rows[0].decidingFeeds)}.`;
  const parts = rows.map((r, i) => `${feedPhrase(r.decidingFeeds)} for the ${ORDINAL[i] ?? `${i + 1}th`}`);
  return `The deciding fact is in ${joinWith(parts, "and")}.`;
}

function stateText(g: GateSummary): string {
  const wrong = g.rows.filter((r) => r.standing === "wrong");
  if (wrong.length > 0) {
    const unowed = wrong.filter((r) => r.allowsUnowed);
    const under = wrong.filter((r) => !r.allowsUnowed);
    const out: string[] = [];
    if (unowed.length > 0) {
      out.push(
        `With these feeds the gate would allow payment on ${accounts(unowed.length)} that ${unowed.length === 1 ? "is" : "are"} not owed: ${unowed.map((r) => r.kase.title).join("; ")}.`,
      );
    }
    if (under.length > 0) {
      out.push(
        `${unowed.length > 0 ? "On" : "With these feeds, on"} ${accounts(under.length)} it would ask for less than is owed: ${under.map((r) => r.kase.title).join("; ")}.`,
      );
    }
    out.push(decidingSentence(wrong));
    return out.join(" ");
  }
  if (g.unverified > 0) return "Where the gate cannot verify, the assistant does not push for payment and staff confirm the amount first.";
  return `With these feeds the gate decides all ${g.rows.length} accounts as it would with the full record.`;
}

export function GateSummaryBlock({ g }: { g: GateSummary }) {
  return (
    <div aria-live="polite">
      <p className="text-[13.5px] text-ink-2">Accounts out of {g.rows.length}, worked out from the record.</p>
      <div className="mt-1 grid grid-cols-3 gap-x-4 border-y border-rule">
        <Figure value={g.correct} label="decides correctly" wrap />
        <Figure value={g.unverified} label="cannot verify" wrap />
        <Figure value={g.wrong} label="decides wrongly" tone={g.wrong > 0 ? "text-wrong" : ""} wrap />
      </div>
      <p className="mt-3 text-[14.5px]">{stateText(g)}</p>
      <p className="mt-3 text-[13px] text-ink-3">
        The &ldquo;Check the balance is owed&rdquo; box picks recorded runs with or without that rule in the
        assistant&apos;s instructions. The gate is the same rule written in code, added later, so the box does not
        change these figures.
      </p>
    </div>
  );
}
