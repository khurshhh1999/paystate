// The statement text each patient has just received, and how each one appears in the picker.
// Amounts and dates match the case records in lib/cases.mjs.

import type { Case } from "@/lib/types";

export const STATEMENT_TEXT: Record<string, string> = {
  "timely-filing":
    "Northfield Medical Group: Angela, your balance for your Feb 3 visit is $318.00. Reply here with questions or to set up payments.",
  deductible:
    "Northfield Medical Group: Dana, your balance for your Sep 18 MRI is $612.40. Reply here with questions or to set up payments.",
  qmb: "Northfield Medical Group: Eleanor, your balance for your Sep 3 visit is $94.18. Reply here with questions or to set up payments.",
  "unposted-copay":
    "Northfield Medical Group: Sam, your balance for your Sep 3 visit is $40.00. Reply here with questions or to set up payments.",
  hardship:
    "Northfield Medical Group: Marcus, your balance for your visits from Jul 8 to Aug 19 is $1,840.00. This is your third statement. Reply here with questions or to set up payments.",
  "new-insurance":
    "Northfield Medical Group: Tyler, your balance for your Aug 12 visit is $386.00. Reply here with questions or to set up payments.",
  spanish:
    "Northfield Medical Group: Marisol, your balance for the Oct 1 visit is $264.00. Reply here with questions or to set up payments.",
  "surprise-bill":
    "Northfield Medical Group: Jordan, your balance for anesthesia on Aug 27 is $2,310.00. Reply here with questions or to set up payments.",
  "plan-change":
    "Northfield Medical Group: Priya, your balance for your Feb 11 visit is $148.20. Reply here with questions or to set up payments.",
  "work-injury":
    "Northfield Medical Group: Luis, your balance for your Sep 25 visit is $742.00. Reply here with questions or to set up payments.",
  preventive:
    "Northfield Medical Group: Renee, your balance for your Sep 10 visit is $35.00. Reply here with questions or to set up payments.",
  deceased:
    "Northfield Medical Group: Reminder for Robert: a balance of $1,126.00 for visits from Aug 4 to Sep 22 is past due. Reply here with questions or to set up payments.",
};

// Picker order. Mixed on purpose so the list does not group by whether the bill is right.
export const PATIENT_ORDER = [
  "timely-filing",
  "deductible",
  "qmb",
  "unposted-copay",
  "hardship",
  "new-insurance",
  "spanish",
  "surprise-bill",
  "plan-change",
  "work-injury",
  "preventive",
  "deceased",
];

// Who they are, without saying whether the bill is right.
export const SITUATION: Record<string, string> = {
  "timely-filing": "Got a bill for a February visit and wants to pay it",
  deductible: "Has insurance and got a bill for a knee MRI",
  qmb: "On Medicare and Medicaid, offers $20 a month",
  "unposted-copay": "Says the copay was paid at the front desk",
  hardship: "Lost his job in September",
  "new-insurance": "Has had insurance through a new job since July",
  spanish: "Writes in Spanish and asks to pay in parts",
  "surprise-bill": "Had surgery at an in-network hospital, billed for anesthesia",
  "plan-change": "Used to pay $30 for this visit",
  "work-injury": "Hurt his shoulder at work",
  preventive: "Billed after an annual physical",
  deceased: "Her late husband's reminders still come to her phone",
};

/** "Angela Brooks, 60" -> "Angela Brooks". The deceased case reads "Carol Hensley". */
export function patientName(kase: Case): string {
  return kase.patient.split(",")[0].trim();
}
