#!/usr/bin/env node
// Runs the traffic set (28 weighted cases, simulated patients, product instructions with the
// payment gate) and writes data/traffic.json.
//
//   node scripts/run-traffic.mjs                     full run, 2 trials, at most 340 model calls
//   node scripts/run-traffic.mjs --trials 1
//   node scripts/run-traffic.mjs --only stop-texts   rerun one case, merge into the file
//   node scripts/run-traffic.mjs --only a,b,c --note "why"
//                                                    rerun several; the trials they replace are kept
//                                                    under `previous` (first replacement only)
//   node scripts/run-traffic.mjs --max-calls 100     stop starting conversations near this budget
//   node scripts/run-traffic.mjs --dry-run           print the plan, make no calls

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "traffic.json");
const CONCURRENCY = 4;
const MAX_PATIENT_TURNS = 3;
// Most model calls one conversation can make (see runTrafficCase): one per assistant turn, two per
// simulated patient reply (one retry when its JSON does not parse), two for the judge (one retry
// when the verdict does not parse). 3 + 2*2 + 2 = 9. HTTP retries inside callClaude come on top;
// the call cap counts those, so it still holds.
const WORST_CASE = MAX_PATIENT_TURNS + 2 * (MAX_PATIENT_TURNS - 1) + 2;
const RIGHT = new Set(["resolved", "correct_handoff"]);

loadEnvLocal();

const { TRAFFIC_CASES } = await import("../lib/traffic.mjs");
const { runTrafficCase } = await import("../lib/simulate.mjs");
const { MODEL } = await import("../lib/run.mjs");
const { callStats, setCallCap } = await import("../lib/anthropic.mjs");

const args = parseArgs(process.argv.slice(2));
const unknown = (args.only ?? []).filter((id) => !TRAFFIC_CASES.some((c) => c.id === id));
if (unknown.length) die(`Unknown case(s) ${unknown.map((u) => `"${u}"`).join(", ")}. Known cases: ${TRAFFIC_CASES.map((c) => c.id).join(", ")}`);
const cases = args.only ? TRAFFIC_CASES.filter((c) => args.only.includes(c.id)) : TRAFFIC_CASES;

// Trial 1 of every case, heaviest first, then trial 2, so an early stop loses the least.
const byWeight = [...cases].sort((a, b) => b.weight - a.weight);
const jobs = [];
for (let t = 0; t < args.trials; t++) for (const kase of byWeight) jobs.push({ kase, t });

if (args.dryRun) {
  console.log(`Plan: ${jobs.length} conversations (${cases.length} cases x ${args.trials} trials, full record) on ${MODEL}, ${CONCURRENCY} at a time.`);
  jobs.forEach(({ kase, t }, i) => console.log(`  ${String(i + 1).padStart(3)}  ${kase.id.padEnd(20)} #${t + 1}  weight ${kase.weight}`));
  console.log(`Worst case: ${jobs.length * WORST_CASE} model calls (${WORST_CASE} per conversation, counting parse retries, not HTTP retries). Cap: ${args.maxCalls}.`);
  console.log("Dry run: no calls made.");
  process.exit(0);
}

setCallCap(args.maxCalls);

const collected = {}; // caseId -> TrafficTrial[] indexed by trial
const failures = [];
const skipped = [];
const running = new Set(); // per-conversation counters still in flight
let finished = 0;
let budgetStop = false;
const started = Date.now();

// Calls already made plus the most the conversations in flight may still use.
const committed = () => callStats().calls + [...running].reduce((s, c) => s + Math.max(0, WORST_CASE - c.calls), 0);
const fits = () => committed() + WORST_CASE <= args.maxCalls;

console.log(`Running ${jobs.length} conversations (${cases.length} cases x ${args.trials} trials, full record) on ${MODEL}, ${CONCURRENCY} at a time, at most ${args.maxCalls} calls.`);

await pool(jobs, CONCURRENCY, async ({ kase, t }) => {
  const name = `${kase.id} #${t + 1}`;
  if (budgetStop || !fits()) {
    budgetStop = true;
    skipped.push(name);
    return;
  }
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1 && !fits()) break;
    const counter = { calls: 0 };
    running.add(counter);
    try {
      const out = await runTrafficCase(kase, { view: "full", maxPatientTurns: MAX_PATIENT_TURNS }, undefined, counter);
      (collected[kase.id] ??= [])[t] = { transcript: out.transcript, verdict: out.verdict, calls: out.calls };
      finished++;
      const turns = out.transcript.length;
      const removed = out.transcript.some((x) => x.gate?.removed?.length) ? "  gate removed" : "";
      console.log(
        `[${String(finished).padStart(2)}/${jobs.length}] ${name.padEnd(24)} ${out.verdict.outcome.padEnd(15)} ${turns} turns  ${out.calls} calls  total ${callStats().calls}${removed}`,
      );
      return;
    } catch (err) {
      lastErr = err;
      if (err?.code === "CALL_CAP") {
        // Hit the cap midway: discard, do not retry.
        budgetStop = true;
        skipped.push(`${name} (hit the call cap midway, discarded)`);
        console.log(`        ${name.padEnd(24)} discarded: call cap reached  total ${callStats().calls}`);
        return;
      }
    } finally {
      running.delete(counter);
    }
  }
  failures.push({ name, error: lastErr?.message ?? "not retried: budget" });
  console.log(`        ${name.padEnd(24)} FAILED: ${lastErr?.message}  total ${callStats().calls}`);
});

// A full run replaces the file; --only merges into it.
const fresh = { generatedAt: null, model: MODEL, view: "full", trialsPerCase: args.trials, maxPatientTurns: MAX_PATIENT_TURNS, calls: 0, runs: {} };
let file = fresh;
if (args.only && fs.existsSync(OUT)) {
  const existing = JSON.parse(fs.readFileSync(OUT, "utf8"));
  file = { ...fresh, ...existing, runs: { ...existing.runs } };
  if (existing.previous) file.previous = { ...existing.previous };
}
const replaced = [];
for (const kase of cases) {
  const trials = (collected[kase.id] ?? []).filter(Boolean);
  if (!trials.length) continue;
  // Keep the trials a rerun replaces, but only the first time, so later reruns never overwrite
  // the original run.
  if (args.only && file.runs[kase.id]?.length) {
    file.previous ??= {};
    file.previous[kase.id] ??= file.runs[kase.id];
  }
  file.runs[kase.id] = trials;
  replaced.push(kase.id);
}
if (args.only && replaced.length) {
  const before = file.rerun?.cases ?? [];
  file.rerun = {
    cases: [...before, ...replaced.filter((id) => !before.includes(id))],
    at: new Date().toISOString(),
    note: args.note ?? file.rerun?.note ?? "",
  };
}
if (!args.only) {
  // A full run starts over: nothing is a rerun any more.
  delete file.previous;
  delete file.rerun;
}
file.model = MODEL;
file.view = "full";
file.maxPatientTurns = MAX_PATIENT_TURNS;
if (!args.only) file.trialsPerCase = args.trials;
// The calls behind the data in the file: this run's, plus earlier ones when merging.
file.calls = (args.only ? file.calls || 0 : 0) + callStats().calls;
file.generatedAt = new Date().toISOString();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(file, null, 2) + "\n");

console.log(`\nWrote ${path.relative(ROOT, OUT)} in ${Math.round((Date.now() - started) / 1000)}s.`);
console.log(`Calls used this run: ${callStats().calls} of ${args.maxCalls}.`);
printSummary(file);

if (skipped.length) {
  console.log(`\nStopped early to stay within ${args.maxCalls} calls. Not run:`);
  for (const s of skipped) console.log(`  ${s}`);
  const incomplete = cases.filter((c) => (file.runs[c.id]?.length ?? 0) < args.trials).map((c) => c.id);
  console.log(`Cases with fewer than ${args.trials} trials: ${incomplete.join(", ") || "none"}.`);
}
if (failures.length) {
  console.log(`\n${failures.length} conversation(s) failed:`);
  for (const f of failures) console.log(`  ${f.name}: ${f.error}`);
  console.log("Rerun them with --only <caseId>.");
}
if (skipped.length || failures.length) process.exitCode = 1;

// ---------------------------------------------------------------------------

function printSummary(res) {
  const all = TRAFFIC_CASES.filter((c) => res.runs[c.id]?.length);
  const trials = all.flatMap((c) => res.runs[c.id]);
  if (!trials.length) {
    console.log("No conversations in the file.");
    return;
  }
  const right = trials.filter((t) => RIGHT.has(t.verdict.outcome)).length;
  let wsum = 0;
  let wscore = 0;
  for (const c of all) {
    const ts = res.runs[c.id];
    wsum += c.weight;
    wscore += c.weight * (ts.filter((t) => RIGHT.has(t.verdict.outcome)).length / ts.length);
  }
  const wrong = trials.filter((t) => t.verdict.outcome === "wrong_collect").length;
  const removedTurns = trials.flatMap((t) => t.transcript).filter((x) => x.role === "agent" && x.gate?.removed?.length).length;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;

  console.log(`\nOver ${trials.length} conversations in the file (${all.length} of ${TRAFFIC_CASES.length} cases):`);
  console.log(`  right outcome, unweighted: ${right}/${trials.length} = ${pct(right / trials.length)}`);
  console.log(`  right outcome, weighted:   ${pct(wscore / wsum)}`);
  if (all.length < TRAFFIC_CASES.length) {
    const missing = TRAFFIC_CASES.filter((c) => !res.runs[c.id]?.length);
    console.log(`    ${missing.length} case(s) with no trials left out and the weights renormalised over ${wsum.toFixed(1)}%: ${missing.map((c) => c.id).join(", ")}`);
  }
  console.log(`  wrong collects: ${wrong}`);
  console.log(`  assistant turns where the gate removed an action: ${removedTurns}`);

  const letter = { resolved: "R", correct_handoff: "H", dead_end: "D", wrong_collect: "W" };
  console.log("\nPer case (R resolved, H correct_handoff, D dead_end, W wrong_collect):");
  for (const c of [...TRAFFIC_CASES].sort((a, b) => b.weight - a.weight)) {
    const cell = (res.runs[c.id] ?? []).map((t) => letter[t.verdict.outcome]).join("") || "-";
    console.log(`  ${c.id.padEnd(20)} ${String(c.weight).padStart(4)}%  best=${c.truth.best_outcome.padEnd(15)} ${cell}`);
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
  const out = { trials: 2, only: null, note: null, maxCalls: 340, dryRun: false };
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
    } else if (a === "--only") {
      out.only = val()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!out.only.length) die("--only needs at least one case id.");
    } else if (a === "--note") out.note = val();
    else if (a === "--max-calls") {
      out.maxCalls = Number(val());
      if (!Number.isInteger(out.maxCalls) || out.maxCalls < 1) die("--max-calls must be a positive whole number.");
    } else if (a === "--dry-run") out.dryRun = true;
    else die(`Unknown argument "${a}". Use --trials N, --only caseId[,caseId...], --note text, --max-calls N, --dry-run.`);
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
