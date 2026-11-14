// Pure scoring. No I/O, so the same function runs in the runner, the API and the browser.

/**
 * @param {Array<{verdict: {outcome: string, accurate: boolean}, caseId: string}>} graded
 * @param {Array<{id: string, at_risk: number}>} cases
 * @param {number} passes how many times the full case set was run (for per-pass dollars)
 */
export function summarizeTrials(graded, cases, passes = 1) {
  const risk = Object.fromEntries(cases.map((c) => [c.id, c.at_risk]));
  const s = { trials: graded.length, resolved: 0, correct_handoff: 0, dead_end: 0, wrong_collect: 0, right: 0, accurate: 0, wrongCollectDollars: 0 };
  for (const g of graded) {
    s[g.verdict.outcome] += 1;
    if (g.verdict.accurate) s.accurate += 1;
    if (g.verdict.outcome === "wrong_collect") s.wrongCollectDollars += risk[g.caseId] ?? 0;
  }
  s.right = s.resolved + s.correct_handoff;
  s.wrongCollectDollars = Math.round((s.wrongCollectDollars / Math.max(passes, 1)) * 100) / 100;
  return s;
}

/** Summary for one version of data/results.json. */
export function summarizeVersion(results, version, cases, view = "full") {
  const runs = (view === "statement" ? results.statementRuns : results.runs)?.[version] ?? {};
  const graded = [];
  for (const [caseId, trials] of Object.entries(runs)) {
    for (const t of trials) graded.push({ caseId, verdict: t.verdict });
  }
  return summarizeTrials(graded, cases, results.trials || 1);
}
