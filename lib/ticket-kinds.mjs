// Ticket kinds and the handoff test. No server imports, so pages can use this in the browser.

export const TICKET_KINDS = {
  refile_insurance: "Refile to new insurance",
  add_secondary: "Add secondary coverage",
  apply_payment: "Apply unapplied payment",
  rebill_liability: "Rebill liable carrier",
  write_off: "Write off or appeal",
  correct_balance: "Correct patient share",
  financial_assistance: "Take assistance application",
  charge_review: "Review disputed charge",
  bereavement: "Patient deceased",
  other: "Other",
};

/** True when the conversation produced something staff must pick up. */
export function needsTicket(transcript) {
  return transcript.some((t) => t.role === "agent" && (t.actions ?? []).includes("handoff_to_staff"));
}
