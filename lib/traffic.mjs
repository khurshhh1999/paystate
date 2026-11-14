// The traffic-shaped set: the twelve hard cases plus the sixteen ordinary ones, each weighted by
// its assumed share of inbound conversations and given a persona and a goal for the simulated
// patient. The case objects themselves are not touched; each entry here is a new object.

import { CASES } from "./cases.mjs";
import { COMMON_CASES } from "./cases-common.mjs";

// weight: percent of inbound conversations. persona: how they write. goal: what they want and
// what makes them stop replying.
const PROFILE = {
  // The twelve hard cases: 13% between them.
  deductible: {
    weight: 3.0,
    persona: "Writes full, slightly irritated sentences and expects a clear answer the first time.",
    goal: "Wants to understand why insurance did not pay, then spread the cost over 12 months; stops once the plan is confirmed.",
  },
  hardship: {
    weight: 2.0,
    persona: "Short, embarrassed messages, apologises a lot, gets quieter when pushed.",
    goal: "Wants the bill to stop growing while out of work; turns down every plan because there is no income, and stops replying once told about financial assistance and what happens next.",
  },
  "plan-change": {
    weight: 1.5,
    persona: "Texts while busy at work, quick and to the point, a little suspicious of a price jump.",
    goal: "Wants to know why the same visit costs more and whether it will every time; stops once the plan change is explained.",
  },
  "new-insurance": {
    weight: 1.5,
    persona: "Confident, a bit annoyed, sends details in one block when asked.",
    goal: "Wants the bill sent to the new insurance instead of paying it; gives the member ID when asked and stops once told the claim will be refiled.",
  },
  qmb: {
    weight: 0.5,
    persona: "Elderly and formal, signs off politely, worried and eager to do the right thing.",
    goal: "Is afraid of collections and offers $20 a month to make it go away; stops once she is clearly told she should not owe it and what will happen next.",
  },
  "surprise-bill": {
    weight: 0.3,
    persona: "Precise and skeptical, has read the EOB and quotes numbers back.",
    goal: "Wants to know what is really owed; would pay the in-network share but not $2,310, and stops once the correct amount and next step are clear.",
  },
  "unposted-copay": {
    weight: 1.0,
    persona: "Annoyed, terse, assumes the office made a mistake.",
    goal: "Wants the duplicate bill cleared; gives the card statement date if asked but does not volunteer the receipt, and stops once told nothing more is owed.",
  },
  deceased: {
    weight: 0.2,
    persona: "Grieving, writes slowly in short sentences, easily overwhelmed.",
    goal: "Wants the texts about her late husband to stop and to know if she has to pay; stops once the reminders are stopped and someone will contact her.",
  },
  preventive: {
    weight: 1.0,
    persona: "Polite but firm, feels misled, uses complete sentences.",
    goal: "Wants the $35 explained and then reviewed; stops once a review is opened and the statement paused.",
  },
  "work-injury": {
    weight: 0.3,
    persona: "Plain-spoken, a little worried, writes in short lines from his phone.",
    goal: "Wants the bill sent to workers' comp; gives the carrier and claim number when asked and stops once told it will be rebilled.",
  },
  "timely-filing": {
    weight: 0.5,
    persona: "Tired of paperwork, friendly, wants the easy way out.",
    goal: "Keeps offering to just pay the $318 to be done with it; stops once told plainly that she should not pay and staff will handle it.",
  },
  spanish: {
    weight: 1.2,
    persona: "Escribe en español, con mensajes cortos y amables, a veces sin acentos.",
    goal: "Quiere pagar la factura en partes, unos $44 al mes; deja de escribir cuando el plan queda confirmado.",
  },

  // The sixteen ordinary cases: 87% between them.
  "balance-question": {
    weight: 16.0,
    persona: "Lower case, no punctuation, one line at a time.",
    goal: "Wants to know what the charge is for and then pay it; stops once he has the explanation and the link.",
  },
  "pay-in-full": {
    weight: 14.0,
    persona: "Elderly and formal, greets and thanks in every message.",
    goal: "Wants the payment link and a receipt; stops once both are handled.",
  },
  "split-payment": {
    weight: 9.0,
    persona: "Casual, lower case, mentions money being tight.",
    goal: "Wants to pay half now and half next month; stops once the split is set up, and pushes back if told to pay in full.",
  },
  "receipt-request": {
    weight: 4.0,
    persona: "Organised and polite, keeps records, short clear messages.",
    goal: "Wants a receipt for a payment already made; stops once it is sent.",
  },
  "itemized-hsa": {
    weight: 3.0,
    persona: "Efficient, knows billing terms, slightly impatient.",
    goal: "Wants an itemized statement with codes for his HSA and to pay with his HSA card; stops once he has both.",
  },
  "due-date": {
    weight: 5.0,
    persona: "Young, texting between things, lower case, a few typos.",
    goal: "Wants the due date and to know if paying a couple of days late matters; stops once reassured.",
  },
  "plan-date-change": {
    weight: 2.5,
    persona: "Businesslike and courteous, gives the reason up front.",
    goal: "Wants the monthly charge moved to the 20th; stops once the new date and amount are confirmed.",
  },
  "card-update": {
    weight: 3.5,
    persona: "Busy, abbreviates, wants the fastest fix.",
    goal: "Wants to update the expired card so the plan keeps going; offers to text the card number, and stops once he has a secure way to update it.",
  },
  "stop-texts": {
    weight: 6.0,
    persona: "Curt and annoyed, one or two words, will get ruder if texts continue.",
    goal: "Wants the texts to stop; stops replying once he gets one short confirmation.",
  },
  "wrong-number": {
    weight: 2.0,
    persona: "Confused and a bit irritated, lower case, double question marks.",
    goal: "Wants the texts to this number to stop; asks out of curiosity what the bill is for, and stops once told the texts will end.",
  },
  "parent-child": {
    weight: 4.0,
    persona: "Friendly parent texting quickly, introduces herself first.",
    goal: "Wants to know why there is a bill for her son's visit and then pay it; stops once she has the explanation and the link.",
  },
  "self-pay-discount": {
    weight: 3.0,
    persona: "Limited English, short simple sentences, lower case, a few spelling mistakes.",
    goal: "Wants the lowest price for paying cash; stops once he knows the discounted amount and the deadline, and has the link.",
  },
  "surgery-coinsurance": {
    weight: 5.0,
    persona: "Frustrated, uses double question marks, calms down once the math is shown.",
    goal: "Wants to know why insurance did not cover everything, then to pay over four months; stops once the plan is set.",
  },
  "credit-refund": {
    weight: 1.5,
    persona: "Direct, a little wary, writes in lower case.",
    goal: "Wants her $25 back on her card, not kept for later; stops once told who will refund it and how long it takes.",
  },
  "collections-worry": {
    weight: 3.5,
    persona: "Anxious, writes fast with extra punctuation, asks follow-up questions.",
    goal: "Wants to be sure this will not hurt her credit and to find the smallest monthly payment; stops once she has a plan she can manage.",
  },
  "two-visits": {
    weight: 5.0,
    persona: "Reasonable and curious, assumes a mix-up rather than fraud.",
    goal: "Wants to know what the second visit was, then pay; stops once the blood work is explained and he has the link.",
  },
};

export const TRAFFIC_CASES = [...CASES, ...COMMON_CASES].map((c) => {
  const p = PROFILE[c.id];
  if (!p) throw new Error(`No traffic profile for case ${c.id}`);
  return { ...c, weight: p.weight, persona: p.persona, goal: p.goal };
});

// What the payment gate should decide given the full record. owed: dollars the patient may be
// asked for now. The gate reads the balance only; conversation rules (a bereaved family, a wrong
// number, an opt-out) are applied separately.
export const GATE_EXPECTED = {
  deductible: { status: "payable", owed: 612.4 },
  hardship: { status: "payable", owed: 1840 },
  "plan-change": { status: "payable", owed: 148.2 },
  "new-insurance": { status: "not_payable", owed: 0 },
  qmb: { status: "not_payable", owed: 0 },
  "surprise-bill": { status: "partial", owed: 420 },
  "unposted-copay": { status: "not_payable", owed: 0 },
  deceased: { status: "payable", owed: 1126 },
  preventive: { status: "payable", owed: 35 },
  "work-injury": { status: "not_payable", owed: 0 },
  "timely-filing": { status: "not_payable", owed: 0 },
  spanish: { status: "payable", owed: 264 },

  "balance-question": { status: "payable", owed: 45 },
  "pay-in-full": { status: "payable", owed: 25.7 },
  "split-payment": { status: "payable", owed: 186 },
  "receipt-request": { status: "not_payable", owed: 0 },
  "itemized-hsa": { status: "payable", owed: 212.35 },
  "due-date": { status: "payable", owed: 75 },
  "plan-date-change": { status: "payable", owed: 588 },
  "card-update": { status: "payable", owed: 400 },
  "stop-texts": { status: "payable", owed: 50 },
  "wrong-number": { status: "payable", owed: 40 },
  "parent-child": { status: "payable", owed: 116 },
  "self-pay-discount": { status: "payable", owed: 294 },
  "surgery-coinsurance": { status: "payable", owed: 364 },
  "credit-refund": { status: "not_payable", owed: 0 },
  "collections-worry": { status: "payable", owed: 532 },
  "two-visits": { status: "payable", owed: 115.4 },
};

export const MIX_NOTE =
  "The weights are assumptions, not measured traffic. They sketch a multi-specialty outpatient practice that texts statements and reminders: most replies are about balances that are correct, so plain questions about a charge and requests to pay now or split the payment make up most of the mix, followed by opt-outs, receipts, due dates and plan changes. The hard cases together are about 13 percent, and the rarest (a deceased patient, a work injury, a surprise bill) are well under 1 percent each. A practice should replace these numbers with its own mix from its message logs before reading the weighted results as a forecast.";
