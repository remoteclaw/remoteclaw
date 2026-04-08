import { setCliSessionId } from "../../agents/cli-session.js";
import { isCliProvider } from "../../agents/provider-utils.js";
import { deriveSessionTotalTokens, hasNonzeroUsage } from "../../agents/usage.js";
import type { RemoteClawConfig } from "../../config/config.js";
import {
  mergeSessionEntry,
  setSessionRuntimeModel,
  type SessionEntry,
  updateSessionStore,
} from "../../config/sessions.js";

// Gutted in RemoteClaw fork (Middleware Boundary Principle) — pi-embedded removed
type RunResult = {
  meta?: {
    agentMeta?: Record<string, unknown>;
    durationMs?: number;
    aborted?: boolean;
    stopReason?: string;
    autoCompactionCompleted?: boolean;
  };
  [key: string]: unknown;
};

export async function updateSessionStoreAfterAgentRun(params: {
  cfg: RemoteClawConfig;
  contextTokensOverride?: number;
  sessionId: string;
  sessionKey: string;
  storePath: string;
  sessionStore: Record<string, SessionEntry>;
  defaultProvider: string;
  defaultModel: string;
  result: RunResult;
}) {
  const {
    cfg,
    sessionId,
    sessionKey,
    storePath,
    sessionStore,
    defaultProvider,
    defaultModel,
    result,
  } = params;

  // @ts-expect-error — upstream feature not available in RemoteClaw fork
  const usage = result.meta.agentMeta?.usage;
  // @ts-expect-error — upstream feature not available in RemoteClaw fork
  const promptTokens = result.meta.agentMeta?.promptTokens;
  // @ts-expect-error — upstream feature not available in RemoteClaw fork
  const compactionsThisRun = Math.max(0, result.meta.agentMeta?.compactionCount ?? 0);
  // @ts-expect-error — upstream feature not available in RemoteClaw fork
  const modelUsed = result.meta.agentMeta?.model ?? defaultModel;
  // @ts-expect-error — upstream feature not available in RemoteClaw fork
  const providerUsed = result.meta.agentMeta?.provider ?? defaultProvider;
  const contextTokens = params.contextTokensOverride ?? 200_000;

  const entry = sessionStore[sessionKey] ?? {
    sessionId,
    updatedAt: Date.now(),
  };
  const next: SessionEntry = {
    ...entry,
    sessionId,
    updatedAt: Date.now(),
    contextTokens,
  };
  setSessionRuntimeModel(next, {
    provider: providerUsed,
    model: modelUsed,
  });
  if (isCliProvider(providerUsed as string, cfg)) {
    // @ts-expect-error — upstream feature not available in RemoteClaw fork
    const cliSessionId = result.meta.agentMeta?.sessionId?.trim();
    if (cliSessionId) {
      // @ts-expect-error — upstream feature not available in RemoteClaw fork
      setCliSessionId(next, providerUsed, cliSessionId);
    }
  }
  // @ts-expect-error — upstream feature not available in RemoteClaw fork
  next.abortedLastRun = result.meta.aborted ?? false;
  // @ts-expect-error — upstream feature not available in RemoteClaw fork
  if (hasNonzeroUsage(usage)) {
    const input = usage.input ?? 0;
    const output = usage.output ?? 0;
    const totalTokens = deriveSessionTotalTokens({
      usage,
      contextTokens,
      // @ts-expect-error — upstream feature not available in RemoteClaw fork
      promptTokens,
    });
    next.inputTokens = input;
    next.outputTokens = output;
    if (typeof totalTokens === "number" && Number.isFinite(totalTokens) && totalTokens > 0) {
      next.totalTokens = totalTokens;
      next.totalTokensFresh = true;
    } else {
      next.totalTokens = undefined;
      next.totalTokensFresh = false;
    }
    next.cacheRead = usage.cacheRead ?? 0;
    next.cacheWrite = usage.cacheWrite ?? 0;
  }
  if (compactionsThisRun > 0) {
    next.compactionCount = (entry.compactionCount ?? 0) + compactionsThisRun;
  }
  const persisted = await updateSessionStore(storePath, (store) => {
    const merged = mergeSessionEntry(store[sessionKey], next);
    store[sessionKey] = merged;
    return merged;
  });
  sessionStore[sessionKey] = persisted;
}
