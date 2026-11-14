// What happens instead of the statement, per gate rule.
// Example amounts and dates come from the matching bench case so the two pages line up.

import type { TriggerId } from "./types";

export interface GateMessage {
  // When this message is used, e.g. "Statement already sent".
  when: string;
  channel: "SMS" | "Email" | "SMS or email" | "Reply on the same channel";
  text: string;
}

export interface GatePlay {
  caseId: string; // bench case this rule would have caught upstream
  who: string;
  channel: string;
  when: string;
  messages: GateMessage[];
  replies: { reply: string; result: string }[];
  staffTask: string;
}

export const PRACTICE_PHONE = "(312) 555-0142";

export const PLAYBOOK: Record<TriggerId, GatePlay> = {
  t1: {
    caseId: "timely-filing",
    who: "No patient contact if no statement has gone out. If one has, the patient.",
    channel: "None and a staff task. If a statement already went out: SMS with consent, otherwise email, otherwise letter.",
    when: "The day the remit posts. The account is removed from the next statement run.",
    messages: [
      {
        when: "Only if a statement already went out",
        channel: "SMS or email",
        text: `Northfield Medical Group: the $318.00 bill for your Feb 3 visit should not have been sent to you. You do not owe it, so please don't pay it. If you already paid, we will refund you. Questions? Reply here or call ${PRACTICE_PHONE}.`,
      },
    ],
    replies: [
      { reply: "PAID", result: "Staff task to refund. The patient gets a confirmation with the refund amount and date." },
      { reply: "Anything else", result: "Goes to the billing staff queue with the account and the CO code attached." },
    ],
    staffTask:
      "Work the denial, not the patient. CO-16: correct and resubmit. CO-197: request retro authorization if the payer allows it, otherwise write off. CO-29: appeal with proof of timely filing, otherwise write off.",
  },
  t2: {
    caseId: "new-insurance",
    who: "The patient.",
    channel: "SMS with consent, otherwise email, otherwise letter.",
    when: "Within 2 business days of the PR-27 remit, before the first statement. Coverage discovery runs first; the message only goes if it finds nothing.",
    messages: [
      {
        when: "First contact",
        channel: "SMS or email",
        text: "Northfield Medical Group: your insurer says your plan ended before your Aug 12 visit, so we have not sent you a bill yet. If you have other insurance, reply NEW and we'll send a secure link to add it. If you had no coverage that day, reply NONE.",
      },
    ],
    replies: [
      { reply: "NEW", result: "Secure link to photograph the card. An eligibility check runs on submit, the claim is refiled to the new plan, and the account stays on hold until it adjudicates." },
      { reply: "NONE", result: "The statement goes out with the self-pay plan options and the financial assistance program on it." },
      { reply: "No reply in 14 days", result: "One reminder, then the statement goes out with a line asking about other coverage." },
    ],
    staffTask: "Only if the new plan rejects the refiled claim or the patient asks for a call.",
  },
  t3: {
    caseId: "qmb",
    who: "No patient contact if no statement has gone out. If one has, the patient.",
    channel: "None and a staff task. If a statement already went out: the patient's preferred channel, including a staff phone call for voice.",
    when: "The day the eligibility response or remit shows QMB. The account is removed from every statement run.",
    messages: [
      {
        when: "Only if a statement already went out",
        channel: "SMS or email",
        text: `Northfield Medical Group: please disregard our $94.18 bill. Because you have Medicare and Medicaid (QMB), you do not owe this amount. We are correcting your account. Please do not send payment. Questions: ${PRACTICE_PHONE}.`,
      },
    ],
    replies: [
      { reply: "PAID", result: "Staff task to refund in full." },
      { reply: "Anything else", result: "Goes to the billing staff queue." },
    ],
    staffTask:
      "Add Medicaid as secondary and bill the crossover claim. Write off any Medicare cost-sharing Medicaid does not pay. Flag the patient as QMB so future cost-sharing never reaches a statement.",
  },
  t4: {
    caseId: "surprise-bill",
    who: "The patient.",
    channel: "Email, or letter without an email address. A short SMS notice if the patient has text consent.",
    when: "Before the first statement, once the EOB shows the in-network cost share.",
    messages: [
      {
        when: "First contact",
        channel: "SMS or email",
        text: "Northfield Medical Group: your bill for anesthesia on Aug 27 will be $420.00, not $2,310.00. Federal surprise-billing rules limit you to your in-network share. A corrected statement will follow. Nothing is due until you receive it.",
      },
    ],
    replies: [
      { reply: "PLAN", result: "Payment plan options on the corrected $420.00, inside practice policy." },
      { reply: "Anything else", result: "Goes to the billing staff queue." },
    ],
    staffTask:
      "Reduce the balance to the in-network cost share on the EOB. Any disagreement about the plan's out-of-network payment is between the practice and the plan (open negotiation, then federal independent dispute resolution), never the patient.",
  },
  t5: {
    caseId: "unposted-copay",
    who: "No patient contact if the payment covers the balance and no statement has gone out. Otherwise the patient.",
    channel: "None and a staff task, or SMS with consent, otherwise email, otherwise letter.",
    when: "Before the next statement run. Staff apply the payment first; the message reflects the corrected balance.",
    messages: [
      {
        when: "Payment covers the balance, statement already sent",
        channel: "SMS or email",
        text: "Northfield Medical Group: we found your $40.00 payment from Sep 3 and applied it. Your balance for that visit is now $0.00. Sorry for the earlier bill. You do not need to do anything.",
      },
      {
        when: "Payment covers part of the balance",
        channel: "SMS or email",
        text: "Northfield Medical Group: we found your $40.00 payment from Sep 3 and applied it to your visit. Your remaining balance is $24.31. A corrected statement will follow. Reply PLAN if you'd like to spread it out.",
      },
    ],
    replies: [
      { reply: "PLAN", result: "Plan options on the corrected balance, inside practice policy." },
      { reply: "Anything else", result: "Goes to the billing staff queue with the payment ID attached." },
    ],
    staffTask: "Apply the payment to the open charge using the payment ID. Confirm the account closes or shows the corrected balance before anything is sent.",
  },
  t6: {
    caseId: "work-injury",
    who: "The patient.",
    channel: "SMS with consent, otherwise email, otherwise letter.",
    when: "Within 2 business days of adjudication or the CO-19 denial, before any statement.",
    messages: [
      {
        when: "Intake says work-related",
        channel: "SMS or email",
        text: "Northfield Medical Group: your Sep 25 visit was marked as a work injury, so it should be billed to your employer's workers' comp insurer, not to you. Reply with the insurer's name and claim number, or reply CALL and we'll phone you. No payment is due.",
      },
      {
        when: "Intake says accident-related",
        channel: "SMS or email",
        text: "Northfield Medical Group: your visit was marked as related to an accident. If an auto or other insurer is covering it, reply with the insurer's name and claim number. If not, reply NONE. No payment is due right now.",
      },
    ],
    replies: [
      { reply: "Insurer and claim number", result: "Staff task to bill that carrier. The account stays on hold." },
      { reply: "NONE (accident only)", result: "The health plan's claim stands. The normal statement goes out." },
      { reply: "CALL", result: "Staff callback within 1 business day." },
    ],
    staffTask: "Bill the workers' compensation or auto carrier. If the patient has no claim number, contact the employer named on the intake form.",
  },
  t7: {
    caseId: "deceased",
    who: "No outbound message. Staff contact the family.",
    channel: "None. Staff task.",
    when: "The same day the signal appears. Every scheduled statement, text and call on every account for that patient is cancelled.",
    messages: [
      {
        when: "Only as a reply, when a family member wrote in",
        channel: "Reply on the same channel",
        text: "We are very sorry for your loss. We have stopped all billing messages about Robert's account. A member of our billing team will contact you within two business days. You do not need to do anything now.",
      },
    ],
    replies: [{ reply: "Any reply", result: "Goes straight to the named staff member. No automated answer." }],
    staffTask:
      "A named staff member calls within 2 business days, marks the account, and explains how the practice handles estate accounts. No request for payment. Who is responsible depends on the estate and on state law, so staff do not give that answer.",
  },
};
