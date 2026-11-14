// Right outcomes out of 36 for a handful of feed combinations, with and without the
// payable-as-stated check. Computed from data/results.json so it cannot drift from the runs.

import { CASES } from "@/lib/cases.mjs";
import { FEEDS, trialsForFeeds } from "@/lib/feeds.mjs";
import type { FeedId, Trial, Version } from "@/lib/types";
import { RESULTS } from "@/components/bench";

const ROWS: { label: string; feeds: FeedId[] }[] = [
  { label: "Statement balance only", feeds: [] },
  ...FEEDS.map((f) => ({ label: `Balance + ${f.label.toLowerCase()}`, feeds: [f.id] })),
  { label: "Balance + eligibility + account ledger", feeds: ["eligibility", "ledger"] },
  { label: "Everything", feeds: FEEDS.map((f) => f.id) },
];

const right = (t: Trial) => t.verdict.outcome === "resolved" || t.verdict.outcome === "correct_handoff";
const handedOff = (t: Trial) => t.transcript.some((x) => x.role === "agent" && x.actions?.includes("handoff_to_staff"));

export function tally(version: Version, feeds: FeedId[]) {
  const trials = CASES.flatMap((c) => trialsForFeeds(RESULTS, version, c, feeds));
  return {
    total: trials.length,
    right: trials.filter(right).length,
    wrong: trials.filter((t) => t.verdict.outcome === "wrong_collect").length,
    handoffs: trials.filter(handedOff).length,
  };
}

export function FeedTable() {
  const rows = ROWS.map((r) => ({ ...r, off: tally("v1", r.feeds), on: tally("v2", r.feeds) }));
  if (rows.some((r) => r.on.total === 0 || r.off.total === 0)) return null;
  const cell = (n: number, total: number) => (
    <span>
      {n} <span className="text-ink-3">/ {total}</span>
    </span>
  );
  return (
    <div className="table-scroll">
      <table className="ledger stack">
        <thead>
          <tr>
            <th scope="col">The assistant can read</th>
            <th scope="col" className="r">Right, check on</th>
            <th scope="col" className="r">Right, check off</th>
            <th scope="col" className="r">Wrong collects, check off</th>
            <th scope="col" className="r">Ends with staff, check on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="font-medium md:font-normal">{r.label}</td>
              <td className="num r" data-label="Right, check on">{cell(r.on.right, r.on.total)}</td>
              <td className="num r" data-label="Right, check off">{cell(r.off.right, r.off.total)}</td>
              <td className={"num r " + (r.off.wrong > 0 ? "font-medium text-wrong" : "")} data-label="Wrong collects, check off">
                <span>{r.off.wrong}</span>
              </td>
              <td className="num r" data-label="Ends with staff, check on">{cell(r.on.handoffs, r.on.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
