import { setCliSessionId } from "../../agents/cli-session.js";
// Model management defaults gutted in RemoteClaw — CLI runtimes own model selection.
import { isCliProvider } from "../../agents/provider-utils.js";
import { deriveSessionTotalTokens, hasNonzeroUsage } from "../../agents/usage.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { type SessionEntry, updateSessionStore } from "../../config/sessions.js";
import type { AgentDeliveryResult } from "../../middleware/types.js";

export async function updateSessionStoreAfterAgentRun(params: {
  cfg: RemoteClawConfig;
  contextTokensOverride?: number;
  sessionId: string;
  sessionKey: string;
  storePath: string;
  sessionStore: Record<string, SessionEntry>;
  defaultProvider: string;
  defaultModel: string;
  fallbackProvider?: string;
  fallbackModel?: string;
  result: AgentDeliveryResult;
}) {
  const {
    cfg,
    sessionId,
    sessionKey,
    storePath,
    sessionStore,
    defaultProvider,
    defaultModel,
    fallbackProvider,
    fallbackModel,
    result,
  } = params;

  const runUsage = result.run.usage;
  // Map AgentUsage (inputTokens/outputTokens) to NormalizedUsage shape (input/output)
  // used by the usage helper functions.
  const usage = runUsage
    ? {
        input: runUsage.inputTokens,
        output: runUsage.outputTokens,
        cacheRead: runUsage.cacheReadTokens,
        cacheWrite: runUsage.cacheWriteTokens,
      }
    : undefined;
  const modelUsed = fallbackModel ?? defaultModel;
  const providerUsed = fallbackProvider ?? defaultProvider;
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
  next.modelProvider = providerUsed;
  next.model = modelUsed;
  if (isCliProvider(providerUsed, cfg)) {
    const cliSessionId = result.run.sessionId?.trim();
    if (cliSessionId) {
      setCliSessionId(next, providerUsed, cliSessionId);
    }
  }
  next.abortedLastRun = result.run.aborted ?? false;
  if (hasNonzeroUsage(usage)) {
    const input = usage.input ?? 0;
    const output = usage.output ?? 0;
    const totalTokens =
      deriveSessionTotalTokens({
        usage,
        contextTokens,
      }) ?? input;
    next.inputTokens = input;
    next.outputTokens = output;
    next.totalTokens = totalTokens;
    next.totalTokensFresh = true;
    next.cacheRead = usage.cacheRead ?? 0;
    next.cacheWrite = usage.cacheWrite ?? 0;
  }
  sessionStore[sessionKey] = next;
  await updateSessionStore(storePath, (store) => {
    store[sessionKey] = next;
  });
}
