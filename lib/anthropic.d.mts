export function callClaude(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  model?: string;
  temperature?: number;
  thinking?: Record<string, unknown>;
}): Promise<string>;
