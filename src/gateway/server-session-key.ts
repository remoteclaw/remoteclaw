import { loadConfig } from "../config/config.js";
import { getAgentRunContext, registerAgentRunContext } from "../infra/agent-events.js";
import { toAgentRequestSessionKey } from "../routing/session-key.js";
import { loadCombinedSessionStoreForGateway } from "./session-utils.js";

export function resolveSessionKeyForRun(runId: string) {
  const cached = getAgentRunContext(runId)?.sessionKey;
  if (cached) {
    return cached;
  }
  const cfg = loadConfig();
  // Source the combined per-agent store: post multi-agent migration the
  // session store path is per-agent (default/templated), so `resolveStorePath`
  // requires an agentId. `loadCombinedSessionStoreForGateway` resolves and
  // merges every agent store into one keyed view.
  const { store } = loadCombinedSessionStoreForGateway(cfg);
  const found = Object.entries(store).find(([, entry]) => entry?.sessionId === runId);
  const storeKey = found?.[0];
  if (storeKey) {
    const sessionKey = toAgentRequestSessionKey(storeKey) ?? storeKey;
    registerAgentRunContext(runId, { sessionKey });
    return sessionKey;
  }
  return undefined;
}
