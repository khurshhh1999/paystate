export type Route = "chat" | "judge" | "ticket" | "run-case";
export const COST: Record<Route, number>;
export const ADDRESS_BURST: { units: number; windowMs: number };
export const ADDRESS_DAILY: { units: number; windowMs: number };
export const ADDRESS_CUSTOM_DAILY: { units: number; windowMs: number };
export const SAVED_DAILY_LIMIT: number;
export const CUSTOM_DAILY_LIMIT: number;
export function clientIp(headers: Headers): string;
export function checkLimits(
  ip: string,
  opts?: { units?: number; custom?: boolean },
  now?: number
): { ok: true } | { ok: false; scope: "address" | "site"; retryAfterSeconds: number; message: string };
export function usage(): { saved: number; custom: number };
export function resetLimits(now?: number): void;
export function formatWait(seconds: number): string;
