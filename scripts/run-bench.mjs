#!/usr/bin/env node
// Runs every case against both agent versions and writes data/results.json.
//
//   node scripts/run-bench.mjs                    full run, 3 trials
//   node scripts/run-bench.mjs --trials 5
//   node scripts/run-bench.mjs --only qmb         rerun one case, merge into the file
//   node scripts/run-bench.mjs --version v2       rerun one version, merge into the file
//   node scripts/run-bench.mjs --view statement   same cases, agent shown only what is on the statement
//   node scripts/run-bench.mjs --view feeds       statement plus every partial set of feeds, per case

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "results.json");
const CONCURRENCY = 6;
const ATTEMPTS = 2; // per conversation, on top of the per-request retries in callClaude

loadEnvLocal();

const { CASES } = await import("../lib/cases.mjs");
const { AGENT_PROMPTS } = await import("../lib/prompts.mjs");
// The recorded bench ran on BENCH_MODEL (thinking off) for agent and judge, not on the live
// product model, so reruns use the same model to stay comparable with data/results.json.
const { runCase, BENCH_MODEL } = await import("../lib/run.mjs");
const { summarizeVersion } = await import("../lib/score.mjs");
const { partialFeedSets } = await import("../lib/feeds.mjs");

const args = parseArgs(process.argv.slice(2));
const versions = args.version ? [args.version] : ["v1", "v2"];
const cases = args.only ? CASES.filter((c) => c.id === args.only) : CASES;
if (args.only && cases.length === 0) die(`Unknown case "${args.only}". Known cases: ${CASES.map((c) => c.id).join(", ")}`);
const partial = Boolean(args.only || args.version);
const BUCKET = args.view === "statement" ? "statementRuns" : args.view === "feeds" ? "feedRuns" : "runs";

// Fresh results for a full run; merge into the existing file for a partial one.
let results = { generatedAt: null, model: BENCH_MODEL, trials: args.trials, runs: { v1: {}, v2: {} }, statementRuns: { v1: {}, v2: {} }, feedRuns: { v1: {}, v2: {} } };
if (fs.existsSync(OUT)) {
  // Each view is its own bucket in the file. A full run of one view replaces that bucket and keeps the other.
  const existing = JSON.parse(fs.readFileSync(OUT, "utf8"));
  // Every write keeps some of the existing runs (other cases, versions or views), so runs from two
  // models would end up in one file under one label. Refuse instead of relabelling.
  if (existing.model && existing.model !== BENCH_MODEL) {
    die(
      `${path.relative(ROOT, OUT)} holds runs on ${existing.model}; this script runs ${BENCH_MODEL}. ` +
        "Runs from different models are not merged. Move the file aside to start a fresh run.",
    );
  }
  const keep = (b) => (partial || b !== BUCKET ? { v1: { ...existing[b]?.v1 }, v2: { ...existing[b]?.v2 } } : { v1: {}, v2: {} });
  results = { ...existing, runs: keep("runs"), statementRuns: keep("statementRuns"), feedRuns: keep("feedRuns") };
  if (existing.trials && existing.trials !== args.trials) {
    console.warn(`Note: file has ${existing.trials} trials per case, this rerun uses ${args.trials}. Setting trials to ${args.trials}.`);
  }
  results.trials = args.trials;
}

const jobs = [];
// In the feeds view each case runs once per partial set of its feeds; otherwise once.
const setsFor = (kase) => (args.view === "feeds" ? partialFeedSets(kase).map((ids) => ids.join("+")) : [null]);
for (const v of versions)
  for (const kase of cases)
    for (const key of setsFor(kase))
      for (let t = 0; t < args.trials; t++) jobs.push({ v, kase, t, key, view: key ? `feeds:${key}` : args.view });

const collected = {}; // `${v}:${caseId}` -> Trial[] (indexed by trial)
const failures = [];
let done = 0;
const started = Date.now();

console.log(`Running ${jobs.length} conversations (${cases.length} cases x ${versions.join("+")} x ${args.trials} trials, ${args.view} record) on ${BENCH_MODEL}, ${CONCURRENCY} at a time.`);

await pool(jobs, CONCURRENCY, async ({ v, kase, t, key, view }) => {
  const slot = `${v}:${kase.id}:${key ?? ""}`;
  const name = key ? `${kase.id} [${key}]` : kase.id;
  let lastErr;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const trial = await runCase(kase, AGENT_PROMPTS[v], view, BENCH_MODEL);
      (collected[slot] ??= [])[t] = trial;
      done++;
      const acts = trial.transcript.filter((x) => x.role === "agent").map((x) => (x.actions?.length ? x.actions.join("+") : "none")).join(" | ");
      console.log(
        `[${String(done).padStart(3)}/${jobs.length}] ${v} ${name.padEnd(34)} #${t + 1} ${trial.verdict.outcome.padEnd(15)} ${trial.verdict.accurate ? "acc" : "INACC"}  ${acts}`
      );
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  done++;
  failures.push({ v, caseId: name, t, error: lastErr?.message });
  console.log(`[${String(done).padStart(3)}/${jobs.length}] ${v} ${name.padEnd(34)} #${t + 1} FAILED: ${lastErr?.message}`);
});

// Only replace a case/version in the file when all its trials succeeded.
for (const v of versions) {
  for (const kase of cases) {
    for (const key of setsFor(kase)) {
      const complete = (collected[`${v}:${kase.id}:${key ?? ""}`] ?? []).filter(Boolean);
      if (complete.length !== args.trials && partial) continue; // full run: keep what we have
      if (key) (results[BUCKET][v][kase.id] ??= {})[key] = complete;
      else results[BUCKET][v][kase.id] = complete;
    }
  }
}
results.generatedAt = new Date().toISOString();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(results, null, 2) + "\n");

console.log(`\nWrote ${path.relative(ROOT, OUT)} in ${Math.round((Date.now() - started) / 1000)}s.\n`);
for (const view of ["full", "statement"]) printSummary(results, view);
if (args.view === "feeds") printFeeds(results);

if (failures.length) {
  console.log(`\n${failures.length} conversation(s) failed after ${ATTEMPTS} attempts:`);
  for (const f of failures) console.log(`  ${f.v} ${f.caseId} #${f.t + 1}: ${f.error}`);
  console.log("Rerun them with --only <caseId> --version <v>.");
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------

function printSummary(res, view) {
  const runs = view === "statement" ? res.statementRuns : res.runs;
  if (!runs || !Object.keys(runs.v1 ?? {}).length) return;
  console.log(`\nAgent shown the ${view} record:`);
  const cols = ["trials", "resolved", "correct_handoff", "dead_end", "wrong_collect", "right", "accurate", "wrongCollectDollars"];
  const head = ["version", ...cols];
  const rows = ["v1", "v2"].map((v) => {
    const s = summarizeVersion(res, v, CASES, view);
    return [v, ...cols.map((c) => (c === "wrongCollectDollars" ? `$${s[c].toFixed(2)}` : String(s[c])))];
  });
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r) => r.map((cell, i) => cell.padStart(widths[i])).join("  ");
  console.log(line(head));
  for (const r of rows) console.log(line(r));

  console.log("\nPer case (one letter per trial: R resolved, H correct_handoff, D dead_end, W wrong_collect):");
  const letter = { resolved: "R", correct_handoff: "H", dead_end: "D", wrong_collect: "W" };
  for (const c of CASES) {
    const cell = (v) => (runs[v]?.[c.id] ?? []).map((t) => letter[t.verdict.outcome]).join("") || "-";
    console.log(`  ${c.id.padEnd(15)} best=${c.truth.best_outcome.padEnd(15)} v1 ${cell("v1").padEnd(5)} v2 ${cell("v2")}`);
  }
}

function printFeeds(res) {
  console.log("\nStatement plus some feeds (R resolved, H correct_handoff, D dead_end, W wrong_collect):");
  const letter = { resolved: "R", correct_handoff: "H", dead_end: "D", wrong_collect: "W" };
  for (const c of CASES) {
    for (const key of partialFeedSets(c).map((ids) => ids.join("+"))) {
      const cell = (v) => (res.feedRuns?.[v]?.[c.id]?.[key] ?? []).map((t) => letter[t.verdict.outcome]).join("") || "-";
      console.log(`  ${c.id.padEnd(15)} ${key.padEnd(24)} v1 ${cell("v1").padEnd(5)} v2 ${cell("v2")}`);
    }
  }
}

async function pool(items, size, worker) {
  let next = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function parseArgs(argv) {
  const out = { trials: 3, only: null, version: null, view: "full" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) die(`${a} needs a value.`);
      return v;
    };
    if (a === "--trials") {
      out.trials = Number(val());
      if (!Number.isInteger(out.trials) || out.trials < 1) die("--trials must be a positive whole number.");
    } else if (a === "--only") out.only = val();
    else if (a === "--version") {
      out.version = val();
      if (out.version !== "v1" && out.version !== "v2") die("--version must be v1 or v2.");
    } else if (a === "--view") {
      out.view = val();
      if (!["full", "statement", "feeds"].includes(out.view)) die("--view must be full, statement or feeds.");
    } else die(`Unknown argument "${a}". Use --trials N, --only caseId, --version v1|v2, --view full|statement|feeds.`);
  }
  return out;
}

// Reads KEY=value lines from .env.local into process.env without overriding
// anything already set. Values are never printed.
function loadEnvLocal() {
  if (process.env.ANTHROPIC_API_KEY) return;
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

function die(msg) {
  console.error(msg);
  process.exit(2);
}
