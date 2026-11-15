// Client-side calls to the bench API. Errors carry the server message so it can be shown inline.

import type { Trial, Verdict } from "@/lib/types";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
  /** A usage limit, not a failure: the message says when live runs open again. */
  get limited(): boolean {
    return this.status === 429;
  }
}

export function isLimited(err: unknown): boolean {
  return err instanceof ApiError && err.limited;
}

export async function postJSON<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError("Could not reach the server. Check your connection and try again.");
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // fall through with null body
  }
  if (!res.ok) {
    const msg =
      data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Request failed with status ${res.status}.`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export type RunCaseResponse = Trial;
export type JudgeResponse = Verdict;
