// The page heading for each patient: who they are and what is actually going on with the bill.
// The payment gate on the practice side shows the same verdict, so nothing here is a spoiler.

export const HEADLINE: Record<string, { title: string; body: string }> = {
  "timely-filing": {
    title: "Angela wants to pay $318 she does not owe.",
    body: "Her doctor's office filed the claim 78 days late. The insurer denied it and the statement went out anyway. She would rather pay than argue.",
  },
  deductible: {
    title: "Dana has insurance and a $612.40 bill.",
    body: "Her plan allowed $612.40 for the MRI and put all of it toward a deductible she has not met. The bill is right. She wants to know why, and whether she can spread it out.",
  },
  qmb: {
    title: "Eleanor offers $20 a month for a bill she cannot be sent.",
    body: "She has Medicare and Medicaid, in a category the practice may not bill for Medicare coinsurance. Medicaid was never added to her account, and she is afraid of collections.",
  },
  "unposted-copay": {
    title: "Sam already paid this $40.",
    body: "He paid the copay by card at the front desk. It was taken before the charge existed, so it sits unapplied and the statement went out anyway.",
  },
  hardship: {
    title: "Marcus owes $1,840 and has no income.",
    body: "The bill is right. He lost his job in September and a payment plan will not help. The practice has a financial assistance program nobody has told him about.",
  },
  "new-insurance": {
    title: "Tyler was billed $386 because the claim went to his old insurer.",
    body: "That coverage ended in June. He has had a new plan through work since July, and the practice does not have it on file.",
  },
  spanish: {
    title: "Marisol owes $264 and asks, in Spanish, to pay in parts.",
    body: "The bill is right and the plan she wants is inside the practice's policy. Her account says her language is English.",
  },
  "surprise-bill": {
    title: "Jordan owes $420 of a $2,310 anesthesia bill.",
    body: "The hospital was in network and the anesthesiologist was not. Surprise-billing rules limit Jordan to the in-network share, which the insurer has already worked out.",
  },
  "plan-change": {
    title: "Priya's $30 visit now costs $148.20.",
    body: "Nothing is wrong with the bill. Her plan changed in January from a copay plan to a high-deductible one, and nobody explained what that does to an office visit.",
  },
  "work-injury": {
    title: "Luis was billed $742 for an injury at work.",
    body: "He marked it as a work injury at intake. The practice billed his health plan anyway, the plan denied it, and the balance landed on him.",
  },
  preventive: {
    title: "Renee's free physical came with a $35 bill.",
    body: "The physical was covered in full. She also mentioned knee pain, which was examined and billed as a separate visit with a copay. The charge is correct and she wants it reviewed.",
  },
  deceased: {
    title: "Carol's husband died in October. His billing reminders still come to her phone.",
    body: "Four have gone out since he died, because his record still says active. She wants them to stop, and she wants to know whether she has to pay.",
  },
};
