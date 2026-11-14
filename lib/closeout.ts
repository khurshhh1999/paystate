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
  const name = firstName(ticket.patient);
  const amount = usd(ticket.amount);
  const balance = usd(ticket.balance);
  const remaining = usd(Math.max(0, ticket.balance - ticket.amount));
  const hi = `${PREFIX} Hi ${name},`;

  switch (ticket.kind) {
    case "refile_insurance":
      return [
        {
          id: "refiled",
          label: "Claim refiled to the new insurer",
          message: `${hi} we sent the claim for your visit to your new insurance. You do not owe the ${amount} on your statement now. If they leave a balance after processing, we will send you a new statement. Nothing to do for now.`,
        },
        {
          id: "not-active",
          label: "New coverage not active on the visit date",
          message: `${hi} we could not confirm your new insurance was active on the date of your visit, so the ${amount} is still open. Please call us at the number on your statement so we can check the coverage with you. Your account stays on hold until we talk.`,
        },
      ];

    case "add_secondary": {
      const coverage = mentions(ticket, "medicaid") ? "your Medicaid coverage" : "your secondary insurance";
      return [
        {
          id: "added",
          label: "Secondary added and billed, balance cleared",
          message: `${hi} we added ${coverage} to your account and billed it for the ${amount}. You do not owe this. Your balance is now ${remaining}, and you can ignore the statement.`,
        },
        {
          id: "need-member-id",
          label: "Coverage not found, member number needed",
          message: `${hi} we could not find ${coverage} with the details we have. Please reply with your member number or a photo of your card. Your account stays on hold, so you do not need to pay the ${amount} while we sort this out.`,
        },
      ];
    }

    case "apply_payment":
      return [
        {
          id: "applied",
          label: "Payment applied, balance $0",
          message: `${hi} we found your ${amount} payment and applied it to your visit. Your balance is now ${remaining}. You can ignore the statement.`,
        },
        {
          id: "not-found",
          label: "Payment not found",
          message: `${hi} we could not find your ${amount} payment in our records yet. Please reply with a photo of your receipt or the card statement showing the charge. Your account stays on hold, so no statements or reminders go out while we look.`,
        },
      ];

    case "rebill_liability":
      return [
        {
          id: "billed-carrier",
          label: "Billed to the liable carrier",
          message: `${hi} we billed your employer's workers' compensation carrier for your visit. You do not owe the ${amount}. Your account stays on hold until they respond, so you will not get statements in the meantime. Nothing to do for now.`,
        },
      ];

    case "write_off":
      return [
        {
          id: "written-off",
          label: "Written off, balance $0",
          message: `${hi} the ${amount} on your statement came from a billing error on our side, so we removed it. You do not owe it. Your balance is now ${remaining}. Nothing to do.`,
        },
        {
          id: "appealed",
          label: "Appealed to the payer",
          message: `${hi} we have appealed the ${amount} with your insurance. Your account stays on hold while they review it, and you do not owe anything during the review. We will text you when we hear back.`,
        },
      ];

    case "correct_balance": {
      const owed = Math.max(0, ticket.balance - ticket.amount);
      return [
        {
          id: "corrected",
          label: "Balance corrected",
          message:
            owed > 0
              ? `${hi} we corrected your balance. We removed ${amount}, and the amount you owe is now ${usd(owed)}. A new statement with that amount will follow.${planOffer(owed)}`
              : `${hi} we corrected your balance. We removed ${amount}, and you now owe nothing. You can ignore the statement.`,
        },
        {
          id: "reprocess",
          label: "Sent to the payer to reprocess",
          message: `${hi} we asked your insurance to reprocess the claim for the ${amount} that should not be billed to you. Your account stays on hold while they do, and you do not need to pay anything until we text you the result.`,
        },
      ];
    }

    case "financial_assistance":
      return [
        {
          id: "application-sent",
          label: "Application sent to the patient",
          message: `${hi} we sent you our financial assistance application. Please send it back with your household size and proof of income, such as recent pay stubs, an unemployment letter or last year's tax return. Your account stays on hold while you apply, so you do not need to pay the ${amount} now.`,
        },
        {
          id: "approved",
          label: "Approved, balance adjusted",
          message: `${hi} your financial assistance application was approved. Your balance of ${balance} is now ${BLANK_AMOUNT}. A new statement with the new amount will follow.`,
        },
      ];

    case "charge_review":
      return [
        {
          id: "upheld",
          label: "Charge upheld after review",
          message: `${hi} we reviewed the ${amount} charge. Your visit note shows a separate problem was examined and treated at the same visit as your checkup, and your plan bills that as its own visit with a copay, so the ${amount} stands. We are sorry this was not explained at the time.${planOffer(ticket.amount)}`,
        },
        {
          id: "courtesy",
          label: "Charge removed as a courtesy",
          message: `${hi} we removed the ${amount} charge as a courtesy. Your balance is now ${remaining}. Nothing to do.`,
        },
      ];

    case "bereavement":
      return [
        {
          id: "called-family",
          label: "Called the family, account marked deceased",
          message: null,
          note: "No text is sent for this ticket. This one is a phone call.",
        },
      ];

    case "other":
    default:
      return [
        {
          id: "resolved",
          label: "Resolved, patient informed",
          message: `${hi} we have finished looking into your account. Your balance is ${balance}. Call us at the number on your statement if you have questions.`,
        },
      ];
  }
}
