export const PER_IP_LIMIT: number;
export const PER_IP_WINDOW_MS: number;
export const GLOBAL_DAILY_LIMIT: number;
export function clientIp(headers: Headers): string;
export function checkLimits(
  ip: string,
  now?: number
): { ok: true } | { ok: false; retryAfterSeconds: number; message: string };
export function resetLimits(): void;
