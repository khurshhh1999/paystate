"use client";
// Tickets created by conversations in this browser, and what staff have done with any ticket.
// Kept in localStorage so the patient thread and the staff queue share them across pages.
// Nothing here leaves the browser.

import { useSyncExternalStore } from "react";
import type { Ticket } from "@/lib/types";

const TICKETS_KEY = "pas.tickets.v1";
const CLOSED_KEY = "pas.closed.v1";
const EVENT = "pas:tickets";

export interface Closure {
  resolution: string; // id of the resolution staff picked
  message: string; // the text sent to the patient
  closedAt: string; // ISO
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage is full or blocked. The page still works for this visit.
  }
  cache.delete(key);
  window.dispatchEvent(new Event(EVENT));
}

// useSyncExternalStore needs the same object back until the data changes.
const cache = new Map<string, unknown>();
function snapshot<T>(key: string, fallback: T): T {
  if (!cache.has(key)) cache.set(key, read(key, fallback));
  return cache.get(key) as T;
}

function subscribe(onChange: () => void) {
  const handler = () => {
    cache.clear();
    onChange();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

const NO_TICKETS: Ticket[] = [];
const NO_CLOSURES: Record<string, Closure> = {};

/** Tickets from conversations in this browser, newest first. Empty on the server and on first paint. */
export function useLiveTickets(): Ticket[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot<Ticket[]>(TICKETS_KEY, NO_TICKETS),
    () => NO_TICKETS,
  );
}

/** Closures by ticket id, for recorded and live tickets alike. */
export function useClosures(): Record<string, Closure> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot<Record<string, Closure>>(CLOSED_KEY, NO_CLOSURES),
    () => NO_CLOSURES,
  );
}

/** Adds a ticket, or replaces the one with the same id (a conversation that hands off twice keeps one ticket). */
export function saveTicket(ticket: Ticket) {
  const rest = read<Ticket[]>(TICKETS_KEY, []).filter((t) => t.id !== ticket.id);
  write(TICKETS_KEY, [ticket, ...rest].slice(0, 30));
}

export function closeTicket(id: string, closure: Closure) {
  write(CLOSED_KEY, { ...read<Record<string, Closure>>(CLOSED_KEY, {}), [id]: closure });
}

export function reopenTicket(id: string) {
  const all = { ...read<Record<string, Closure>>(CLOSED_KEY, {}) };
  delete all[id];
  write(CLOSED_KEY, all);
}

/** Clears everything this browser added: live tickets and all closures. */
export function resetQueue() {
  write(TICKETS_KEY, []);
  write(CLOSED_KEY, {});
}
