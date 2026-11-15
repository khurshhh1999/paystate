// Ordering and naming for the queue list.

import type { Ticket } from "@/lib/types";
import type { Closure } from "@/components/ticket-store";

/** "Marcus Bell, 38" -> "Marcus Bell". "Carol Hensley, spouse of ..." -> "Carol Hensley". */
export function patientName(patient: string) {
  return patient.split(",")[0].trim();
}

/**
 * One ticket per patient. A conversation in this browser replaces the recorded ticket for
 * the same case, and only the newest of this browser's tickets for a case is kept.
 */
export function currentTickets(live: Ticket[], recorded: Ticket[]) {
  const seen = new Set<string>();
  const mine: Ticket[] = [];
  for (const t of live) {
    if (seen.has(t.caseId)) continue;
    seen.add(t.caseId);
    mine.push(t);
  }
  return { live: mine, recorded: recorded.filter((t) => !seen.has(t.caseId)) };
}

/**
 * Open tickets: this browser's own (newest first, as the store keeps them) on top so the
 * visitor finds their conversation, then recorded ones oldest first, the way staff work them.
 */
export function openTickets(live: Ticket[], recorded: Ticket[], closures: Record<string, Closure>) {
  const isOpen = (t: Ticket) => !closures[t.id];
  const byAge = [...recorded].filter(isOpen).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  return [...live.filter(isOpen), ...byAge];
}

/** Closed tickets, most recently closed first. */
export function closedTickets(all: Ticket[], closures: Record<string, Closure>) {
  return all
    .filter((t) => closures[t.id])
    .sort((a, b) => closures[b.id].closedAt.localeCompare(closures[a.id].closedAt));
}

/**
 * What the patient was told, worded to follow "Patient was told". The ticket writer sometimes
 * starts the sentence with "Told ..." or "The assistant told him ...", which would say it twice.
 * `clause` is true when the lead-in was removed and the rest continues the label.
 */
export function toldPatient(text: string): { text: string; clause: boolean } {
  const trimmed = text.trim();
  const rest = trimmed.replace(
    /^(?:the (?:assistant|patient) )?(?:was |were |has been |have been )?told(?: (?:him|her|them|the patient))?(?: that)?[:,]?\s+/i,
    "",
  );
  if (rest === trimmed || !rest) return { text: trimmed, clause: false };
  return { text: rest, clause: true };
}
