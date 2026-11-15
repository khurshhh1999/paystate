// The payment gate: reads an account record and decides whether the statement balance may be
// collected, and how much of it. Pure rules, no model call. It works on whatever part of the
// record a practice has connected (see recordForView); when the deciding fields are missing it
// says so instead of guessing.
//
// Statuses:
//   payable      - remittance patient-responsibility lines (or self-pay) account for the balance
//   partial      - the record supports only part of the balance
//   not_payable  - the record shows the patient should not be asked for the balance
//   unverified   - the record does not hold enough to decide
//
// block: true when collect actions must be removed. Always true for not_payable. True for
// unverified when the record holds a finding staff must clear first (coverage not active,
// Medicaid not billed, a deceased patient, PR lines that do not reconcile). False when the
// gate is unverified only because there is nothing to check, and for partial and payable:
// there the instructions decide, and the amount on a pay link is not checked here.

const CENT = 0.005;
const near = (a, b) => Math.abs(a - b) < CENT;

function usd(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

const asNumber = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Plain meanings for the reason codes billing staff see most. Anything else falls back to its group.
const CODE_TEXT = {
  "CO-16": "claim was missing information, the practice must correct and resubmit",
  "CO-18": "duplicate claim, the practice carries it",
  "CO-19":
    "work injury, the claim belongs with the workers' compensation carrier and the patient should not be billed while that claim is open",
  "CO-22": "another payer may be primary, the claim needs coordination of benefits",
  "CO-29": "filed after the payer's limit, a practice write-off",
  "CO-45": "charge above the contracted rate, written off",
  "CO-50": "payer found it not medically necessary, the practice carries it without a signed waiver",
  "CO-97": "bundled into another service, not billable to the patient",
  "CO-197": "no prior authorization, the practice carries it",
  "PR-1": "deductible",
  "PR-2": "coinsurance",
  "PR-3": "copay",
};

const GROUP_TEXT = {
  CO: "a contractual adjustment the practice carries",
  PR: "patient responsibility",
  OA: "an other adjustment, not patient responsibility",
  PI: "a payer-initiated reduction, not patient responsibility",
};

// Denials that say this payer's coverage did not apply to the patient on the date of service,
// in any group. The patient may have other coverage, so staff verify before billing them.
const COVERAGE_TEXT = {
  26: "the service was before coverage began",
  27: "coverage had ended on the date of service",
  31: "the payer could not identify the patient as its member",
};

/** "PR-3 copay", "CO-45", "pr 1" -> { group: "PR", code: "PR-3", num: 3 }. */
function parseCarc(raw) {
  if (typeof raw !== "string") return null;
  const m = raw.match(/\b(CO|PR|OA|PI|CR)\s*-?\s*(\d{1,3})\b/i);
  if (!m) return null;
  const group = m[1].toUpperCase();
  const num = Number(m[2]);
  return { group, code: `${group}-${num}`, num };
}

const meaning = (line) => CODE_TEXT[line.code] ?? GROUP_TEXT[line.group] ?? "an adjustment";
const isCoverage = (line) => line.num in COVERAGE_TEXT;

/** Reason-coded money lines from claim-level remittance and from line items that carry a code. */
function remitLines(record) {
  const out = [];
  if (Array.isArray(record.remit)) {
    for (const r of record.remit) {
      const c = parseCarc(r?.carc);
      const amount = asNumber(r?.amount);
      if (c && amount !== null) out.push({ ...c, amount });
    }
  }
  if (Array.isArray(record.services)) {
    for (const s of record.services) {
      const c = parseCarc(s?.carc);
      const amount = asNumber(s?.patient_owes) ?? asNumber(s?.amount);
      if (c && amount !== null) out.push({ ...c, amount });
    }
  }
  return out;
}

/** Money the ledger holds that has not been applied to a charge, plus any stated account credit. */
function unappliedMoney(record) {
  let total = 0;
  if (Array.isArray(record.ledger)) {
    for (const e of record.ledger) {
      if (!e || typeof e !== "object") continue;
      const label = `${e.type ?? ""} ${e.status ?? ""}`;
      const amount = asNumber(e.amount);
      if (amount !== null && amount > 0 && /unapplied|on account|account credit/i.test(label)) total += amount;
    }
  }
  const credit = asNumber(record.account_credit);
  if (credit !== null && credit > 0) total += credit;
  return total;
}

/** Patient payments the ledger shows as applied (plan payments, card payments). Declined or reversed ones do not count. */
function appliedPayments(record) {
  if (!Array.isArray(record.ledger)) return 0;
  let total = 0;
  for (const e of record.ledger) {
    if (!e || typeof e !== "object") continue;
    const amount = asNumber(e.amount);
    const status = String(e.status ?? "");
    if (amount === null || amount <= 0 || !/payment/i.test(String(e.type ?? ""))) continue;
    if (/unapplied|declined|returned|reversed|refunded|failed/i.test(status)) continue;
    if (/\bapplied\b|posted/i.test(status)) total += amount;
  }
  return total;
}

// "Patient cost-sharing calculated at in-network level: $420.00", "Member responsibility $0.00".
// The figure must follow the phrase in the same sentence, with no other number in between.
const SHARE_PHRASE =
  /\b(?:patient|member)(?:'s)?\s+(?:cost[\s-]?shar\w*|share|responsibility|liability|portion|owes)\b[^$\d.;]{0,60}?\$\s*([\d,]*\d(?:\.\d{1,2})?)/gi;

/**
 * Patient share stated on a payer EOB: the dollar figure that follows the patient-share phrase.
 * null when there is no such figure, or when the EOB states two different ones.
 */
export function eobPatientShare(record) {
  const eob = record?.payer_eob;
  if (typeof eob !== "string") return null;
  const found = [...eob.matchAll(SHARE_PHRASE)].map((m) => Number(m[1].replace(/,/g, "")));
  if (found.length === 0 || found.some((n) => !Number.isFinite(n))) return null;
  return found.every((n) => near(n, found[0])) ? found[0] : null;
}

const PAYERS = ["payer", "payer_on_file", "payer_billed"];
const payerText = (record) => PAYERS.map((k) => (typeof record[k] === "string" ? record[k] : "")).join(" ");
const isSelfPay = (record) => /self[\s-]?pay/i.test(payerText(record));

const sentences = (text) => text.split(/(?<=\.)\s+/);

/**
 * Medicaid on the eligibility response.
 * - A QMB (or QMB Plus) aid category: Medicare cost-sharing may not be billed to the patient at all.
 * - Other active Medicaid that did not adjudicate this claim and is not stated as billed as
 *   secondary: Medicaid must be billed before the patient. When Medicaid is the payer on the
 *   claim, its patient-responsibility lines (a Medicaid copay) are read like any other.
 * -> { kind: "qmb" | "unbilled", reason } or null
 */
function medicaidFinding(record) {
  const e = record.eligibility_check;
  if (typeof e !== "string") return null;
  const qmb = /\bQMB\b|qualified medicare beneficiary/i.test(e) && !/\b(?:non|not)[\s-]+QMB\b/i.test(e);
  if (qmb) {
    return {
      kind: "qmb",
      reason: "Eligibility shows a QMB category: federal rules bar billing the patient for Medicare cost-sharing.",
    };
  }
  const medicaidSentences = sentences(e).filter((s) => /medicaid/i.test(s));
  const active = medicaidSentences.some((s) => /\bactive\b/i.test(s) && !/\b(?:not|no longer)\s+active\b/i.test(s));
  if (!active) return null;
  if (/medicaid/i.test(payerText(record))) return null;
  // Only an explicit statement counts, in a sentence about Medicaid: "billed as secondary",
  // "on file as secondary". "not on file as secondary" does not.
  const billedSecondary = medicaidSentences.some((s) => {
    const m = s.match(/(\b(?:not|never)\s+(?:yet\s+)?(?:been\s+)?)?\b(?:billed|filed|submitted|on file|set up|listed|added)\s+as\s+(?:the\s+)?secondary\b/i);
    return m !== null && !m[1];
  });
  if (billedSecondary) return null;
  return { kind: "unbilled", reason: "Medicaid is active and has not been billed. Bill Medicaid before the patient." };
}

// Fields where a practice system records that a patient has died.
const DEATH_FIELDS = ["patient_status", "account_notes", "outreach_log", "guarantor", "date_of_death"];
const DEATH_TEXT = /\b(?:deceased|died|date of death|passed away|estate of)\b/i;

function recordShowsDeath(record) {
  if (typeof record.date_of_death === "string" && record.date_of_death.trim()) return true;
  return DEATH_FIELDS.some((k) => typeof record[k] === "string" && DEATH_TEXT.test(record[k]));
}

function joinAnd(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Actions that take money. These are what the gate can remove.
export const COLLECT_ACTIONS = ["send_pay_link", "set_up_plan"];

/**
 * Removes collect actions when the gate blocks the balance. -> { actions, removed }
 * A gate result without `block` (stored before it existed) is treated as blocking when not payable.
 */
export function enforceGate(actions, gate) {
  const block = typeof gate?.block === "boolean" ? gate.block : gate?.status === "not_payable";
  if (!block) return { actions: [...actions], removed: [] };
  return {
    actions: actions.filter((a) => !COLLECT_ACTIONS.includes(a)),
    removed: actions.filter((a) => COLLECT_ACTIONS.includes(a)),
  };
}

/** @param {Record<string, unknown>} record */
export function paymentGate(record) {
  const rec = record && typeof record === "object" ? record : {};
  const balance = asNumber(rec.statement_balance);
  const notPayable = (reasons) => ({ status: "not_payable", owed: 0, reasons, block: true });
  // Nothing to check: the gate cannot decide and blocks nothing.
  const unverified = (reasons) => ({ status: "unverified", owed: null, reasons, block: false });
  // A finding staff must clear before anyone asks the patient for money.
  const held = (reasons) => ({ status: "unverified", owed: null, reasons, block: true });

  if (balance === null) return unverified(["The record has no statement balance to check."]);
  if (near(balance, 0)) return notPayable(["The statement balance is $0.00. Nothing is owed."]);
  if (balance < 0) return notPayable([`The account holds a credit of ${usd(-balance)}. Nothing is owed.`]);

  const on = (amount) => (near(amount, balance) ? `on the full ${usd(amount)}` : `on ${usd(amount)}`);
  const lines = remitLines(rec);
  const coverage = lines.filter(isCoverage);
  const decided = lines.filter((l) => !isCoverage(l));
  const pr = decided.filter((l) => l.group === "PR");
  const prSum = pr.reduce((s, l) => s + l.amount, 0);
  // CO-45 is the routine contracted-rate write-off; it sits beside a balance, it does not explain one.
  const coDenied = decided.filter((l) => (l.group === "CO" || l.group === "OA" || l.group === "PI") && l.code !== "CO-45");
  const coSum = coDenied.reduce((s, l) => s + l.amount, 0);
  const unapplied = unappliedMoney(rec);
  const paid = appliedPayments(rec);
  const eobShare = eobPatientShare(rec);
  const mcd = medicaidFinding(rec);

  // Findings that need staff before the patient is asked for anything.
  const holds = [];
  if (recordShowsDeath(rec)) {
    holds.push("The record shows the patient has died. No payment is requested from the family; staff handle the estate.");
  }
  for (const l of coverage) {
    holds.push(
      `${l.code} ${on(l.amount)}: ${COVERAGE_TEXT[l.num]}. Coverage was not active per this payer. Verify other coverage before billing the patient.`,
    );
  }
  // Other denials on the same claim are listed with a coverage hold so staff see the whole picture.
  if (coverage.length > 0) for (const l of coDenied) holds.push(`${l.code} ${on(l.amount)}: ${meaning(l)}.`);
  if (mcd?.kind === "unbilled") holds.push(mcd.reason);

  // Facts that stop collection outright.
  const blocks = [];
  if (mcd?.kind === "qmb") blocks.push(mcd.reason);
  if (decided.length > 0 && pr.length === 0 && eobShare === null && coverage.length === 0) {
    if (coDenied.length > 0) {
      for (const l of coDenied) blocks.push(`${l.code} ${on(l.amount)}: ${meaning(l)}.`);
    } else {
      blocks.push("The remittance shows only contractual adjustments (CO-45) and no patient responsibility.");
    }
  }
  if (unapplied > 0 && unapplied + CENT >= balance) {
    blocks.push(`The ledger holds ${usd(unapplied)} received but not applied, which covers the ${usd(balance)} balance.`);
  }
  if (eobShare !== null && near(eobShare, 0)) blocks.push("The payer EOB puts the patient's share at $0.00.");
  if (blocks.length) return notPayable([...blocks, ...holds]);
  if (holds.length) return held(holds);

  // How much the record supports, before money already received.
  let supported = null;
  const reasons = [];
  if (eobShare !== null) {
    supported = Math.min(eobShare, balance);
    reasons.push(
      eobShare + CENT < balance
        ? `The payer EOB puts the patient's share at ${usd(eobShare)}. The other ${usd(balance - eobShare)} is not the patient's to pay.`
        : `The payer EOB puts the patient's share at ${usd(eobShare)}, matching the balance.`,
    );
  } else if (pr.length > 0) {
    const parts = pr.map((l) => `${l.code} ${meaning(l)} of ${usd(l.amount)}`);
    if (near(prSum, balance)) {
      supported = balance;
      reasons.push(
        pr.length === 1
          ? `${parts[0]} on the remittance accounts for the whole balance.`
          : `${joinAnd(parts)} add up to the ${usd(balance)} balance.`,
      );
    } else if (paid > 0 && near(prSum - paid, balance)) {
      // A plan or earlier payments already brought the patient share down to the statement balance.
      supported = balance;
      reasons.push(`${joinAnd(parts)}, less ${usd(paid)} already paid, leave the ${usd(balance)} balance.`);
    } else if (prSum < balance && coDenied.length > 0 && near(prSum + coSum, balance)) {
      supported = prSum;
      reasons.push(`Patient share on the remittance: ${joinAnd(parts)}.`);
      for (const l of coDenied) reasons.push(`${l.code} ${on(l.amount)}: ${meaning(l)}.`);
    } else {
      return held([
        `Patient-responsibility lines total ${usd(prSum)} but the statement says ${usd(balance)}. Staff should reconcile before asking for money.`,
      ]);
    }
  } else if (isSelfPay(rec)) {
    supported = balance;
    reasons.push(`Self-pay account with no insurance claim: the ${usd(balance)} balance is the patient's.`);
  }

  if (supported === null) {
    const why = [
      typeof rec.payer_eob === "string"
        ? "The payer EOB does not state the patient's share as a single figure, and there are no reason codes to check."
        : "No remittance in the record, so nothing shows what the payer decided or what the patient's share is.",
    ];
    if (unapplied > 0) why.push(`The ledger holds ${usd(unapplied)} received but not applied.`);
    return unverified(why);
  }

  if (unapplied > 0) {
    reasons.push(`The ledger holds ${usd(unapplied)} received but not applied, which comes off what is owed.`);
    supported -= unapplied;
  }
  if (supported <= CENT) return notPayable(reasons);

  const owed = Math.round(supported * 100) / 100;
  if (near(owed, balance)) return { status: "payable", owed: balance, reasons, block: false };
  return { status: "partial", owed, reasons, block: false };
}
