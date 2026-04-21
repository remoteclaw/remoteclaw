/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Re-export provider-utils symbols for backward compat
export {
  normalizeProviderId,
  parseModelRef,
  isCliProvider,
  modelKey,
  type ModelRef,
  normalizeGoogleModelId,
  normalizeModelRef,
  findNormalizedProviderValue,
  findNormalizedProviderKey,
} from "./provider-utils.js";

import type { RemoteClawConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import { type ModelRef, modelKey, normalizeProviderId, parseModelRef } from "./provider-utils.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  buildModelAliasIndex: "live",
  resolveModelRefFromString: "live",
  resolveConfiguredModelRef: "live",
  resolveDefaultModelForAgent: "live",
  resolveThinkingDefault: "partial", // returns undefined; callers tolerate
  getModelRefStatus: "partial", // returns undefined; callers tolerate
  inferUniqueProviderFromConfiguredModels: "partial", // returns undefined; callers tolerate
} as const;

const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4o-mini";

export type ModelAliasIndex = {
  byAlias: Map<string, { alias: string; ref: ModelRef }>;
  byKey: Map<string, string[]>;
};

function normalizeAliasKey(value: string): string {
  return value.trim().toLowerCase();
}

function splitTrailingAuthProfile(raw: string): { model: string; profile?: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { model: "" };
  }
  const lastSlash = trimmed.lastIndexOf("/");
  const profileDelimiter = trimmed.indexOf("@", lastSlash + 1);
  if (profileDelimiter <= 0) {
    return { model: trimmed };
  }
  const versionSuffix = trimmed.slice(profileDelimiter + 1);
  if (/^\d{8}(?:@|$)/.test(versionSuffix)) {
    const nextDelimiter = trimmed.indexOf("@", profileDelimiter + 9);
    if (nextDelimiter < 0) {
      return { model: trimmed };
    }
    return {
      model: trimmed.slice(0, nextDelimiter),
      profile: trimmed.slice(nextDelimiter + 1),
    };
  }
  return {
    model: trimmed.slice(0, profileDelimiter),
    profile: trimmed.slice(profileDelimiter + 1),
  };
}

export function buildModelAliasIndex(params: {
  cfg: RemoteClawConfig;
  defaultProvider: string;
  allowPluginNormalization?: boolean;
}): ModelAliasIndex {
  const byAlias = new Map<string, { alias: string; ref: ModelRef }>();
  const byKey = new Map<string, string[]>();

  const rawModels = (params.cfg as any).agents?.defaults?.models ?? {};
  for (const [keyRaw, entryRaw] of Object.entries(rawModels)) {
    const parsed = parseModelRef(String(keyRaw ?? ""), params.defaultProvider);
    if (!parsed) {
      continue;
    }
    const alias = String((entryRaw as { alias?: string } | undefined)?.alias ?? "").trim();
    if (!alias) {
      continue;
    }
    const aliasKey = normalizeAliasKey(alias);
    byAlias.set(aliasKey, { alias, ref: parsed });
    const key = modelKey(parsed.provider, parsed.model);
    const existing = byKey.get(key) ?? [];
    existing.push(alias);
    byKey.set(key, existing);
  }

  return { byAlias, byKey };
}

export function resolveModelRefFromString(params: {
  raw: string;
  defaultProvider: string;
  aliasIndex?: ModelAliasIndex;
  allowPluginNormalization?: boolean;
}): { ref: ModelRef; alias?: string } | null {
  const { model } = splitTrailingAuthProfile(params.raw);
  if (!model) {
    return null;
  }
  if (!model.includes("/")) {
    const aliasKey = normalizeAliasKey(model);
    const aliasMatch = params.aliasIndex?.byAlias.get(aliasKey);
    if (aliasMatch) {
      return { ref: aliasMatch.ref, alias: aliasMatch.alias };
    }
  }
  const parsed = parseModelRef(model, params.defaultProvider);
  if (!parsed) {
    return null;
  }
  return { ref: parsed };
}

export function resolveConfiguredModelRef(params: {
  cfg: RemoteClawConfig;
  defaultProvider: string;
  defaultModel: string;
  allowPluginNormalization?: boolean;
}): ModelRef {
  const rawModel = resolveAgentModelPrimaryValue(params.cfg.agents?.defaults?.model) ?? "";
  if (rawModel) {
    const trimmed = rawModel.trim();
    const aliasIndex = buildModelAliasIndex({
      cfg: params.cfg,
      defaultProvider: params.defaultProvider,
      allowPluginNormalization: params.allowPluginNormalization,
    });
    if (!trimmed.includes("/")) {
      const aliasKey = normalizeAliasKey(trimmed);
      const aliasMatch = aliasIndex.byAlias.get(aliasKey);
      if (aliasMatch) {
        return aliasMatch.ref;
      }
    }
    const parsed = parseModelRef(trimmed, params.defaultProvider);
    if (parsed) {
      return parsed;
    }
  }
  return { provider: params.defaultProvider, model: params.defaultModel };
}

export function resolveDefaultModelForAgent(params: {
  cfg: RemoteClawConfig;
  agentId?: string;
}): ModelRef {
  return resolveConfiguredModelRef({
    cfg: params.cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
}

export const resolveThinkingDefault = (..._args: unknown[]) => undefined as any;
export const getModelRefStatus = (..._args: unknown[]) => undefined as any;
export const inferUniqueProviderFromConfiguredModels = (..._args: unknown[]) => undefined as any;
