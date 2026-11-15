import type { Case, Turn, View } from "./types";

export const MAX_BODY_BYTES: number;
export const MAX_CUSTOM_PROMPT: number;
export const MAX_PATIENT_MESSAGE: number;
export const MAX_AGENT_MESSAGE: number;
export const MAX_TURNS: number;

export class ApiError extends Error {
  status: number;
  headers: Record<string, string>;
  constructor(status: number, message: string, headers?: Record<string, string>);
}

export function checkRequestShape(req: {
  contentType: string | null | undefined;
  origin: string | null | undefined;
  host: string | null | undefined;
  contentLength?: string | null;
}): void;
export function parseBody(text: string): Record<string, unknown>;
export function resolveCase(body: Record<string, unknown>): Case;
export function resolveView(body: Record<string, unknown>): View;

export type ResolvedAgent =
  | { kind: "product" }
  | { kind: "saved"; systemPrompt: string }
  | { kind: "custom"; systemPrompt: string };
export function resolveAgent(
  body: Record<string, unknown>,
  opts: { allowProduct: false }
): Exclude<ResolvedAgent, { kind: "product" }>;
export function resolveAgent(body: Record<string, unknown>, opts?: { allowProduct?: boolean }): ResolvedAgent;
export function validateTranscript(raw: unknown, endsWith: "patient" | "agent"): Turn[];
