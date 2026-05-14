import type { loadConfig } from "../config/config.js";
import type { callGateway } from "../gateway/call.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  createSubagentAnnounceDeliveryRuntimeMock: "live",
} as const;

type DeliveryRuntimeMockOptions = {
  callGateway: (request: unknown) => Promise<unknown>;
  loadConfig: () => ReturnType<typeof loadConfig>;
  loadSessionStore: (storePath: string) => unknown;
  resolveAgentIdFromSessionKey: (sessionKey: string) => string;
  resolveMainSessionKey: (cfg: unknown) => string;
  resolveStorePath: (store: unknown, options: unknown) => string;
  isEmbeddedPiRunActive: (sessionId: string) => boolean;
  queueEmbeddedPiMessage: (sessionId: string, text: string) => boolean;
  hasHooks?: () => boolean;
};

function resolveExternalBestEffortDeliveryTarget(params: {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string;
}) {
  return {
    deliver: Boolean(params.channel && params.to),
    channel: params.channel,
    to: params.to,
    accountId: params.accountId,
    threadId: params.threadId,
  };
}

function resolveQueueSettings(params: {
  cfg?: {
    messages?: {
      queue?: {
        byChannel?: Record<string, string>;
      };
    };
  };
  channel?: string;
}) {
  return {
    mode: (params.channel && params.cfg?.messages?.queue?.byChannel?.[params.channel]) ?? "none",
  };
}

export function createSubagentAnnounceDeliveryRuntimeMock(options: DeliveryRuntimeMockOptions) {
  return {
    callGateway: (async <T = Record<string, unknown>>(request: Parameters<typeof callGateway>[0]) =>
      (await options.callGateway(request)) as T) as typeof callGateway,
    loadConfig: options.loadConfig,
    loadSessionStore: options.loadSessionStore,
    resolveAgentIdFromSessionKey: options.resolveAgentIdFromSessionKey,
    resolveMainSessionKey: options.resolveMainSessionKey,
    resolveStorePath: options.resolveStorePath,
    isEmbeddedPiRunActive: options.isEmbeddedPiRunActive,
    queueEmbeddedPiMessage: options.queueEmbeddedPiMessage,
    getGlobalHookRunner: () => ({ hasHooks: () => options.hasHooks?.() ?? false }),
    createBoundDeliveryRouter: () => ({
      resolveDestination: () => ({ mode: "none" }),
    }),
    resolveConversationIdFromTargets: () => "",
    resolveExternalBestEffortDeliveryTarget,
    resolveQueueSettings,
  };
}
