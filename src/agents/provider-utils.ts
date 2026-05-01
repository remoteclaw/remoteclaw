/**
 * Provider utility functions extracted from model-selection.ts.
 *
 * These are the surviving utilities after the in-process LLM model management
 * layer was removed. Provider normalization, model ref parsing, and
 * config-reading model resolution are still needed by auth-profiles, config,
 * plugin-auto-enable, status reporting, session defaults, and similar
 * middleware infrastructure. CLI runtimes own model SELECTION; middleware
 * still reads the configured default from RemoteClawConfig.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RemoteClawConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  modelKey: "live",
  normalizeProviderId: "live",
  findNormalizedProviderValue: "live",
  findNormalizedProviderKey: "live",
  isCliProvider: "live",
  normalizeGoogleModelId: "live",
  normalizeModelRef: "live",
  parseModelRef: "live",
  buildModelAliasIndex: "live",
  resolveConfiguredModelRef: "live",
  resolveDefaultModelForAgent: "live",
} as const;

export type ModelRef = {
  provider: string;
  model: string;
};

export function modelKey(provider: string, model: string) {
  return `${provider}/${model}`;
}

export function normalizeProviderId(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "z.ai" || normalized === "z-ai") {
    return "zai";
  }
  if (normalized === "opencode-zen") {
    return "opencode";
  }
  if (normalized === "opencode-go-auth") {
    return "opencode-go";
  }
  if (normalized === "qwen") {
    return "qwen-portal";
  }
  if (normalized === "kimi-code") {
    return "kimi-coding";
  }
  if (normalized === "bedrock" || normalized === "aws-bedrock") {
    return "amazon-bedrock";
  }
  // Backward compatibility for older provider naming.
  if (normalized === "bytedance" || normalized === "doubao") {
    return "volcengine";
  }
  // Backward compatibility: *-cli config keys → bare runtime names.
  if (normalized === "claude-cli") {
    return "claude";
  }
  if (normalized === "codex-cli") {
    return "codex";
  }
  return normalized;
}

export function findNormalizedProviderValue<T>(
  entries: Record<string, T> | undefined,
  provider: string,
): T | undefined {
  if (!entries) {
    return undefined;
  }
  const providerKey = normalizeProviderId(provider);
  for (const [key, value] of Object.entries(entries)) {
    if (normalizeProviderId(key) === providerKey) {
      return value;
    }
  }
  return undefined;
}

export function findNormalizedProviderKey(
  entries: Record<string, unknown> | undefined,
  provider: string,
): string | undefined {
  if (!entries) {
    return undefined;
  }
  const providerKey = normalizeProviderId(provider);
  return Object.keys(entries).find((key) => normalizeProviderId(key) === providerKey);
}

/**
 * Known agent runtime names. In RemoteClaw all runtimes are CLI-based, so
 * these are always considered CLI providers regardless of cliBackends config.
 */
const CLI_RUNTIME_NAMES = new Set(["claude", "gemini", "codex", "opencode"]);

export function isCliProvider(provider: string, cfg?: RemoteClawConfig): boolean {
  const normalized = normalizeProviderId(provider);
  if (CLI_RUNTIME_NAMES.has(normalized)) {
    return true;
  }
  const backends = cfg?.agents?.defaults?.cliBackends ?? {};
  return Object.keys(backends).some((key) => normalizeProviderId(key) === normalized);
}

const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  "opus-4.6": "claude-opus-4-6",
  "opus-4.5": "claude-opus-4-5",
  "sonnet-4.6": "claude-sonnet-4-6",
  "sonnet-4.5": "claude-sonnet-4-5",
};
const OPENAI_CODEX_OAUTH_MODEL_PREFIXES = ["gpt-5.3-codex"] as const;

function normalizeAnthropicModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  return ANTHROPIC_MODEL_ALIASES[lower] ?? trimmed;
}

export function normalizeGoogleModelId(id: string): string {
  if (id === "gemini-3-pro") {
    return "gemini-3-pro-preview";
  }
  if (id === "gemini-3-flash") {
    return "gemini-3-flash-preview";
  }
  return id;
}

function normalizeProviderModelId(provider: string, model: string): string {
  if (provider === "anthropic") {
    return normalizeAnthropicModelId(model);
  }
  if (provider === "vercel-ai-gateway" && !model.includes("/")) {
    // Allow Vercel-specific Claude refs without an upstream prefix.
    const normalizedAnthropicModel = normalizeAnthropicModelId(model);
    if (normalizedAnthropicModel.startsWith("claude-")) {
      return `anthropic/${normalizedAnthropicModel}`;
    }
  }
  if (provider === "google") {
    return normalizeGoogleModelId(model);
  }
  // OpenRouter-native models (e.g. "openrouter/aurora-alpha") need the full
  // "openrouter/<name>" as the model ID sent to the API. Models from external
  // providers already contain a slash (e.g. "anthropic/claude-sonnet-4-5") and
  // are passed through as-is (#12924).
  if (provider === "openrouter" && !model.includes("/")) {
    return `openrouter/${model}`;
  }
  return model;
}

function shouldUseOpenAICodexProvider(provider: string, model: string): boolean {
  if (provider !== "openai") {
    return false;
  }
  const normalized = model.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return OPENAI_CODEX_OAUTH_MODEL_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}-`),
  );
}

export function normalizeModelRef(provider: string, model: string): ModelRef {
  const normalizedProvider = normalizeProviderId(provider);
  const normalizedModel = normalizeProviderModelId(normalizedProvider, model.trim());
  if (shouldUseOpenAICodexProvider(normalizedProvider, normalizedModel)) {
    return { provider: "openai-codex", model: normalizedModel };
  }
  return { provider: normalizedProvider, model: normalizedModel };
}

export function parseModelRef(raw: string, defaultProvider: string): ModelRef | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const slash = trimmed.indexOf("/");
  if (slash === -1) {
    return normalizeModelRef(defaultProvider, trimmed);
  }
  const providerRaw = trimmed.slice(0, slash).trim();
  const model = trimmed.slice(slash + 1).trim();
  if (!providerRaw || !model) {
    return null;
  }
  return normalizeModelRef(providerRaw, model);
}

// ---------------------------------------------------------------------------
// Configured-default model resolution (middleware reads cfg.agents.defaults.*)
// ---------------------------------------------------------------------------

const DEFAULT_PROVIDER = "openai";
const DEFAULT_MODEL = "gpt-4o-mini";

export type ModelAliasIndex = {
  byAlias: Map<string, { alias: string; ref: ModelRef }>;
  byKey: Map<string, string[]>;
};

function normalizeAliasKey(value: string): string {
  return value.trim().toLowerCase();
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
