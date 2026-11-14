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
  "CO-19": "work injury, the workers' compensation carrier is liable, not the patient",
  "CO-22": "another payer may be primary, the claim needs coordination of benefits",
  "CO-29": "filed after the payer's limit, a practice write-off",
  "CO-45": "charge above the contracted rate, written off",
  "CO-50": "payer found it not medically necessary, the practice carries it without a signed waiver",
  "CO-97": "bundled into another service, not billable to the patient",
  "CO-197": "no prior authorization, the practice carries it",
  "PR-1": "deductible",
  "PR-2": "coinsurance",
  "PR-3": "copay",
  "PR-27": "coverage had ended on the date of service",
};

const GROUP_TEXT = {
  CO: "a contractual adjustment the practice carries",
  PR: "patient responsibility",
  OA: "an other adjustment, not patient responsibility",
  PI: "a payer-initiated reduction, not patient responsibility",
};

/** "PR-3 copay", "CO-45", "pr 1" -> { group: "PR", code: "PR-3" }. */
function parseCarc(raw) {
  if (typeof raw !== "string") return null;
  const m = raw.match(/\b(CO|PR|OA|PI|CR)\s*-?\s*(\d{1,3})\b/i);
  if (!m) return null;
  const group = m[1].toUpperCase();
  return { group, code: `${group}-${Number(m[2])}` };
}

const meaning = (line) => CODE_TEXT[line.code] ?? GROUP_TEXT[line.group] ?? "an adjustment";

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

/** Patient share stated on a payer EOB, e.g. "Patient cost-sharing calculated at in-network level: $420.00". */
function eobPatientShare(record) {
  const eob = record.payer_eob;
  if (typeof eob !== "string") return null;
  if (!/patient|member/i.test(eob) || !/shar|responsib|owe/i.test(eob)) return null;
  const m = eob.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** Active Medicaid or a QMB category on the eligibility response, unless it is already billed as secondary. */
function medicaidBar(record) {
  const e = record.eligibility_check;
  if (typeof e !== "string") return null;
  const qmb = /\bQMB\b|qualified medicare beneficiary/i.test(e);
  const medicaid = /medicaid[^.]*\bactive\b|\bactive\b[^.]*medicaid/i.test(e);
  if (!qmb && !medicaid) return null;
  const notSecondary = /not\s+(?:on file|billed|set up|listed)\s+as\s+secondary/i.test(e);
  const billedSecondary = !notSecondary && /secondary/i.test(e);
  if (billedSecondary) return null;
  return qmb
    ? "Eligibility shows a QMB category: federal rules bar billing the patient for Medicare cost-sharing."
    : "Eligibility shows active Medicaid not billed as secondary: the patient cannot be billed until Medicaid is billed.";
}

const PAYERS = ["payer", "payer_on_file", "payer_billed"];
const isSelfPay = (record) => PAYERS.some((k) => typeof record[k] === "string" && /self[\s-]?pay/i.test(record[k]));

function joinAnd(parts) {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

// Actions that take money. These are what the gate can remove.
export const COLLECT_ACTIONS = ["send_pay_link", "set_up_plan"];

/** Removes collect actions when the gate says not payable. -> { actions, removed } */
export function enforceGate(actions, gate) {
  if (gate?.status !== "not_payable") return { actions: [...actions], removed: [] };
  return {
    actions: actions.filter((a) => !COLLECT_ACTIONS.includes(a)),
    removed: actions.filter((a) => COLLECT_ACTIONS.includes(a)),
  };
}

/** @param {Record<string, unknown>} record */
export function paymentGate(record) {
  const rec = record && typeof record === "object" ? record : {};
  const balance = asNumber(rec.statement_balance);
  const notPayable = (reasons) => ({ status: "not_payable", owed: 0, reasons });
  const unverified = (reasons) => ({ status: "unverified", owed: null, reasons });

  if (balance === null) return unverified(["The record has no statement balance to check."]);
  if (near(balance, 0)) return notPayable(["The statement balance is $0.00. Nothing is owed."]);
  if (balance < 0) return notPayable([`The account holds a credit of ${usd(-balance)}. Nothing is owed.`]);

  const on = (amount) => (near(amount, balance) ? `on the full ${usd(amount)}` : `on ${usd(amount)}`);
  const lines = remitLines(rec);
  const pr = lines.filter((l) => l.group === "PR" && l.code !== "PR-27");
  const prSum = pr.reduce((s, l) => s + l.amount, 0);
  // CO-45 is the routine contracted-rate write-off; it sits beside a balance, it does not explain one.
  const coDenied = lines.filter((l) => (l.group === "CO" || l.group === "OA" || l.group === "PI") && l.code !== "CO-45");
  const coSum = coDenied.reduce((s, l) => s + l.amount, 0);
  const unapplied = unappliedMoney(rec);
  const paid = appliedPayments(rec);
  const eobShare = eobPatientShare(rec);

  // Facts that stop collection outright.
  const blocks = [];
  for (const l of lines.filter((x) => x.code === "PR-27")) {
    blocks.push(`PR-27 ${on(l.amount)}: ${CODE_TEXT["PR-27"]}. Another payer may be primary, so refile before billing the patient.`);
  }
  const mcd = medicaidBar(rec);
  if (mcd) blocks.push(mcd);
  if (lines.length > 0 && pr.length === 0 && eobShare === null && !lines.some((l) => l.code === "PR-27")) {
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
  if (blocks.length) return notPayable(blocks);

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
      return unverified([
        `Patient-responsibility lines total ${usd(prSum)} but the statement says ${usd(balance)}. Staff should reconcile before asking for money.`,
      ]);
    }
  } else if (isSelfPay(rec)) {
    supported = balance;
    reasons.push(`Self-pay account with no insurance claim: the ${usd(balance)} balance is the patient's.`);
  }

  if (supported === null) {
    const why = ["No remittance in the record, so nothing shows what the payer decided or what the patient's share is."];
    if (unapplied > 0) why.push(`The ledger holds ${usd(unapplied)} received but not applied.`);
    return unverified(why);
  }

  if (unapplied > 0) {
    reasons.push(`The ledger holds ${usd(unapplied)} received but not applied, which comes off what is owed.`);
    supported -= unapplied;
  }
  if (supported <= CENT) return notPayable(reasons);

  const owed = Math.round(supported * 100) / 100;
  if (near(owed, balance)) return { status: "payable", owed: balance, reasons };
  return { status: "partial", owed, reasons };
}
