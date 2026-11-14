import type { Action, Gate } from "./types";
export const COLLECT_ACTIONS: Action[];
export function paymentGate(record: Record<string, unknown>): Omit<Gate, "removed">;
export function enforceGate(actions: Action[], gate: Pick<Gate, "status">): { actions: Action[]; removed: Action[] };
