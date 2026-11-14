import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeTrials, summarizeVersion } from "./score.mjs";

const cases = [
  { id: "a", at_risk: 100 },
  { id: "b", at_risk: 0 },
  { id: "c", at_risk: 40.5 },
];
const v = (outcome, accurate = true) => ({ outcome, accurate, reason: "" });

test("summarizeTrials counts outcomes, right and accurate", () => {
  const s = summarizeTrials(
    [
      { caseId: "a", verdict: v("resolved") },
      { caseId: "a", verdict: v("correct_handoff", false) },
      { caseId: "b", verdict: v("dead_end") },
      { caseId: "c", verdict: v("wrong_collect", false) },
    ],
    cases
  );
  assert.deepEqual(s, {
    trials: 4,
    resolved: 1,
    correct_handoff: 1,
    dead_end: 1,
    wrong_collect: 1,
    right: 2,
    accurate: 2,
    wrongCollectDollars: 40.5,
  });
});

test("summarizeTrials averages wrong-collect dollars per pass", () => {
  const graded = [
    { caseId: "a", verdict: v("wrong_collect") },
    { caseId: "a", verdict: v("wrong_collect") },
    { caseId: "c", verdict: v("wrong_collect") },
  ];
  assert.equal(summarizeTrials(graded, cases, 3).wrongCollectDollars, 80.17); // 240.5 / 3, rounded
  assert.equal(summarizeTrials(graded, cases, 0).wrongCollectDollars, 240.5); // passes floored at 1
});

test("summarizeTrials ignores unknown case ids for dollars", () => {
  const s = summarizeTrials([{ caseId: "zzz", verdict: v("wrong_collect") }], cases);
  assert.equal(s.wrong_collect, 1);
  assert.equal(s.wrongCollectDollars, 0);
});

test("summarizeTrials on empty input", () => {
  const s = summarizeTrials([], cases);
  assert.equal(s.trials, 0);
  assert.equal(s.right, 0);
  assert.equal(s.wrongCollectDollars, 0);
});

test("summarizeVersion reads one version of a results file", () => {
  const trial = (outcome) => ({ transcript: [], verdict: v(outcome) });
  const results = {
    generatedAt: null,
    model: "m",
    trials: 2,
    runs: {
      v1: { a: [trial("wrong_collect"), trial("wrong_collect")], b: [trial("resolved"), trial("dead_end")] },
      v2: { a: [trial("correct_handoff"), trial("correct_handoff")] },
    },
  };
  const s1 = summarizeVersion(results, "v1", cases);
  assert.equal(s1.trials, 4);
  assert.equal(s1.wrong_collect, 2);
  assert.equal(s1.wrongCollectDollars, 100);
  assert.equal(s1.right, 1);
  const s2 = summarizeVersion(results, "v2", cases);
  assert.equal(s2.correct_handoff, 2);
  assert.equal(s2.wrongCollectDollars, 0);
});

test("summarizeVersion handles a missing version and the empty results file", () => {
  const empty = { generatedAt: null, model: "m", trials: 3, runs: { v1: {}, v2: {} } };
  assert.equal(summarizeVersion(empty, "v1", cases).trials, 0);
  assert.equal(summarizeVersion({ trials: 3 }, "v2", cases).trials, 0);
});
