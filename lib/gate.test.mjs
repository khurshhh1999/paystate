import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceGate, eobPatientShare, paymentGate } from "./gate.mjs";
import { CASES } from "./cases.mjs";
import { recordForView } from "./prompts.mjs";

const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
const gateOf = (id, view = "full") => paymentGate(recordForView(byId[id], view));

const FULL = {
  deductible: ["payable", 612.4],
  hardship: ["payable", 1840],
  "plan-change": ["payable", 148.2],
  "new-insurance": ["unverified", null],
  qmb: ["not_payable", 0],
  "surprise-bill": ["partial", 420],
  "unposted-copay": ["not_payable", 0],
  deceased: ["payable", 1126],
  preventive: ["payable", 35],
  "work-injury": ["not_payable", 0],
  "timely-filing": ["not_payable", 0],
  spanish: ["payable", 264],
};

test("every case has an expected full-record result", () => {
  assert.deepEqual(Object.keys(FULL).sort(), CASES.map((c) => c.id).sort());
});

for (const [id, [status, owed]] of Object.entries(FULL)) {
  test(`full record: ${id} is ${status} ${owed}`, () => {
    const g = gateOf(id);
    assert.equal(g.status, status);
    assert.equal(g.owed, owed);
    // Every full-record unverified here is a finding for staff, so it blocks.
    assert.equal(g.block, status === "not_payable" || status === "unverified");
    assert.ok(g.reasons.length > 0, "names at least one deciding fact");
    for (const r of g.reasons) assert.match(r, /\.$/, "reasons are sentences");
  });
}

test("full record reasons name the deciding code", () => {
  assert.match(gateOf("timely-filing").reasons[0], /^CO-29 on the full \$318\.00: filed after the payer's limit/);
  assert.match(gateOf("work-injury").reasons[0], /^CO-19/);
  assert.match(gateOf("new-insurance").reasons[0], /^PR-27 on the full \$386\.00: .*Coverage was not active per this payer\. Verify other coverage/);
  assert.doesNotMatch(gateOf("new-insurance").reasons.join(" "), /primary/);
  assert.match(gateOf("work-injury").reasons[0], /belongs with the workers' compensation carrier/);
  assert.doesNotMatch(gateOf("work-injury").reasons[0], /liable/);
  assert.match(gateOf("qmb").reasons[0], /QMB/);
  assert.match(gateOf("unposted-copay").reasons[0], /not applied/);
  assert.match(gateOf("surprise-bill").reasons[0], /\$420\.00.*\$1,890\.00/);
});

test("statement only: nothing on the statement decides, so every case is unverified and nothing is blocked", () => {
  for (const kase of CASES) {
    const g = paymentGate(recordForView(kase, "statement"));
    assert.equal(g.status, "unverified", kase.id);
    assert.equal(g.owed, null, kase.id);
    assert.equal(g.block, false, kase.id);
    assert.ok(g.reasons.length > 0, kase.id);
  }
});

test("remittance only: codes decide, but money and coverage the remittance cannot see slip through", () => {
  assert.equal(gateOf("timely-filing", "feeds:remittance").status, "not_payable");
  assert.equal(gateOf("work-injury", "feeds:remittance").status, "not_payable");
  assert.equal(gateOf("new-insurance", "feeds:remittance").status, "unverified");
  assert.equal(gateOf("new-insurance", "feeds:remittance").block, true);
  assert.deepEqual(
    [gateOf("surprise-bill", "feeds:remittance").status, gateOf("surprise-bill", "feeds:remittance").owed],
    ["partial", 420],
  );
  assert.equal(gateOf("preventive", "feeds:remittance").status, "payable");
  // The QMB category sits on eligibility and the unapplied copay on the ledger.
  assert.equal(gateOf("qmb", "feeds:remittance").status, "payable");
  assert.equal(gateOf("unposted-copay", "feeds:remittance").status, "payable");
});

test("eligibility only: a QMB category decides on its own, nothing else does", () => {
  assert.equal(gateOf("qmb", "feeds:eligibility").status, "not_payable");
  for (const id of ["deductible", "plan-change", "new-insurance", "surprise-bill"]) {
    assert.equal(gateOf(id, "feeds:eligibility").status, "unverified", id);
  }
});

test("ledger only: unapplied money that covers the balance decides on its own", () => {
  assert.equal(gateOf("unposted-copay", "feeds:ledger").status, "not_payable");
  assert.equal(gateOf("hardship", "feeds:ledger").status, "unverified");
});

// Hand-made records in the same field shapes.

test("zero balance is not payable", () => {
  const g = paymentGate({ statement_balance: 0, remit: [{ carc: "PR-1", amount: 0 }] });
  assert.deepEqual([g.status, g.owed], ["not_payable", 0]);
});

test("a credit balance is not payable", () => {
  const g = paymentGate({ statement_balance: -25 });
  assert.deepEqual([g.status, g.owed], ["not_payable", 0]);
  assert.match(g.reasons[0], /credit of \$25\.00/);
});

test("no statement balance is unverified", () => {
  assert.equal(paymentGate({ remit: [{ carc: "PR-1", amount: 10 }] }).status, "unverified");
  assert.equal(paymentGate({}).status, "unverified");
});

test("PR lines that do not add up to the balance are unverified", () => {
  const g = paymentGate({ statement_balance: 500, remit: [{ carc: "PR-1", amount: 300 }, { carc: "CO-45", amount: 90 }] });
  assert.deepEqual([g.status, g.owed], ["unverified", null]);
  assert.match(g.reasons[0], /\$300\.00.*\$500\.00/);
});

test("mixed CO denial and PR lines: only the PR part may be collected", () => {
  const g = paymentGate({
    statement_balance: 260,
    remit: [
      { carc: "CO-45", amount: 120 },
      { carc: "PR-3", amount: 40 },
      { carc: "CO-97", amount: 220 },
    ],
  });
  assert.deepEqual([g.status, g.owed], ["partial", 40]);
  assert.ok(g.reasons.some((r) => r.startsWith("CO-97 on $220.00")));
});

test("CO-45 alone with a balance is not payable", () => {
  const g = paymentGate({ statement_balance: 80, remit: [{ carc: "CO-45", amount: 80 }] });
  assert.equal(g.status, "not_payable");
});

test("unapplied money covering part of the balance makes it partial", () => {
  const g = paymentGate({
    statement_balance: 100,
    remit: [{ carc: "PR-2", amount: 100 }],
    ledger: [{ type: "card payment", amount: 30, status: "UNAPPLIED" }],
  });
  assert.deepEqual([g.status, g.owed], ["partial", 70]);
});

test("applied plan payments bring the PR total down to the balance; declined ones do not count", () => {
  const g = paymentGate({
    statement_balance: 400,
    remit: [{ carc: "CO-45", amount: 460 }, { carc: "PR-1", amount: 600 }],
    ledger: [
      { type: "plan payment, card on file", amount: 100, status: "applied" },
      { type: "plan payment, card on file", amount: 100, status: "applied" },
      { type: "plan payment, card on file", amount: 50, status: "declined - card expired" },
    ],
  });
  assert.deepEqual([g.status, g.owed], ["payable", 400]);
  assert.match(g.reasons[0], /less \$200\.00 already paid/);
});

test("a posted card payment is not read as unapplied money", () => {
  const g = paymentGate({
    statement_balance: 100,
    remit: [{ carc: "PR-2", amount: 100 }],
    ledger: [{ type: "credit card payment", amount: 50, status: "applied" }],
  });
  assert.deepEqual([g.status, g.owed], ["payable", 100]);
});

test("Medicaid already billed as secondary does not block", () => {
  const g = paymentGate({
    statement_balance: 20,
    remit: [{ carc: "PR-3", amount: 20 }],
    eligibility_check: "Medicare active. State Medicaid active, billed as secondary.",
  });
  assert.equal(g.status, "payable");
});

test("self-pay with no claim is payable", () => {
  const g = paymentGate({ payer: "Self-pay, no insurance on file", statement_balance: 150 });
  assert.deepEqual([g.status, g.owed], ["payable", 150]);
  assert.equal(paymentGate({ payer: "self-pay", statement_balance: 90 }).status, "payable");
});

test("an EOB stating a $0 patient share blocks collection", () => {
  const g = paymentGate({ statement_balance: 75, payer_eob: "Patient responsibility: $0.00" });
  assert.equal(g.status, "not_payable");
});

test("the gate does not change the record it reads", () => {
  const kase = byId["unposted-copay"];
  const before = JSON.stringify(kase.record);
  paymentGate(kase.record);
  assert.equal(JSON.stringify(kase.record), before);
});

// block: what enforceGate acts on.

test("block is true for not_payable and for findings staff must clear, false otherwise", () => {
  const cases = [
    [{ statement_balance: 80, remit: [{ carc: "CO-29", amount: 80 }] }, "not_payable", true],
    [{ statement_balance: 80, remit: [{ carc: "PR-27", amount: 80 }] }, "unverified", true],
    [{ statement_balance: 500, remit: [{ carc: "PR-1", amount: 300 }] }, "unverified", true],
    [{ statement_balance: 80 }, "unverified", false],
    [{ statement_balance: 80, payer: "Aetna PPO", ledger: [] }, "unverified", false],
    [{ statement_balance: 100, remit: [{ carc: "PR-2", amount: 40 }, { carc: "CO-97", amount: 60 }] }, "partial", false],
    [{ statement_balance: 40, remit: [{ carc: "PR-3", amount: 40 }] }, "payable", false],
  ];
  for (const [record, status, block] of cases) {
    const g = paymentGate(record);
    assert.deepEqual([g.status, g.block], [status, block], JSON.stringify(record));
  }
});

test("PR lines that do not reconcile hold the account for staff", () => {
  const g = paymentGate({ statement_balance: 500, remit: [{ carc: "PR-1", amount: 300 }] });
  assert.equal(g.block, true);
  assert.match(g.reasons[0], /Staff should reconcile/);
});

const ACTS = ["send_pay_link", "place_hold", "set_up_plan", "handoff_to_staff"];
const STRIPPED = { actions: ["place_hold", "handoff_to_staff"], removed: ["send_pay_link", "set_up_plan"] };
const KEPT = { actions: ACTS, removed: [] };

test("enforceGate on not_payable removes collect actions", () => {
  assert.deepEqual(enforceGate(ACTS, gateOf("timely-filing")), STRIPPED);
});

test("enforceGate on unverified with a staff finding removes collect actions", () => {
  assert.deepEqual(enforceGate(ACTS, gateOf("new-insurance")), STRIPPED);
});

test("enforceGate on unverified with nothing to check keeps them: the instructions decide", () => {
  const g = gateOf("timely-filing", "statement");
  assert.deepEqual([g.status, g.block], ["unverified", false]);
  assert.deepEqual(enforceGate(ACTS, g), KEPT);
});

test("enforceGate on partial keeps them: the pay-link amount is not checked in code", () => {
  const g = gateOf("surprise-bill");
  assert.equal(g.status, "partial");
  assert.deepEqual(enforceGate(ACTS, g), KEPT);
});

test("enforceGate on payable keeps them", () => {
  assert.deepEqual(enforceGate(ACTS, gateOf("deductible")), KEPT);
});

test("enforceGate follows block, not status, and reads a stored gate without block by its status", () => {
  assert.deepEqual(enforceGate(ACTS, { status: "unverified", block: true }), STRIPPED);
  assert.deepEqual(enforceGate(ACTS, { status: "unverified", block: false }), KEPT);
  assert.deepEqual(enforceGate(ACTS, { status: "not_payable" }), STRIPPED);
  assert.deepEqual(enforceGate(ACTS, { status: "unverified" }), KEPT);
  assert.deepEqual(enforceGate(["place_hold"], gateOf("timely-filing")).removed, []);
});

// Medicaid.

test("QMB and QMB Plus make Medicare cost-sharing not payable, billed as secondary or not", () => {
  for (const eligibility_check of [
    "Medicare Part B active. State Medicaid active, aid category: QMB Plus.",
    "Medicare Part B active. Medicaid active, aid category QMB, billed as secondary.",
  ]) {
    const g = paymentGate({ statement_balance: 30, payer: "Medicare Part B", remit: [{ carc: "PR-2", amount: 30 }], eligibility_check });
    assert.deepEqual([g.status, g.owed, g.block], ["not_payable", 0, true], eligibility_check);
    assert.match(g.reasons[0], /QMB/);
  }
});

test("a non-QMB category is not read as QMB", () => {
  const g = paymentGate({
    statement_balance: 30,
    payer: "Medicare Part B",
    remit: [{ carc: "PR-2", amount: 30 }],
    eligibility_check: "Medicare Part B active. Medicaid aid category SLMB (not QMB), inactive.",
  });
  assert.equal(g.status, "payable");
});

test("a Medicaid copay on a claim Medicaid adjudicated is payable", () => {
  const g = paymentGate({
    statement_balance: 4,
    payer: "Meridian Medicaid managed care, in network",
    remit: [{ carc: "CO-45", amount: 60 }, { carc: "PR-3", amount: 4 }],
    eligibility_check: "Medicaid managed care active. Member copay for office visits: $4.",
  });
  assert.deepEqual([g.status, g.owed, g.block], ["payable", 4, false]);
});

test("active Medicaid that has not been billed holds the account", () => {
  const g = paymentGate({
    statement_balance: 50,
    payer: "Aetna Choice POS II",
    remit: [{ carc: "PR-2", amount: 50 }],
    eligibility_check: "Aetna active. State Medicaid active, full benefits.",
  });
  assert.deepEqual([g.status, g.owed, g.block], ["unverified", null, true]);
  assert.deepEqual(g.reasons, ["Medicaid is active and has not been billed. Bill Medicaid before the patient."]);
});

test("only an explicit billed-as-secondary statement lifts the Medicaid hold", () => {
  const base = { statement_balance: 50, payer: "Aetna Choice POS II", remit: [{ carc: "PR-2", amount: 50 }] };
  const held = [
    "Aetna active. State Medicaid active. Secondary coverage review pending.",
    "Aetna active. State Medicaid active, not on file as secondary.",
    "Aetna active. Supplement billed as secondary. State Medicaid active.",
    "Aetna active. State Medicaid active, never billed as secondary.",
  ];
  for (const eligibility_check of held) assert.equal(paymentGate({ ...base, eligibility_check }).block, true, eligibility_check);
  const lifted = paymentGate({ ...base, eligibility_check: "Aetna active. State Medicaid active, billed as secondary 2026-10-01." });
  assert.equal(lifted.status, "payable");
});

test("Medicaid that is not active does not hold the account", () => {
  const base = { statement_balance: 50, payer: "Aetna Choice POS II", remit: [{ carc: "PR-2", amount: 50 }] };
  for (const eligibility_check of ["Aetna active. Medicaid inactive since 2025.", "Aetna active. Medicaid not active.", "Aetna active. No Medicaid found."]) {
    assert.equal(paymentGate({ ...base, eligibility_check }).status, "payable", eligibility_check);
  }
});

// Coverage not active per this payer: CARC 26, 27, 31 in any group.

for (const [code, words] of [
  ["PR-26", /before coverage began/],
  ["PR-27", /coverage had ended/],
  ["PR-31", /could not identify the patient/],
  ["CO-27", /coverage had ended/],
  ["OA-31", /could not identify the patient/],
]) {
  test(`${code} holds the account for staff to verify other coverage`, () => {
    const g = paymentGate({ statement_balance: 210, remit: [{ carc: code, amount: 210 }] });
    assert.deepEqual([g.status, g.owed, g.block], ["unverified", null, true]);
    assert.equal(g.reasons.length, 1);
    assert.match(g.reasons[0], new RegExp(`^${code} on the full \\$210\\.00: `));
    assert.match(g.reasons[0], words);
    assert.match(g.reasons[0], /Coverage was not active per this payer\. Verify other coverage before billing the patient\.$/);
  });
}

test("a coverage denial beside a PR line still holds the whole account", () => {
  const g = paymentGate({ statement_balance: 260, remit: [{ carc: "PR-2", amount: 60 }, { carc: "PR-26", amount: 200 }] });
  assert.deepEqual([g.status, g.block], ["unverified", true]);
  assert.match(g.reasons[0], /^PR-26 on \$200\.00/);
});

test("a coverage denial beside a CO denial is held, with both reasons", () => {
  const g = paymentGate({ statement_balance: 300, remit: [{ carc: "CO-29", amount: 100 }, { carc: "PR-27", amount: 200 }] });
  assert.deepEqual([g.status, g.owed, g.block], ["unverified", null, true]);
  assert.match(g.reasons[0], /^PR-27 on \$200\.00/);
  assert.match(g.reasons[1], /^CO-29 on \$100\.00: filed after the payer's limit/);
});

// A patient the record shows has died.

const DECEASED_REASON = "The record shows the patient has died. No payment is requested from the family; staff handle the estate.";

test("a record that shows the patient has died holds a payable balance", () => {
  for (const extra of [
    { patient_status: "Deceased" },
    { date_of_death: "2026-10-02" },
    { account_notes: "Spouse called 10/05: patient died 10/02." },
    { outreach_log: "SMS reminders stopped. Patient status in EHR: deceased." },
    { guarantor: "Estate of Robert Hensley" },
  ]) {
    const g = paymentGate({ statement_balance: 1126, remit: [{ carc: "PR-2", amount: 1126 }], ...extra });
    assert.deepEqual([g.status, g.owed, g.block], ["unverified", null, true], JSON.stringify(extra));
    assert.deepEqual(g.reasons, [DECEASED_REASON]);
  }
});

test("a death on a not-payable balance stays not payable and names both facts", () => {
  const g = paymentGate({ statement_balance: 318, remit: [{ carc: "CO-29", amount: 318 }], patient_status: "Deceased" });
  assert.equal(g.status, "not_payable");
  assert.ok(g.reasons.includes(DECEASED_REASON));
});

test("the gate cannot see a death the record does not hold", () => {
  // The widow case: the record says the patient is active; only her message says he died.
  assert.equal(byId.deceased.record.outreach_log.includes("active"), true);
  assert.deepEqual([gateOf("deceased").status, gateOf("deceased").block], ["payable", false]);
  // An expired card is not a death.
  const g = paymentGate({ statement_balance: 40, remit: [{ carc: "PR-3", amount: 40 }], account_notes: "Card on file expired 10/26." });
  assert.equal(g.status, "payable");
});

// EOB patient share.

test("eobPatientShare takes the figure after the patient-share phrase", () => {
  const share = (payer_eob) => eobPatientShare({ payer_eob });
  assert.equal(share("Patient cost-sharing calculated at in-network level: $420.00"), 420);
  assert.equal(share("Billed $2,310.00. Allowed $900.00. Patient responsibility: $420.00"), 420);
  assert.equal(share("Member cost share $1,234.56 after deductible"), 1234.56);
  assert.equal(share("Patient responsibility: $0.00"), 0);
  assert.equal(share("Patient responsibility $35.00. Patient responsibility $35.00."), 35);
});

test("eobPatientShare returns null when it cannot tell", () => {
  const share = (payer_eob) => eobPatientShare({ payer_eob });
  assert.equal(share("Patient responsibility not yet determined. Billed $500.00."), null);
  assert.equal(share("Paid $100.00 to provider."), null);
  assert.equal(share("Patient share for 2 services: $40.00"), null);
  assert.equal(share("Patient responsibility $35.00. Revised patient responsibility $50.00."), null);
  assert.equal(eobPatientShare({}), null);
  assert.equal(eobPatientShare({ payer_eob: 42 }), null);
});

test("an EOB that leads with the billed amount is read by its patient share", () => {
  const g = paymentGate({
    statement_balance: 2310,
    payer_eob: "Billed $2,310.00. Allowed $900.00. Patient responsibility: $420.00",
  });
  assert.deepEqual([g.status, g.owed], ["partial", 420]);
});

test("an EOB with no readable patient share does not decide", () => {
  const g = paymentGate({ statement_balance: 300, payer_eob: "Billed $300.00. Patient responsibility pending review." });
  assert.deepEqual([g.status, g.block], ["unverified", false]);
});

// The traffic set is written separately. When it lands, every case's expected result is checked here.
test("traffic set: gate matches GATE_EXPECTED on the full record", async (t) => {
  let traffic;
  try {
    traffic = await import("./traffic.mjs");
  } catch (err) {
    // Missing file (or its case file) skips; a file that is there but broken fails.
    if (err?.code !== "ERR_MODULE_NOT_FOUND") throw err;
    t.skip("lib/traffic.mjs is not there yet");
    return;
  }
  const { TRAFFIC_CASES, GATE_EXPECTED } = traffic;
  assert.ok(Array.isArray(TRAFFIC_CASES) && TRAFFIC_CASES.length > 0);
  for (const kase of TRAFFIC_CASES) {
    const want = GATE_EXPECTED[kase.id];
    assert.ok(want, `GATE_EXPECTED has ${kase.id}`);
    const got = paymentGate(recordForView(kase, "full"));
    assert.deepEqual({ id: kase.id, status: got.status, owed: got.owed }, { id: kase.id, status: want.status, owed: want.owed });
  }
});
