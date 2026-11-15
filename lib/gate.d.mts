import type { Action, Gate } from "./types";
export const COLLECT_ACTIONS: Action[];
export function paymentGate(record: Record<string, unknown>): Omit<Gate, "removed">;
export function eobPatientShare(record: Record<string, unknown>): number | null;
export function enforceGate(
  actions: Action[],
  gate: Pick<Gate, "status"> & { block?: boolean },
): { actions: Action[]; removed: Action[] };
