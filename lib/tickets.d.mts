import type { Case, Ticket, TicketKind, Turn } from "./types";
export type TicketBody = Pick<Ticket, "kind" | "amount" | "reason" | "told_patient" | "captured" | "next_step">;
export type WrittenTicket = TicketBody & Pick<Ticket, "caseId" | "patient" | "balance" | "hold">;
export const TICKET_KINDS: Record<TicketKind, string>;
export const TICKET_SYSTEM: string;
export function buildTicketInput(kase: Case, transcript: Turn[]): string;
export function parseTicket(raw: string): TicketBody;
export function needsTicket(transcript: Turn[]): boolean;
export function writeTicket(kase: Case, transcript: Turn[], model: string): Promise<WrittenTicket>;
