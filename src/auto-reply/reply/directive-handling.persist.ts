import { modelKey, parseModelRef } from "../../agents/provider-utils.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { type SessionEntry, updateSessionStore } from "../../config/sessions.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { applyVerboseOverride } from "../../sessions/level-overrides.js";
import type { InlineDirectives } from "./directive-handling.parse.js";

export async function persistInlineDirectives(params: {
  directives: InlineDirectives;
  effectiveModelDirective?: string;
  cfg: RemoteClawConfig;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  defaultProvider: string;
  defaultModel: string;
  aliasIndex: Map<string, { provider: string; model: string }>;
  allowedModelKeys: Set<string>;
  provider: string;
  model: string;
  initialModelLabel: string;
  formatModelSwitchEvent: (label: string, alias?: string) => string;
  agentCfg: NonNullable<RemoteClawConfig["agents"]>["defaults"] | undefined;
}): Promise<{ provider: string; model: string; contextTokens: number }> {
  const {
    directives,
    cfg: _cfg,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    defaultProvider,
    defaultModel,
    aliasIndex: _aliasIndex,
    allowedModelKeys,
    initialModelLabel,
    formatModelSwitchEvent,
    agentCfg,
  } = params;
  let { provider, model } = params;
  if (sessionEntry && sessionStore && sessionKey) {
    let updated = false;

    if (directives.hasVerboseDirective && directives.verboseLevel) {
      applyVerboseOverride(sessionEntry, directives.verboseLevel);
      updated = true;
    }

    const modelDirective =
      directives.hasModelDirective && params.effectiveModelDirective
        ? params.effectiveModelDirective
        : undefined;
    if (modelDirective) {
      // Model alias resolution gutted in RemoteClaw — parse model ref directly.
      const resolved = parseModelRef(modelDirective, defaultProvider);
      if (resolved) {
        const key = modelKey(resolved.provider, resolved.model);
        if (allowedModelKeys.size === 0 || allowedModelKeys.has(key)) {
          const isDefault =
            resolved.provider === defaultProvider && resolved.model === defaultModel;
          let modelUpdated = false;
          if (isDefault) {
            if (sessionEntry.providerOverride || sessionEntry.modelOverride) {
              delete sessionEntry.providerOverride;
              delete sessionEntry.modelOverride;
              modelUpdated = true;
            }
          } else {
            if (
              sessionEntry.providerOverride !== resolved.provider ||
              sessionEntry.modelOverride !== resolved.model
            ) {
              sessionEntry.providerOverride = resolved.provider;
              sessionEntry.modelOverride = resolved.model;
              modelUpdated = true;
            }
          }
          provider = resolved.provider;
          model = resolved.model;
          const nextLabel = `${provider}/${model}`;
          if (nextLabel !== initialModelLabel) {
            enqueueSystemEvent(formatModelSwitchEvent(nextLabel), {
              sessionKey,
              contextKey: `model:${nextLabel}`,
            });
          }
          updated = updated || modelUpdated;
        }
      }
    }
    if (directives.hasQueueDirective && directives.queueReset) {
      delete sessionEntry.queueMode;
      delete sessionEntry.queueDebounceMs;
      delete sessionEntry.queueCap;
      delete sessionEntry.queueDrop;
      updated = true;
    }

    if (updated) {
      sessionEntry.updatedAt = Date.now();
      sessionStore[sessionKey] = sessionEntry;
      if (storePath) {
        await updateSessionStore(storePath, (store) => {
          store[sessionKey] = sessionEntry;
        });
      }
    }
  }

  return {
    provider,
    model,
    // Context token lookup from model catalog gutted in RemoteClaw — CLI agents manage their own context.
    contextTokens: agentCfg?.contextTokens ?? 200_000,
  };
}

export function resolveDefaultModel(_params: { cfg: RemoteClawConfig; agentId?: string }): {
  defaultProvider: string;
  defaultModel: string;
  aliasIndex: Map<string, { provider: string; model: string }>;
} {
  // Model selection/alias infrastructure gutted in RemoteClaw — CLIs own model selection.
  const aliasIndex = new Map<string, { provider: string; model: string }>();
  return { defaultProvider: "unknown", defaultModel: "unknown", aliasIndex };
}
