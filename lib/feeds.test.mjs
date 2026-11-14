import { test } from "node:test";
import assert from "node:assert/strict";
import { CASES } from "./cases.mjs";
import { FEEDS, STATEMENT_KEYS, relevantFeeds, partialFeedSets, recordForFeeds, viewFor, feedKey, isView, feedsOfView, trialsForFeeds } from "./feeds.mjs";
import { recordForView } from "./prompts.mjs";

const byId = (id) => CASES.find((c) => c.id === id);

test("every record field belongs to the statement or to exactly one feed", () => {
  const owned = new Map();
  for (const k of STATEMENT_KEYS) owned.set(k, "statement");
  for (const f of FEEDS) for (const k of f.keys) {
    assert.ok(!owned.has(k), `${k} is claimed twice`);
    owned.set(k, f.id);
  }
  for (const c of CASES) for (const k of Object.keys(c.record)) assert.ok(owned.has(k), `${c.id}.${k} has no feed`);
});

test("all feeds connected gives back the whole record", () => {
  for (const c of CASES) assert.deepEqual(recordForFeeds(c, FEEDS.map((f) => f.id)), c.record);
});

test("no feeds connected matches the statement view", () => {
  const qmb = byId("qmb");
  const r = recordForView(qmb, "statement");
  assert.ok(!("remit" in r) && !("eligibility_check" in r));
  assert.equal(r.statement_balance, qmb.balance);
});

test("one feed adds only its own fields", () => {
  const qmb = byId("qmb");
  const r = recordForView(qmb, "feeds:eligibility");
  assert.ok("eligibility_check" in r);
  assert.ok(!("remit" in r));
});

test("line-item reason codes arrive with the remittance", () => {
  const p = byId("preventive");
  assert.ok(!("carc" in recordForFeeds(p, ["visit"]).services[1]));
  assert.ok("carc" in recordForFeeds(p, ["remittance"]).services[1]);
});

test("viewFor collapses to full and statement at the ends", () => {
  const tf = byId("timely-filing");
  assert.deepEqual(relevantFeeds(tf), ["remittance"]);
  assert.equal(viewFor(tf, ["remittance"]), "full");
  assert.equal(viewFor(tf, ["eligibility", "ledger"]), "statement");
  const qmb = byId("qmb");
  assert.equal(viewFor(qmb, ["eligibility", "visit"]), "feeds:eligibility");
  assert.equal(feedKey(qmb, ["visit", "eligibility"]), "eligibility");
});

test("partial sets exclude the empty and the complete set", () => {
  assert.equal(partialFeedSets(byId("timely-filing")).length, 0);
  assert.equal(partialFeedSets(byId("qmb")).length, 2);
  assert.equal(partialFeedSets(byId("surprise-bill")).length, 6);
});

test("isView accepts known feeds only", () => {
  assert.ok(isView("full") && isView("statement") && isView("feeds:remittance+ledger"));
  assert.ok(!isView("feeds:") && !isView("feeds:payroll") && !isView("feeds:ledger+ledger") && !isView(3));
  assert.deepEqual(feedsOfView("feeds:ledger+remittance"), ["ledger", "remittance"]);
});

test("trialsForFeeds picks the right bucket", () => {
  const qmb = byId("qmb");
  const res = { runs: { v2: { qmb: ["full"] } }, statementRuns: { v2: { qmb: ["stmt"] } }, feedRuns: { v2: { qmb: { eligibility: ["elig"] } } } };
  assert.deepEqual(trialsForFeeds(res, "v2", qmb, ["remittance", "eligibility"]), ["full"]);
  assert.deepEqual(trialsForFeeds(res, "v2", qmb, ["visit"]), ["stmt"]);
  assert.deepEqual(trialsForFeeds(res, "v2", qmb, ["eligibility"]), ["elig"]);
  assert.deepEqual(trialsForFeeds(res, "v2", qmb, ["remittance"]), []);
});
