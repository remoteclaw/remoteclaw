// pi-embedded: Stub module (original removed after AgentRuntime migration)
// Retained as minimal type-compatible stubs for test files that import from this module.

export function abortEmbeddedPiRun(_sessionId: string): boolean {
  return false;
}

export async function runEmbeddedPiAgent(
  ..._args: unknown[]
): Promise<{
  payloads: Array<Record<string, unknown>>;
  meta: {
    durationMs: number;
    agentMeta?: {
      sessionId?: string;
      provider?: string;
      model?: string;
    };
  };
  didSendViaMessagingTool?: boolean;
  messagingToolSentTargets?: Array<{ tool: string; provider: string; to: string }>;
}> {
  throw new Error("runEmbeddedPiAgent is not available (pi-embedded removed)");
}

export function queueEmbeddedPiMessage(..._args: unknown[]): boolean {
  return false;
}

export function resolveEmbeddedSessionLane(key: string): string {
  return `session:${key.trim() || "main"}`;
}

export function isEmbeddedPiRunActive(..._args: unknown[]): boolean {
  return false;
}

export function isEmbeddedPiRunStreaming(..._args: unknown[]): boolean {
  return false;
}

export async function compactEmbeddedPiSession(
  ..._args: unknown[]
): Promise<{ ok: boolean; compacted: boolean }> {
  return { ok: false, compacted: false };
}

export async function waitForEmbeddedPiRunEnd(..._args: unknown[]): Promise<void> {
  // no-op: pi-embedded removed
}
