// A handoff as billing staff receive it. The agent's conversation already holds everything
// staff need; this turns it into a work item so nobody has to read the thread or call the
// patient back to ask what they already said.

import { callClaude } from "./anthropic.mjs";
import { PRACTICE_POLICY } from "./cases.mjs";
import { TICKET_KINDS, needsTicket } from "./ticket-kinds.mjs";

export { TICKET_KINDS, needsTicket };

export const TICKET_SYSTEM = `You write the work item that billing staff receive when an automated billing assistant hands a patient conversation to them. You are given the practice policy, the account record and the transcript with the actions the assistant took.

Staff should be able to act from the work item alone, without reading the transcript and without contacting the patient to ask for anything the patient already said.

Return only a JSON object, no prose, no code fence:
{
  "kind": one of ${Object.keys(TICKET_KINDS).map((k) => `"${k}"`).join(", ")},
  "amount": the dollars in question, as a number,
  "reason": "one sentence, under 30 words: why this needs a person, naming the fact in the record that decides it (reason code, date, ledger line)",
  "told_patient": "one sentence, under 30 words: what the assistant has already told the patient to expect",
  "captured": [{"label": "short field name", "value": "exact value"}],
  "next_step": "one sentence, under 25 words, starting with a verb: the single thing staff should do first"
}

Rules:
- "captured" holds only details the patient gave in the conversation or that staff need copied from the record to act: insurer name, member ID, group number, claim number, receipt number, dates, the amount the patient can afford. Copy identifiers exactly. Write dollar amounts with a dollar sign and two decimals ($318.00) and dates as they appear in the record. Four entries at most, the ones staff will type or look up. Use an empty list if there are none.
- Use only facts in the record and transcript. Never invent identifiers.
- Kinds: refile_insurance when the patient has other primary coverage to bill. add_secondary when existing secondary coverage or a Medicaid category is missing from the account. apply_payment when money was received and not applied. rebill_liability for workers' compensation, auto or other liability carriers. write_off when the practice's own error (late filing, contractual amount) made the balance. correct_balance when part of the balance is owed and part is not. financial_assistance when the patient cannot pay. charge_review when the patient disputes a correct charge and wants it looked at. bereavement when the patient has died.
- Write in plain language. No greetings.`;

export function buildTicketInput(kase, transcript) {
  const convo = transcript
    .map((t) =>
      t.role === "patient"
        ? `PATIENT: ${t.text}`
        : `ASSISTANT: ${t.text}\n[actions taken: ${t.actions && t.actions.length ? t.actions.join(", ") : "none"}]`
    )
    .join("\n\n");
  return `PRACTICE POLICY
${JSON.stringify(PRACTICE_POLICY, null, 2)}

ACCOUNT RECORD
Patient: ${kase.patient}
${JSON.stringify(kase.record, null, 2)}

TRANSCRIPT
${convo}`;
}

const clip = (v, n) => String(v ?? "").trim().slice(0, n);

export function parseTicket(raw) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Ticket writer returned no JSON: " + raw.slice(0, 200));
  const t = JSON.parse(m[0]);
  const kind = t.kind in TICKET_KINDS ? t.kind : "other";
  const amount = Number(t.amount);
  const captured = Array.isArray(t.captured)
    ? t.captured
        .filter((c) => c && typeof c === "object" && c.label && c.value)
        .slice(0, 8)
        .map((c) => ({ label: clip(c.label, 40), value: clip(c.value, 120) }))
    : [];
  if (!t.reason || !t.next_step) throw new Error("Ticket writer left out the reason or the next step.");
  return {
    kind,
    amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
    reason: clip(t.reason, 300),
    told_patient: clip(t.told_patient, 300),
    captured,
    next_step: clip(t.next_step, 300),
  };
}

/** Writes the work item for a conversation. Retries once if the output does not parse. */
export async function writeTicket(kase, transcript, model) {
  const input = buildTicketInput(kase, transcript);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callClaude({ system: TICKET_SYSTEM, user: input, maxTokens: 500, model });
    try {
      const body = parseTicket(raw);
      return {
        ...body,
        caseId: kase.id,
        patient: kase.patient,
        balance: kase.balance,
        hold: transcript.some((t) => t.role === "agent" && (t.actions ?? []).includes("place_hold")),
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
