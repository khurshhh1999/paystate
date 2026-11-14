export function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
  thinking?: Record<string, unknown>;
  effort?: "low" | "medium" | "high" | "max";
}): Promise<string>;
export function callStats(): { calls: number };
export function setCallCap(n: number | null): void;
