export function budgets(env?: Record<string, string | undefined>): { total: number; custom: number };
export function costOf(model: string, usage: Record<string, number> | undefined): number;
export function checkBudget(
  opts?: { custom?: boolean },
  now?: number,
  env?: Record<string, string | undefined>,
): Promise<{ ok: true } | { ok: false; scope: "total" | "custom"; retryAfterSeconds: number }>;
export function recordSpend(usd: number, opts?: { custom?: boolean }, now?: number): Promise<void>;
export function charged<T>(custom: boolean, fn: () => Promise<T>): Promise<T>;
export function reportUsage(model: string, usage: Record<string, number> | undefined): Promise<void>;
export function setBudgetStore(store?: { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void> }): void;
