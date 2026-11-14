import type { TicketKind, Turn } from "./types";
export const TICKET_KINDS: Record<TicketKind, string>;
export function needsTicket(transcript: Turn[]): boolean;
