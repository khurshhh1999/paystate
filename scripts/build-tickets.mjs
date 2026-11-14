#!/usr/bin/env node
// Writes data/tickets.json: the staff queue as it would look after the recorded conversations.
// One ticket per case whose recorded run (v2, full record, first trial) handed off to staff.
//
//   node scripts/build-tickets.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvLocal();

const { CASES } = await import("../lib/cases.mjs");
const { MODEL } = await import("../lib/run.mjs");
const { needsTicket, writeTicket } = await import("../lib/tickets.mjs");

const results = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "results.json"), "utf8"));

// Spread arrival times over one working day so the queue has an order. Fixed, so rebuilds are stable.
const DAY = "2026-11-12";
const ARRIVED = ["08:12", "08:47", "09:31", "10:05", "11:18", "12:40", "13:26", "14:02", "15:15", "16:33", "16:51", "17:20"];

const tickets = [];
let i = 0;
for (const kase of CASES) {
  const trial = results.runs?.v2?.[kase.id]?.[0];
  if (!trial || !needsTicket(trial.transcript)) continue;
  const body = await writeTicket(kase, trial.transcript, MODEL);
  tickets.push({
    id: `rec-${kase.id}`,
    ...body,
    createdAt: `${DAY}T${ARRIVED[i++ % ARRIVED.length]}:00-06:00`,
    transcript: trial.transcript,
    source: "recorded",
  });
  console.log(`${kase.id.padEnd(16)} ${body.kind.padEnd(22)} ${body.next_step}`);
}

const out = path.join(ROOT, "data", "tickets.json");
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, tickets }, null, 2) + "\n");
console.log(`\nWrote ${tickets.length} tickets to ${path.relative(ROOT, out)}.`);

function loadEnvLocal() {
  if (process.env.ANTHROPIC_API_KEY) return;
  const file = path.join(ROOT, ".env.local");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = raw.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m || raw.trim().startsWith("#")) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
