// Ordering and naming for the queue list.

import type { Ticket } from "@/lib/types";
import type { Closure } from "@/components/ticket-store";

/** "Marcus Bell, 38" -> "Marcus Bell". "Carol Hensley, spouse of ..." -> "Carol Hensley". */
export function patientName(patient: string) {
  return patient.split(",")[0].trim();
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
