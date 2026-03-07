import {
  resolveAgentDir,
  resolveDefaultAgentId,
  resolveSessionAgentId,
} from "../../agents/agent-scope.js";
import { modelKey, parseModelRef } from "../../agents/provider-utils.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { type SessionEntry, updateSessionStore } from "../../config/sessions.js";
import { enqueueSystemEvent } from "../../infra/system-events.js";
import { applyVerboseOverride } from "../../sessions/level-overrides.js";
import { resolveProfileOverride } from "./directive-handling.auth.js";
import type { InlineDirectives } from "./directive-handling.parse.js";
import { enqueueModeSwitchEvents } from "./directive-handling.shared.js";
import type { ElevatedLevel, ReasoningLevel } from "./directives.js";

export async function persistInlineDirectives(params: {
  directives: InlineDirectives;
  effectiveModelDirective?: string;
  cfg: RemoteClawConfig;
  agentDir?: string;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  elevatedEnabled: boolean;
  elevatedAllowed: boolean;
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
    cfg,
    sessionEntry,
    sessionStore,
    sessionKey,
    storePath,
    elevatedEnabled,
    elevatedAllowed,
    defaultProvider,
    defaultModel,
    aliasIndex: _aliasIndex,
    allowedModelKeys,
    initialModelLabel,
    formatModelSwitchEvent,
    agentCfg,
  } = params;
  let { provider, model } = params;
  const activeAgentId = sessionKey
    ? resolveSessionAgentId({ sessionKey, config: cfg })
    : resolveDefaultAgentId(cfg);
  const agentDir = resolveAgentDir(cfg, activeAgentId);

  if (sessionEntry && sessionStore && sessionKey) {
    const prevElevatedLevel =
      (sessionEntry.elevatedLevel as ElevatedLevel | undefined) ??
      (agentCfg?.elevatedDefault as ElevatedLevel | undefined) ??
      (elevatedAllowed ? ("on" as ElevatedLevel) : ("off" as ElevatedLevel));
    const prevReasoningLevel = (sessionEntry.reasoningLevel as ReasoningLevel | undefined) ?? "off";
    let elevatedChanged =
      directives.hasElevatedDirective &&
      directives.elevatedLevel !== undefined &&
      elevatedEnabled &&
      elevatedAllowed;
    let reasoningChanged =
      directives.hasReasoningDirective && directives.reasoningLevel !== undefined;
    let updated = false;

    if (directives.hasThinkDirective && directives.thinkLevel) {
      sessionEntry.thinkingLevel = directives.thinkLevel;
      updated = true;
    }
    if (directives.hasVerboseDirective && directives.verboseLevel) {
      applyVerboseOverride(sessionEntry, directives.verboseLevel);
      updated = true;
    }
    if (directives.hasReasoningDirective && directives.reasoningLevel) {
      if (directives.reasoningLevel === "off") {
        // Persist explicit off so it overrides model-capability defaults.
        sessionEntry.reasoningLevel = "off";
      } else {
        sessionEntry.reasoningLevel = directives.reasoningLevel;
      }
      reasoningChanged =
        reasoningChanged ||
        (directives.reasoningLevel !== prevReasoningLevel &&
          directives.reasoningLevel !== undefined);
      updated = true;
    }
    if (
      directives.hasElevatedDirective &&
      directives.elevatedLevel &&
      elevatedEnabled &&
      elevatedAllowed
    ) {
      // Persist "off" explicitly so inline `/elevated off` overrides defaults.
      sessionEntry.elevatedLevel = directives.elevatedLevel;
      elevatedChanged =
        elevatedChanged ||
        (directives.elevatedLevel !== prevElevatedLevel && directives.elevatedLevel !== undefined);
      updated = true;
    }
    if (directives.hasExecDirective && directives.hasExecOptions) {
      if (directives.execHost) {
        sessionEntry.execHost = directives.execHost;
        updated = true;
      }
      if (directives.execSecurity) {
        sessionEntry.execSecurity = directives.execSecurity;
        updated = true;
      }
      if (directives.execAsk) {
        sessionEntry.execAsk = directives.execAsk;
        updated = true;
      }
      if (directives.execNode) {
        sessionEntry.execNode = directives.execNode;
        updated = true;
      }
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
          let profileOverride: string | undefined;
          if (directives.rawModelProfile) {
            const profileResolved = resolveProfileOverride({
              rawProfile: directives.rawModelProfile,
              provider: resolved.provider,
              cfg,
              agentDir,
            });
            if (profileResolved.error) {
              throw new Error(profileResolved.error);
            }
            profileOverride = profileResolved.profileId;
          }
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
          if (profileOverride !== undefined) {
            sessionEntry.authProfileOverride = profileOverride;
            sessionEntry.authProfileOverrideSource = "user";
            modelUpdated = true;
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
      enqueueModeSwitchEvents({
        enqueueSystemEvent,
        sessionEntry,
        sessionKey,
        elevatedChanged,
        reasoningChanged,
      });
    }
  }

  return {
    provider,
    model,
    // Context token lookup from model catalog gutted in RemoteClaw — CLI agents manage their own context.
    contextTokens: agentCfg?.contextTokens ?? 200_000,
  };
}

export function resolveDefaultModel(params: { cfg: RemoteClawConfig; agentId?: string }): {
  defaultProvider: string;
  defaultModel: string;
  aliasIndex: Map<string, { provider: string; model: string }>;
} {
  // Model selection/alias infrastructure gutted in RemoteClaw — derive from agent config primary.
  const agentModel = params.cfg.agents?.defaults?.model;
  const primary =
    typeof agentModel === "string" ? agentModel : (agentModel as { primary?: string })?.primary;
  const slashIdx = primary?.indexOf("/") ?? -1;
  const defaultProvider = primary && slashIdx > 0 ? primary.slice(0, slashIdx) : "unknown";
  const defaultModel =
    primary && slashIdx > 0 ? primary.slice(slashIdx + 1) : (primary ?? "unknown");
  // Alias index is empty — model aliases gutted in RemoteClaw.
  const aliasIndex = new Map<string, { provider: string; model: string }>();
  return { defaultProvider, defaultModel, aliasIndex };
}
