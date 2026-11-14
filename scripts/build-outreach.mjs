// Builds data/outreach.json for the Statement gate page.
//
// 1. Generates a synthetic panel of open patient-balance accounts (seeded, deterministic)
//    into an in-memory SQLite database (node:sqlite).
// 2. Seeds each gate trigger, and a set of near misses the rules must not catch, at assumed
//    incidence rates. The rates are invented for illustration, not industry statistics.
// 3. Runs one SQL query per trigger and writes counts, dollars and sample rows.
//
// Usage: npm run outreach:build

import { DatabaseSync } from "node:sqlite";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "outreach.json");

const SEED = 20261114;
const PANEL_SIZE = 5000;
const AS_OF = "2026-11-14";
const PRACTICES = 12;

// ---------------------------------------------------------------------------
// Assumptions. Every number here is an assumption chosen to look modest and
// defensible. None is a measured industry rate.
// ---------------------------------------------------------------------------

const TRIGGER_RATES = {
  t1: 0.012, // CO-group denial carried into the patient balance
  t2: 0.015, // PR-27 coverage terminated, no eligibility re-check since
  t3: 0.008, // QMB dual-eligible billed Medicare cost-sharing
  t4: 0.006, // No Surprises Act protected service billed above in-network cost share
  t5: 0.025, // unapplied payment on the account
  t6: 0.007, // intake says work or accident related, health plan billed
  t7: 0.003, // patient deceased or family reported a death
};
// Share of trigger-6 accounts where the health plan denied CO-19 and the denial was moved to
// the patient. Those accounts trip rule 1 as well; the overlap is deliberate.
const T6_CO19_SHARE = 0.4;

const NEAR_MISS_RATES = {
  n1: { rate: 0.01, label: "CO denial correctly written off, not in the patient balance", rule: "t1" },
  n2: { rate: 0.004, label: "PR-27 denial with an eligibility re-check after it that found no other coverage", rule: "t2" },
  n3: { rate: 0.008, label: "Medicare patient with a Medicaid savings category that is not QMB (SLMB, QI)", rule: "t3" },
  n4a: { rate: 0.004, label: "Out-of-network provider at an out-of-network facility, not an emergency", rule: "t4" },
  n4b: { rate: 0.002, label: "Out-of-network surgeon (not ancillary) at an in-network facility with signed notice and consent", rule: "t4" },
  n4c: { rate: 0.003, label: "Out-of-network ancillary provider already billed at the in-network cost share", rule: "t4" },
  n5: { rate: 0.003, label: "Unapplied payment that has already been refunded", rule: "t5" },
  n6: { rate: 0.004, label: "Accident-related visit billed to the auto (PIP) carrier, patient owes the PIP deductible", rule: "t6" },
};

const BALANCE_MEDIAN = 240;
const BALANCE_SIGMA = 0.9;

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) and helpers
// ---------------------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const uniform = (lo, hi) => lo + (hi - lo) * rand();
const int = (lo, hi) => Math.floor(uniform(lo, hi + 1));
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
function weighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let u = rand() * total;
  for (const [v, w] of pairs) {
    if ((u -= w) < 0) return v;
  }
  return pairs[pairs.length - 1][0];
}
function normal() {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const cents = (n) => Math.round(n * 100) / 100;
function lognormal(median, sigma, lo, hi) {
  return cents(Math.min(hi, Math.max(lo, median * Math.exp(sigma * normal()))));
}
function addDays(iso, days) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.round(days));
  return d.toISOString().slice(0, 10);
}
function minDate(a, b) {
  return a < b ? a : b;
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DDL = `-- One row per open patient balance (one encounter per account in this panel).
CREATE TABLE accounts (
  account_id            TEXT PRIMARY KEY,
  patient_id            TEXT NOT NULL,
  practice_id           TEXT NOT NULL,
  dos                   TEXT NOT NULL,   -- date of service
  adjudicated_at        TEXT NOT NULL,   -- primary payer remit posted
  primary_payer         TEXT NOT NULL,
  primary_payer_type    TEXT NOT NULL,   -- commercial | marketplace | medicare | medicaid | auto_pip
  statement_balance     REAL NOT NULL,   -- what the next statement would ask for
  guarantor_status      TEXT NOT NULL,   -- self | parent | deceased
  guarantor_status_at   TEXT,
  preferred_channel     TEXT NOT NULL,   -- sms | email | voice | mail
  sms_consent           INTEGER NOT NULL,-- 1 = documented consent to billing texts
  has_email             INTEGER NOT NULL,
  preferred_language    TEXT NOT NULL,   -- en | es | vi | zh
  next_statement_date   TEXT NOT NULL
);

-- 835 remittance adjustment lines (CARC with group code).
CREATE TABLE remit_lines (
  account_id  TEXT NOT NULL REFERENCES accounts(account_id),
  line_no     INTEGER NOT NULL,
  posted_at   TEXT NOT NULL,
  group_code  TEXT NOT NULL,   -- CO | PR | OA
  carc        TEXT NOT NULL,   -- e.g. 45, 1, 2, 3, 27, 29
  amount      REAL NOT NULL
);

-- 270/271 eligibility responses and coverage discovery results.
CREATE TABLE eligibility_checks (
  account_id             TEXT NOT NULL REFERENCES accounts(account_id),
  checked_at             TEXT NOT NULL,
  payer                  TEXT NOT NULL,
  status                 TEXT NOT NULL,   -- active | terminated | no_coverage_found
  effective_date         TEXT,
  term_date              TEXT,
  medicaid_aid_category  TEXT             -- QMB | QMB+ | SLMB | QI | NULL
);

CREATE TABLE ledger_payments (
  account_id   TEXT NOT NULL REFERENCES accounts(account_id),
  payment_id   TEXT NOT NULL,
  posted_at    TEXT NOT NULL,
  source       TEXT NOT NULL,     -- front_desk | portal | mailed_check
  amount       REAL NOT NULL,
  applied      INTEGER NOT NULL,  -- 1 = applied to a charge
  refunded_at  TEXT
);

-- Answers from the registration / intake form.
CREATE TABLE intake_flags (
  account_id        TEXT NOT NULL REFERENCES accounts(account_id),
  work_related      INTEGER NOT NULL,
  accident_related  INTEGER NOT NULL
);

CREATE TABLE encounters (
  account_id               TEXT NOT NULL REFERENCES accounts(account_id),
  service_line             TEXT NOT NULL,
  emergency                INTEGER NOT NULL,
  facility_network_status  TEXT NOT NULL,   -- in | out
  provider_network_status  TEXT NOT NULL,   -- in | out
  notice_consent_signed    INTEGER NOT NULL,
  in_network_cost_share    REAL NOT NULL    -- patient share at the in-network level, from the EOB
);

-- Inbound and outbound contacts other than statements.
CREATE TABLE contact_events (
  account_id   TEXT NOT NULL REFERENCES accounts(account_id),
  received_at  TEXT NOT NULL,
  direction    TEXT NOT NULL,   -- inbound | outbound
  channel      TEXT NOT NULL,
  topic        TEXT NOT NULL    -- billing_question | death_reported | address_change
);

-- Statements and reminders already sent.
CREATE TABLE outreach_log (
  account_id  TEXT NOT NULL REFERENCES accounts(account_id),
  sent_at     TEXT NOT NULL,
  channel     TEXT NOT NULL,   -- mail | sms | email
  template    TEXT NOT NULL    -- statement | reminder
);

-- First-contact channel. Texts only go to patients with documented consent.
CREATE VIEW contact_route AS
SELECT
  account_id,
  CASE
    WHEN preferred_channel = 'sms' AND sms_consent = 1 THEN 'sms'
    WHEN preferred_channel IN ('sms', 'email') AND has_email = 1 THEN 'email'
    WHEN preferred_channel = 'voice' THEN 'voice'
    ELSE 'mail'
  END AS first_contact_channel
FROM accounts;`;

// ---------------------------------------------------------------------------
// Trigger queries
// ---------------------------------------------------------------------------

const ANCILLARY = "'anesthesia', 'radiology', 'pathology', 'laboratory', 'emergency medicine', 'assistant surgeon', 'neonatology', 'hospitalist'";

const TRIGGERS = [
  {
    id: "t1",
    name: "Provider-liability denial in the patient balance",
    rule: "A remit line with group code CO (other than the routine CO-45 and CO-253 adjustments) and a statement balance larger than what the PR lines leave the patient owing.",
    sql: `WITH pr AS (
  SELECT account_id, SUM(amount) AS pr_total
  FROM remit_lines
  WHERE group_code = 'PR'
  GROUP BY account_id
),
co_denials AS (
  -- CO-45 (fee schedule) and CO-253 (sequestration) are routine write-offs.
  SELECT account_id,
         GROUP_CONCAT('CO-' || carc, ', ') AS co_codes,
         SUM(amount) AS co_denied
  FROM remit_lines
  WHERE group_code = 'CO' AND carc NOT IN ('45', '253')
  GROUP BY account_id
),
applied AS (
  SELECT account_id, SUM(amount) AS applied_paid
  FROM ledger_payments
  WHERE applied = 1
  GROUP BY account_id
),
gap AS (
  SELECT a.account_id,
         a.statement_balance
           - (COALESCE(pr.pr_total, 0) - COALESCE(applied.applied_paid, 0)) AS over_pr
  FROM accounts a
  LEFT JOIN pr USING (account_id)
  LEFT JOIN applied USING (account_id)
)
SELECT a.account_id,
       a.practice_id,
       a.primary_payer,
       d.co_codes,
       a.statement_balance,
       ROUND(MIN(d.co_denied, g.over_pr), 2) AS amount_in_question
FROM accounts a
JOIN co_denials d USING (account_id)
JOIN gap g USING (account_id)
WHERE g.over_pr > 0.005
ORDER BY a.account_id;`,
  },
  {
    id: "t2",
    name: "Coverage terminated, no re-check since",
    rule: "A PR-27 denial (expenses incurred after coverage terminated) and no eligibility check or coverage discovery run after the denial posted.",
    sql: `WITH pr27 AS (
  SELECT account_id,
         MAX(posted_at) AS denied_at,
         SUM(amount)    AS pr27_amount
  FROM remit_lines
  WHERE group_code = 'PR' AND carc = '27'
  GROUP BY account_id
),
last_check AS (
  SELECT account_id, MAX(checked_at) AS last_checked_at
  FROM eligibility_checks
  GROUP BY account_id
)
SELECT a.account_id,
       a.practice_id,
       a.dos,
       p.denied_at,
       lc.last_checked_at,
       r.first_contact_channel,
       a.statement_balance,
       ROUND(MIN(p.pr27_amount, a.statement_balance), 2) AS amount_in_question
FROM accounts a
JOIN pr27 p USING (account_id)
JOIN contact_route r USING (account_id)
LEFT JOIN last_check lc USING (account_id)
WHERE lc.last_checked_at IS NULL
   OR lc.last_checked_at < p.denied_at
ORDER BY a.account_id;`,
  },
  {
    id: "t3",
    name: "QMB patient billed Medicare cost-sharing",
    rule: "Medicare is primary, the balance is Medicare deductible, coinsurance or copay (PR-1, PR-2, PR-3), and an eligibility response shows Medicaid QMB or QMB+ active on the date of service.",
    sql: `WITH qmb AS (
  SELECT DISTINCT e.account_id, e.medicaid_aid_category
  FROM eligibility_checks e
  JOIN accounts a USING (account_id)
  WHERE e.medicaid_aid_category IN ('QMB', 'QMB+')
    AND e.status = 'active'
    AND e.effective_date <= a.dos
    AND (e.term_date IS NULL OR e.term_date >= a.dos)
),
cost_share AS (
  SELECT account_id,
         GROUP_CONCAT('PR-' || carc, ', ') AS pr_codes,
         SUM(amount) AS medicare_cost_share
  FROM remit_lines
  WHERE group_code = 'PR' AND carc IN ('1', '2', '3')
  GROUP BY account_id
)
SELECT a.account_id,
       a.practice_id,
       q.medicaid_aid_category,
       c.pr_codes,
       r.first_contact_channel,
       a.statement_balance,
       ROUND(MIN(c.medicare_cost_share, a.statement_balance), 2) AS amount_in_question
FROM accounts a
JOIN qmb q USING (account_id)
JOIN cost_share c USING (account_id)
JOIN contact_route r USING (account_id)
WHERE a.primary_payer_type = 'medicare'
ORDER BY a.account_id;`,
  },
  {
    id: "t4",
    name: "Surprise-billing protection, billed above in-network share",
    rule: "Commercial or marketplace plan, out-of-network clinician, and either an emergency or an in-network facility where the service is ancillary or no notice-and-consent was signed. The statement is above the in-network cost share on the EOB.",
    sql: `SELECT a.account_id,
       a.practice_id,
       e.service_line,
       e.facility_network_status AS facility,
       e.emergency,
       e.in_network_cost_share,
       a.statement_balance,
       ROUND(a.statement_balance - e.in_network_cost_share, 2) AS amount_in_question
FROM accounts a
JOIN encounters e USING (account_id)
WHERE a.primary_payer_type IN ('commercial', 'marketplace')
  AND e.provider_network_status = 'out'
  AND (
        e.emergency = 1
     OR (e.facility_network_status = 'in'
         AND (e.service_line IN (${ANCILLARY})
              OR e.notice_consent_signed = 0))
      )
  AND a.statement_balance > e.in_network_cost_share + 0.005
ORDER BY a.account_id;`,
  },
  {
    id: "t5",
    name: "Payment received but not applied",
    rule: "The ledger holds a payment that was never applied to a charge and has not been refunded.",
    sql: `WITH unapplied AS (
  SELECT account_id,
         SUM(amount)    AS unapplied_total,
         MIN(posted_at) AS first_posted_at,
         GROUP_CONCAT(source, ', ') AS sources
  FROM ledger_payments
  WHERE applied = 0 AND refunded_at IS NULL
  GROUP BY account_id
)
SELECT a.account_id,
       a.practice_id,
       u.first_posted_at,
       u.sources,
       u.unapplied_total,
       a.statement_balance,
       CASE WHEN u.unapplied_total >= a.statement_balance - 0.005
            THEN 'full' ELSE 'partial' END AS covers,
       ROUND(MIN(u.unapplied_total, a.statement_balance), 2) AS amount_in_question
FROM accounts a
JOIN unapplied u USING (account_id)
ORDER BY a.account_id;`,
  },
  {
    id: "t6",
    name: "Work or accident injury billed to the health plan",
    rule: "The intake form says the visit was work-related or accident-related, but the claim went to the patient's health plan instead of workers' compensation or an auto carrier.",
    sql: `SELECT a.account_id,
       a.practice_id,
       CASE WHEN i.work_related = 1 THEN 'work' ELSE 'accident' END AS intake_says,
       a.primary_payer,
       r.first_contact_channel,
       a.statement_balance,
       a.statement_balance AS amount_in_question
FROM accounts a
JOIN intake_flags i USING (account_id)
JOIN contact_route r USING (account_id)
WHERE (i.work_related = 1 OR i.accident_related = 1)
  AND a.primary_payer_type IN ('commercial', 'marketplace', 'medicare', 'medicaid')
ORDER BY a.account_id;`,
  },
  {
    id: "t7",
    name: "Patient has died",
    rule: "The guarantor is marked deceased, or someone has told the practice the patient died. Every reminder stops.",
    sql: `WITH death_signal AS (
  SELECT account_id, 'marked deceased' AS signal, guarantor_status_at AS reported_at
  FROM accounts
  WHERE guarantor_status = 'deceased'
  UNION ALL
  SELECT account_id, 'family reported', received_at
  FROM contact_events
  WHERE topic = 'death_reported'
),
first_signal AS (
  SELECT account_id,
         MIN(reported_at) AS reported_at,
         GROUP_CONCAT(DISTINCT signal) AS signals
  FROM death_signal
  GROUP BY account_id
)
SELECT a.account_id,
       a.practice_id,
       f.signals,
       f.reported_at,
       (SELECT COUNT(*)
          FROM outreach_log o
         WHERE o.account_id = a.account_id
           AND o.sent_at > f.reported_at) AS reminders_since,
       a.statement_balance,
       a.statement_balance AS amount_in_question
FROM accounts a
JOIN first_signal f USING (account_id)
ORDER BY a.account_id;`,
  },
];

// ---------------------------------------------------------------------------
// Generate the panel
// ---------------------------------------------------------------------------

const db = new DatabaseSync(":memory:");
db.exec(DDL);

const ins = {
  account: db.prepare(`INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  remit: db.prepare(`INSERT INTO remit_lines VALUES (?,?,?,?,?,?)`),
  elig: db.prepare(`INSERT INTO eligibility_checks VALUES (?,?,?,?,?,?,?)`),
  pay: db.prepare(`INSERT INTO ledger_payments VALUES (?,?,?,?,?,?,?)`),
  intake: db.prepare(`INSERT INTO intake_flags VALUES (?,?,?)`),
  enc: db.prepare(`INSERT INTO encounters VALUES (?,?,?,?,?,?,?)`),
  contact: db.prepare(`INSERT INTO contact_events VALUES (?,?,?,?,?)`),
  log: db.prepare(`INSERT INTO outreach_log VALUES (?,?,?,?)`),
};

const PAYERS = {
  commercial: ["Commercial PPO A", "Commercial PPO B", "Commercial HMO C", "Commercial HDHP D"],
  marketplace: ["Marketplace Silver E", "Marketplace Bronze F"],
  medicare: ["Medicare Part B"],
  medicaid: ["State Medicaid"],
};
const SERVICE_LINES = ["primary care", "orthopedics", "cardiology", "dermatology", "imaging", "laboratory", "urgent care", "physical therapy"];

// One draw per account picks at most one seeded condition, so conditions do not collide.
const CONDITIONS = [...Object.entries(TRIGGER_RATES), ...Object.entries(NEAR_MISS_RATES).map(([k, v]) => [k, v.rate])];

const seeded = Object.fromEntries(Object.keys(TRIGGER_RATES).map((k) => [k, new Set()]));
const nearMissSeeded = Object.fromEntries(Object.keys(NEAR_MISS_RATES).map((k) => [k, 0]));

db.exec("BEGIN");
for (let i = 0; i < PANEL_SIZE; i++) {
  const id = "A" + String(100001 + i);
  const patientId = "P" + String(500001 + Math.floor(i * 0.97));
  const practiceId = "PR" + String(1 + Math.floor(rand() * PRACTICES)).padStart(2, "0");

  let u = rand();
  let condition = null;
  for (const [k, r] of CONDITIONS) {
    if ((u -= r) < 0) {
      condition = k;
      break;
    }
  }

  const dos = addDays("2026-03-02", int(0, 222));
  const adjudicatedAt = addDays(dos, int(18, 45));
  let payerType = weighted([["commercial", 0.62], ["marketplace", 0.12], ["medicare", 0.24], ["medicaid", 0.02]]);
  if (condition === "t3" || condition === "n3") payerType = "medicare";
  if (condition === "t4" || condition?.startsWith("n4")) payerType = weighted([["commercial", 0.85], ["marketplace", 0.15]]);
  if (condition === "t6" && payerType === "medicaid") payerType = "commercial";
  if (condition === "n6") payerType = "auto_pip";
  let payer = payerType === "auto_pip" ? "Auto carrier (PIP)" : pick(PAYERS[payerType]);

  const preferredChannel = weighted([["sms", 0.55], ["email", 0.3], ["voice", 0.08], ["mail", 0.07]]);
  const smsConsent = preferredChannel === "sms" ? (rand() < 0.85 ? 1 : 0) : rand() < 0.2 ? 1 : 0;
  const hasEmail = preferredChannel === "email" ? 1 : rand() < 0.7 ? 1 : 0;
  const language = weighted([["en", 0.87], ["es", 0.1], ["vi", 0.015], ["zh", 0.015]]);
  let guarantorStatus = rand() < 0.12 ? "parent" : "self";
  let guarantorStatusAt = null;

  let serviceLine = pick(SERVICE_LINES);
  let emergency = rand() < 0.05 ? 1 : 0;
  let facilityNet = "in";
  let providerNet = "in";
  let consentSigned = 0;

  // Baseline: routine remit with a patient-responsibility balance.
  const remits = [];
  const payments = [];
  const eligibility = [];
  let workRelated = 0;
  let accidentRelated = 0;
  const contacts = [];

  let prTotal = lognormal(BALANCE_MEDIAN, BALANCE_SIGMA, 12, 9000);
  if (payerType === "medicare") {
    // Part B pays 80% of allowed after the deductible; patient owes 20% coinsurance.
    const allowed = prTotal * 5;
    remits.push(["CO", "45", cents(allowed * uniform(0.4, 1.2))]);
    remits.push(["CO", "253", cents(allowed * 0.8 * 0.02)]);
    if (rand() < 0.15) {
      const ded = cents(prTotal * uniform(0.3, 0.7));
      remits.push(["PR", "1", ded]);
      remits.push(["PR", "2", cents(prTotal - ded)]);
    } else {
      remits.push(["PR", "2", prTotal]);
    }
  } else if (payerType === "auto_pip") {
    remits.push(["PR", "1", prTotal]);
  } else {
    remits.push(["CO", "45", cents(prTotal * uniform(0.5, 2.5))]);
    if (prTotal <= 75 && rand() < 0.6) {
      remits.push(["PR", "3", prTotal]);
    } else if (rand() < 0.55) {
      remits.push(["PR", "1", prTotal]);
    } else {
      const ded = cents(prTotal * uniform(0.2, 0.8));
      remits.push(["PR", "1", ded]);
      remits.push(["PR", "2", cents(prTotal - ded)]);
    }
  }
  let inNetworkCostShare = prTotal;

  // Some accounts already had part of the balance paid and applied (copay at the desk, portal).
  let appliedPaid = 0;
  if (rand() < 0.2 && prTotal > 30) {
    appliedPaid = cents(prTotal * uniform(0.1, 0.5));
    payments.push([addDays(dos, int(0, 40)), pick(["front_desk", "portal"]), appliedPaid, 1, null]);
  }
  let statementBalance = cents(prTotal - appliedPaid);

  // Routine eligibility check before the visit.
  eligibility.push([addDays(dos, -int(0, 10)), payer, "active", addDays(dos, -int(60, 400)), null, null]);

  switch (condition) {
    case "t1": {
      const carc = weighted([["29", 0.45], ["197", 0.25], ["16", 0.15], ["50", 0.15]]);
      const amt = lognormal(260, 0.7, 60, 3000);
      remits.push(["CO", carc, amt]);
      statementBalance = cents(statementBalance + amt);
      break;
    }
    case "n1": {
      const carc = weighted([["29", 0.4], ["197", 0.4], ["16", 0.2]]);
      remits.push(["CO", carc, lognormal(260, 0.7, 60, 3000)]); // written off, balance unchanged
      break;
    }
    case "t2":
    case "n2": {
      // Claim went to a terminated plan. No payment, full charge denied PR-27.
      remits.length = 0;
      payments.length = 0;
      const amt = lognormal(380, 0.75, 90, 6000);
      remits.push(["PR", "27", amt]);
      statementBalance = amt;
      eligibility.length = 0;
      const termDate = addDays(dos, -int(10, 120));
      // A stale check from before the plan ended.
      eligibility.push([addDays(termDate, -int(20, 150)), payer, "active", addDays(termDate, -int(200, 700)), null, null]);
      if (condition === "n2") {
        eligibility.push([addDays(adjudicatedAt, int(2, 20)), payer, "terminated", null, termDate, null]);
        eligibility.push([addDays(adjudicatedAt, int(2, 20)), "Coverage discovery", "no_coverage_found", null, null, null]);
      }
      break;
    }
    case "t3": {
      eligibility.push([addDays(dos, -int(0, 10)), "State Medicaid", "active", addDays(dos, -int(90, 900)), null, rand() < 0.6 ? "QMB" : "QMB+"]);
      break;
    }
    case "n3": {
      eligibility.push([addDays(dos, -int(0, 10)), "State Medicaid", "active", addDays(dos, -int(90, 900)), null, rand() < 0.7 ? "SLMB" : "QI"]);
      break;
    }
    case "t4":
    case "n4a":
    case "n4b":
    case "n4c": {
      providerNet = "out";
      const share = lognormal(320, 0.6, 50, 2500);
      remits.length = 0;
      payments.length = 0;
      remits.push(["PR", "2", share]);
      inNetworkCostShare = share;
      const balanceBill = lognormal(1400, 0.7, 200, 9000);
      statementBalance = cents(share + balanceBill);
      if (condition === "t4") {
        if (rand() < 0.3) {
          emergency = 1;
          serviceLine = "emergency medicine";
          facilityNet = rand() < 0.5 ? "in" : "out";
        } else {
          emergency = 0;
          serviceLine = weighted([["anesthesia", 0.45], ["radiology", 0.2], ["pathology", 0.15], ["assistant surgeon", 0.1], ["general surgery", 0.1]]);
          facilityNet = "in";
          consentSigned = 0;
        }
      } else if (condition === "n4a") {
        emergency = 0;
        facilityNet = "out";
        serviceLine = pick(["orthopedics", "general surgery", "imaging"]);
      } else if (condition === "n4b") {
        emergency = 0;
        facilityNet = "in";
        serviceLine = pick(["orthopedics", "general surgery"]);
        consentSigned = 1;
      } else {
        emergency = 0;
        facilityNet = "in";
        serviceLine = pick(["anesthesia", "radiology", "pathology"]);
        statementBalance = share;
      }
      break;
    }
    case "t5": {
      const full = rand() < 0.6;
      const amt = full ? statementBalance : cents(statementBalance * uniform(0.2, 0.8));
      payments.push([addDays(dos, int(0, 50)), weighted([["front_desk", 0.6], ["portal", 0.25], ["mailed_check", 0.15]]), amt, 0, null]);
      break;
    }
    case "n5": {
      const amt = cents(statementBalance * uniform(0.3, 1));
      const posted = addDays(dos, int(0, 30));
      payments.push([posted, "portal", amt, 0, addDays(posted, int(10, 40))]);
      break;
    }
    case "t6": {
      if (rand() < 0.65) workRelated = 1;
      else accidentRelated = 1;
      if (workRelated && rand() < T6_CO19_SHARE / 0.65) {
        // Plan denied it as work-related and the billing system moved it to the patient.
        remits.length = 0;
        payments.length = 0;
        const amt = lognormal(520, 0.6, 120, 4000);
        remits.push(["CO", "19", amt]);
        statementBalance = amt;
        seeded.t1.add(id);
      }
      break;
    }
    case "n6": {
      accidentRelated = 1;
      break;
    }
    case "t7": {
      const reportedAt = addDays(adjudicatedAt, int(5, 40));
      if (rand() < 0.5) {
        guarantorStatus = "deceased";
        guarantorStatusAt = minDate(reportedAt, addDays(AS_OF, -3));
      } else {
        contacts.push([minDate(reportedAt, addDays(AS_OF, -3)), "inbound", pick(["sms", "voice", "email"]), "death_reported"]);
      }
      break;
    }
  }

  if (condition in seeded) seeded[condition].add(id);
  if (condition in nearMissSeeded) nearMissSeeded[condition] += 1;

  // Statements every 30 days after adjudication, up to four, plus a text reminder a week later.
  let next = addDays(adjudicatedAt, 7);
  let sent = 0;
  const logRows = [];
  while (next < AS_OF && sent < 4) {
    logRows.push([next, "mail", "statement"]);
    if (preferredChannel === "sms" && smsConsent) {
      const r = addDays(next, 7);
      if (r < AS_OF) logRows.push([r, "sms", "reminder"]);
    } else if (hasEmail) {
      const r = addDays(next, 7);
      if (r < AS_OF) logRows.push([r, "email", "reminder"]);
    }
    sent += 1;
    next = addDays(next, 30);
  }
  const nextStatement = next < AS_OF ? addDays(AS_OF, int(1, 30)) : next;

  if (rand() < 0.04) contacts.push([addDays(adjudicatedAt, int(5, 30)), "inbound", "voice", "billing_question"]);

  ins.account.run(
    id, patientId, practiceId, dos, adjudicatedAt, payer, payerType, statementBalance,
    guarantorStatus, guarantorStatusAt, preferredChannel, smsConsent, hasEmail, language, nextStatement
  );
  remits.forEach(([g, c, amt], n) => ins.remit.run(id, n + 1, adjudicatedAt, g, c, amt));
  eligibility.forEach((e) => ins.elig.run(id, ...e));
  payments.forEach((p, n) => ins.pay.run(id, `${id}-PMT${n + 1}`, ...p));
  ins.intake.run(id, workRelated, accidentRelated);
  ins.enc.run(id, serviceLine, emergency, facilityNet, providerNet, consentSigned, inNetworkCostShare);
  contacts.forEach((c) => ins.contact.run(id, ...c));
  logRows.forEach((l) => ins.log.run(id, ...l));
}
db.exec("COMMIT");

// ---------------------------------------------------------------------------
// Run the queries
// ---------------------------------------------------------------------------

const plain = (row) => Object.fromEntries(Object.entries(row));
const round2 = (n) => Math.round(n * 100) / 100;

const totals = plain(
  db.prepare(`SELECT COUNT(*) AS accounts, ROUND(SUM(statement_balance), 2) AS dollars,
                     ROUND(AVG(statement_balance), 2) AS mean_balance FROM accounts`).get()
);
const balances = db.prepare(`SELECT statement_balance FROM accounts ORDER BY statement_balance`).all().map((r) => r.statement_balance);
const medianBalance = balances[Math.floor(balances.length / 2)];

const union = new Map(); // account_id -> { balance, inQuestion }
const triggerOut = TRIGGERS.map((t, idx) => {
  const rows = db.prepare(t.sql).all().map(plain);
  const ids = new Set(rows.map((r) => r.account_id));
  for (const r of rows) {
    const prev = union.get(r.account_id);
    union.set(r.account_id, {
      balance: r.statement_balance,
      inQuestion: Math.max(prev?.inQuestion ?? 0, r.amount_in_question),
    });
  }
  const missed = [...seeded[t.id]].filter((x) => !ids.has(x)).length;
  const extra = [...ids].filter((x) => !seeded[t.id].has(x)).length;
  return {
    id: t.id,
    number: idx + 1,
    name: t.name,
    rule: t.rule,
    assumedRate: TRIGGER_RATES[t.id],
    sql: t.sql,
    caught: rows.length,
    statementDollars: round2(rows.reduce((s, r) => s + r.statement_balance, 0)),
    inQuestionDollars: round2(rows.reduce((s, r) => s + r.amount_in_question, 0)),
    columns: rows.length ? Object.keys(rows[0]) : [],
    sample: rows.slice(0, 3),
    check: { seeded: seeded[t.id].size, missed, extra },
  };
});

const unionRows = [...union.values()];
const out = {
  asOf: AS_OF,
  seed: SEED,
  engine: `node:sqlite (SQLite ${plain(db.prepare("SELECT sqlite_version() AS v").get()).v}), in-memory`,
  panel: {
    accounts: totals.accounts,
    practices: PRACTICES,
    dollars: totals.dollars,
    meanBalance: totals.mean_balance,
    medianBalance,
  },
  assumptions: {
    balance: `Statement balances are lognormal with a median of $${BALANCE_MEDIAN} (sigma ${BALANCE_SIGMA}), clipped to $12-$9,000. Trigger accounts draw their own amounts in the same shape.`,
    payerMix: "Commercial 62%, marketplace 12%, Medicare 24%, Medicaid 2%.",
    channels: "Preferred channel: SMS 55% (85% of those with documented text consent), email 30%, voice 8%, mail 7%.",
    t6Overlap: `${Math.round(T6_CO19_SHARE * 100)}% of work/accident accounts were denied CO-19 by the health plan and the denial was moved to the patient, so they also trip rule 1.`,
    triggerRates: TRIGGER_RATES,
  },
  nearMisses: Object.entries(NEAR_MISS_RATES).map(([k, v]) => ({ id: k, rule: v.rule, label: v.label, rate: v.rate, seeded: nearMissSeeded[k] })),
  schema: DDL,
  triggers: triggerOut,
  union: {
    caught: unionRows.length,
    statementDollars: round2(unionRows.reduce((s, r) => s + r.balance, 0)),
    inQuestionDollars: round2(unionRows.reduce((s, r) => s + r.inQuestion, 0)),
  },
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

console.log(`Panel: ${out.panel.accounts} accounts, $${out.panel.dollars.toLocaleString()} open, median $${medianBalance}`);
for (const t of triggerOut) {
  console.log(
    `  ${t.number}. ${t.name.padEnd(60)} ${String(t.caught).padStart(4)}  $${t.statementDollars.toFixed(2).padStart(11)}  ` +
      `seeded ${t.check.seeded}, missed ${t.check.missed}, extra ${t.check.extra}`
  );
}
console.log(`Any rule: ${out.union.caught} accounts, $${out.union.statementDollars.toFixed(2)} on statements, $${out.union.inQuestionDollars.toFixed(2)} in question`);
console.log(`Wrote ${OUT}`);

const bad = triggerOut.filter((t) => t.check.missed || t.check.extra);
if (bad.length) {
  console.error("Rule check failed: a query missed a seeded account or caught a near miss.");
  process.exit(1);
}
