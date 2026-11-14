import { test } from "node:test";
import assert from "node:assert/strict";
import { enforceGate, paymentGate } from "./gate.mjs";
import { CASES } from "./cases.mjs";
import { recordForView } from "./prompts.mjs";

const byId = Object.fromEntries(CASES.map((c) => [c.id, c]));
const gateOf = (id, view = "full") => paymentGate(recordForView(byId[id], view));

const FULL = {
  deductible: ["payable", 612.4],
  hardship: ["payable", 1840],
  "plan-change": ["payable", 148.2],
  "new-insurance": ["not_payable", 0],
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
    assert.ok(g.reasons.length > 0, "names at least one deciding fact");
    for (const r of g.reasons) assert.match(r, /\.$/, "reasons are sentences");
  });
}

test("full record reasons name the deciding code", () => {
  assert.match(gateOf("timely-filing").reasons[0], /^CO-29 on the full \$318\.00: filed after the payer's limit/);
  assert.match(gateOf("work-injury").reasons[0], /^CO-19/);
  assert.match(gateOf("new-insurance").reasons[0], /^PR-27/);
  assert.match(gateOf("qmb").reasons[0], /QMB/);
  assert.match(gateOf("unposted-copay").reasons[0], /not applied/);
  assert.match(gateOf("surprise-bill").reasons[0], /\$420\.00.*\$1,890\.00/);
});

test("statement only: nothing on the statement decides, so every case is unverified", () => {
  for (const kase of CASES) {
    const g = paymentGate(recordForView(kase, "statement"));
    assert.equal(g.status, "unverified", kase.id);
    assert.equal(g.owed, null, kase.id);
    assert.ok(g.reasons.length > 0, kase.id);
  }
});

test("remittance only: codes decide, but money and coverage the remittance cannot see slip through", () => {
  assert.equal(gateOf("timely-filing", "feeds:remittance").status, "not_payable");
  assert.equal(gateOf("work-injury", "feeds:remittance").status, "not_payable");
  assert.equal(gateOf("new-insurance", "feeds:remittance").status, "not_payable");
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

test("enforceGate removes collect actions only when not payable", () => {
  const acts = ["send_pay_link", "place_hold", "set_up_plan", "handoff_to_staff"];
  assert.deepEqual(enforceGate(acts, { status: "not_payable" }), {
    actions: ["place_hold", "handoff_to_staff"],
    removed: ["send_pay_link", "set_up_plan"],
  });
  for (const status of ["payable", "partial", "unverified"]) {
    assert.deepEqual(enforceGate(acts, { status }), { actions: acts, removed: [] }, status);
  }
  assert.deepEqual(enforceGate(["place_hold"], gateOf("timely-filing")).removed, []);
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
