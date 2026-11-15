// How staff can close each kind of ticket, and the text the patient gets for each outcome.
// Messages only state what staff did and what the patient now owes. They never predict
// what an insurer or carrier will decide.

import type { Ticket } from "./types";

export interface Resolution {
  id: string;
  label: string;
  message: string | null; // null: nothing is texted for this outcome
  note?: string; // shown in place of the message when there is none
}

// Left in a message for the biller to replace before sending.
export const BLANK_AMOUNT = "$____";

const PREFIX = "Northfield Medical Group:";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function firstName(patient: string) {
  return patient.trim().split(/[\s,]+/)[0] || "there";
}

function mentions(ticket: Ticket, word: string) {
  const text = [ticket.reason, ticket.next_step, ...ticket.captured.map((c) => `${c.label} ${c.value}`)].join(" ");
  return text.toLowerCase().includes(word.toLowerCase());
}

// Payment plans are pre-approved for balances of $100 or more: up to 12 months, at least $25 a month.
function planOffer(owed: number) {
  if (owed >= 100) {
    return " If that is hard to pay at once, you can split it into up to 12 monthly payments of at least $25. Reply PLAN and we will set it up.";
  }
  return " You can pay it with your next statement, or call us if you need more time.";
}

export function resolutionsFor(ticket: Ticket): Resolution[] {
  const options = baseResolutions(ticket);
  // A credit the patient asked to have back. EXTRA_POLICY.texts_and_documents in
  // lib/cases-common.mjs: staff refund credits to the original payment method within 30 days.
  if (mentions(ticket, "refund")) {
    options.unshift({
      id: "refunded",
      label: "Credit refunded",
      message: `${PREFIX} Hi ${firstName(ticket.patient)}, we are refunding your ${usd(ticket.amount)} credit to the card or account you paid with. We send refunds within 30 days. You do not need to do anything.`,
    });
  }
  return options;
}

function baseResolutions(ticket: Ticket): Resolution[] {
  const name = firstName(ticket.patient);
  const amount = usd(ticket.amount);
  const balance = usd(ticket.balance);
  const owed = Math.max(0, ticket.balance - ticket.amount);
  const remaining = usd(owed);
  const hi = `${PREFIX} Hi ${name},`;

  switch (ticket.kind) {
    case "refile_insurance":
      return [
        {
          id: "refiled",
          label: "Claim refiled to the new insurer",
          message: `${hi} we sent the claim for your visit to your new insurance. Please do not pay the ${amount} on your statement. If anything is left for you to pay after they process it, we will send you a new statement.`,
        },
        {
          id: "not-active",
          label: "New coverage not active on the visit date",
          message: `${hi} we checked with your new insurance, and it was not active on the date of your visit, so we could not bill it. Please call us at the number on your statement so we can go over your coverage with you. Your account stays on hold until we talk.`,
        },
      ];

    case "add_secondary": {
      const medicaid = mentions(ticket, "medicaid");
      // QMB: federal rules bar billing the patient for Medicare cost sharing, so the practice
      // can say so outright. Any other secondary may still leave the patient a share.
      const qmb = mentions(ticket, "qmb");
      const coverage = medicaid ? "your Medicaid coverage" : "your secondary insurance";
      return [
        qmb
          ? {
              id: "added",
              label: "Medicaid added and billed, balance cleared",
              message: `${hi} we added ${coverage} to your account and billed it for the ${amount}. With Medicare and this Medicaid coverage, we cannot bill you for this amount, and we will not send it to collections. Your balance is now ${remaining}, so you can ignore the statement.`,
            }
          : {
              id: "added",
              label: "Secondary added and billed",
              message: `${hi} we added ${coverage} to your account and billed it for the ${amount}. Please do not pay this amount while they process the claim. We will not send it to collections while that claim is open. If anything is left for you to pay afterwards, we will send you a new statement.`,
            },
        {
          id: "need-member-id",
          label: "Member number needed from the patient",
          message: `${hi} we need ${medicaid ? "your Medicaid member number" : "the member number for your secondary insurance"} to add it to your account. Please reply with the number or a photo of your card. Your account stays on hold, so please do not pay the ${amount} while we sort this out.`,
        },
      ];
    }

    case "apply_payment": {
      const applied: Resolution = {
        id: "applied",
        label: "Payment applied",
        message: `${hi} we found your ${amount} payment and applied it to your visit. Your balance is now ${remaining}, so you can ignore the statement. Sorry for the mix-up.`,
      };
      // When the ticket already cites the receipt, the payment is on file: asking the
      // patient for proof would be wrong.
      if (mentions(ticket, "receipt")) return [applied];
      return [
        applied,
        {
          id: "not-found",
          label: "Payment not found yet",
          message: `${hi} we have not found your ${amount} payment in our records yet. Please reply with a photo of your receipt or the card statement showing the charge. Your account stays on hold while we look, so no statements or reminders will go out.`,
        },
      ];
    }

    case "rebill_liability": {
      const workersComp = mentions(ticket, "workers");
      return [
        {
          id: "billed-carrier",
          label: workersComp ? "Billed to the workers' comp carrier" : "Billed to the liable carrier",
          message: `${hi} we sent the bill for your visit to ${workersComp ? "your employer's workers' compensation carrier" : "the insurer responsible for your injury"}. Please do not pay the ${amount}. Your account stays on hold while they process it, so no statements will go out. We will text you if we need anything from you.`,
        },
      ];
    }

    case "write_off": {
      const lateFiling = mentions(ticket, "CO-29") || mentions(ticket, "timely") || mentions(ticket, "late filing");
      const why = lateFiling
        ? "your insurance denied the claim for your visit because we sent it to them too late. That was our mistake, so we removed"
        : "the charge on your statement came from a billing error on our side, so we removed";
      return [
        {
          id: "written-off",
          label: "Written off",
          message: `${hi} ${why} the ${amount}. You do not owe it, and your balance is now ${remaining}.`,
        },
        {
          id: "appealed",
          label: "Appealed to the payer",
          message: `${hi} we have asked your insurance to reconsider the claim for your visit. Whatever they decide, we will not bill you for the ${amount}. Your account stays on hold while they review it, so no statements will go out.`,
        },
      ];
    }

    case "correct_balance":
      return [
        {
          id: "corrected",
          label: "Balance corrected",
          message:
            owed > 0
              ? `${hi} we corrected your balance. Of the ${balance} on your statement, you owe ${remaining}, the share your insurance set for you. We removed the other ${amount}, and a new statement for ${remaining} will follow.${planOffer(owed)}`
              : `${hi} we corrected your balance and removed the ${amount}. You owe nothing for this visit, so you can ignore the statement.`,
        },
        {
          id: "settling",
          label: "Being settled with the insurer",
          message: `${hi} we are working out ${owed > 0 ? `${amount} of the ${balance}` : `the ${amount}`} on your statement with your insurance, and we will not bill you for it.${owed > 0 ? ` We will not bill you more than ${remaining} for this visit.` : ""} Your account stays on hold until this is done, so please do not pay yet. We will text you the final amount.`,
        },
      ];

    case "financial_assistance":
      return [
        {
          id: "application-taken",
          label: "Application taken, decision to follow",
          message: `${hi} thank you for going through the financial assistance application with us. We will text you when there is a decision. Your account stays on hold until then, so you do not need to pay the ${amount} now.`,
        },
        {
          id: "application-sent",
          label: "Could not reach, application sent",
          message: `${hi} we tried to reach you about financial assistance and have sent you the application. Please send it back with your household size and proof of income, such as recent pay stubs, an unemployment letter or last year's tax return. Your account stays on hold while you apply, so you do not need to pay the ${amount} now.`,
        },
        {
          id: "approved",
          label: "Approved, balance adjusted",
          message: `${hi} your financial assistance application was approved. Your balance of ${balance} is now ${BLANK_AMOUNT}, and we will send you a new statement for that amount.`,
        },
      ];

    case "charge_review": {
      // A problem visit billed alongside a preventive one (modifier 25) is the usual dispute.
      const sameDayVisit = mentions(ticket, "-25") || mentions(ticket, "preventive");
      const why = sameDayVisit
        ? `Your checkup itself was covered in full. At the same visit the doctor also examined a separate problem. We billed that as its own office visit, and your plan applies its copay to it, so the ${amount} is correct. We are sorry no one explained this at the time.`
        : `It was billed correctly, so it stays on your account.`;
      return [
        {
          id: "upheld",
          label: "Charge upheld after review",
          message: `${hi} we reviewed the ${amount} charge. ${why}${planOffer(ticket.amount)}`,
        },
        {
          id: "courtesy",
          label: "Charge removed as a courtesy",
          message: `${hi} we reviewed the ${amount} charge and removed it as a courtesy. Your balance is now ${remaining}.`,
        },
      ];
    }

    case "bereavement":
      return [
        {
          id: "called-family",
          label: "Called the family, account marked deceased",
          message: null,
          note: "No text goes out for this ticket. Staff speak with the family by phone.",
        },
      ];

    case "other":
    default:
      return [
        {
          id: "resolved",
          label: "Resolved, patient informed",
          message: `${hi} we have finished looking into your account. Your balance is ${balance}. If you have questions, call us at the number on your statement.`,
        },
      ];
  }
}
