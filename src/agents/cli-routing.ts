import type { RemoteClawConfig } from "../config/config.js";
import { resolveAgentConfig, resolveAgentModelPrimary } from "./agent-scope.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "./defaults.js";

export type ModelRef = {
  provider: string;
  model: string;
};

export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const ANTHROPIC_MODEL_ALIASES: Record<string, string> = {
  "opus-4.6": "claude-opus-4-6",
  "opus-4.5": "claude-opus-4-5",
  "sonnet-4.6": "claude-sonnet-4-6",
  "sonnet-4.5": "claude-sonnet-4-5",
};
const OPENAI_CODEX_OAUTH_MODEL_PREFIXES = ["gpt-5.3-codex"] as const;

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
  if (normalized === "qwen") {
    return "qwen-portal";
  }
  if (normalized === "kimi-code") {
    return "kimi-coding";
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

export function isCliProvider(provider: string, cfg?: RemoteClawConfig): boolean {
  const normalized = normalizeProviderId(provider);
  if (normalized === "claude-cli") {
    return true;
  }
  if (normalized === "codex-cli") {
    return true;
  }
  if (normalized === "opencode") {
    return true;
  }
  const backends = cfg?.agents?.defaults?.cliBackends ?? {};
  return Object.keys(backends).some((key) => normalizeProviderId(key) === normalized);
}

function normalizeAnthropicModelId(model: string): string {
  const trimmed = model.trim();
  if (!trimmed) {
    return trimmed;
  }
  const lower = trimmed.toLowerCase();
  return ANTHROPIC_MODEL_ALIASES[lower] ?? trimmed;
}

function normalizeGoogleModelId(id: string): string {
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
  if (provider === "google") {
    return normalizeGoogleModelId(model);
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

export function normalizeModelSelection(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const primary = (value as { primary?: unknown }).primary;
  if (typeof primary === "string") {
    const trimmed = primary.trim();
    return trimmed || undefined;
  }
  return undefined;
}

export function resolveConfiguredModelRef(params: {
  cfg: RemoteClawConfig;
  defaultProvider: string;
  defaultModel: string;
}): ModelRef {
  const rawModel = (() => {
    const raw = params.cfg.agents?.defaults?.model as { primary?: string } | string | undefined;
    if (typeof raw === "string") {
      return raw.trim();
    }
    return raw?.primary?.trim() ?? "";
  })();
  if (rawModel) {
    const parsed = parseModelRef(rawModel, params.defaultProvider);
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
  const agentModelOverride = params.agentId
    ? resolveAgentModelPrimary(params.cfg, params.agentId)
    : undefined;
  const cfg =
    agentModelOverride && agentModelOverride.length > 0
      ? {
          ...params.cfg,
          agents: {
            ...params.cfg.agents,
            defaults: {
              ...params.cfg.agents?.defaults,
              model: {
                ...(typeof params.cfg.agents?.defaults?.model === "object"
                  ? params.cfg.agents.defaults.model
                  : undefined),
                primary: agentModelOverride,
              },
            },
          },
        }
      : params.cfg;
  return resolveConfiguredModelRef({
    cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
}

export function resolveSubagentConfiguredModelSelection(params: {
  cfg: RemoteClawConfig;
  agentId: string;
}): string | undefined {
  const agentConfig = resolveAgentConfig(params.cfg, params.agentId);
  return (
    normalizeModelSelection(agentConfig?.subagents?.model) ??
    normalizeModelSelection(params.cfg.agents?.defaults?.subagents?.model) ??
    normalizeModelSelection(agentConfig?.model)
  );
}

export function resolveSubagentSpawnModelSelection(params: {
  cfg: RemoteClawConfig;
  agentId: string;
  modelOverride?: unknown;
}): string {
  const runtimeDefault = resolveDefaultModelForAgent({
    cfg: params.cfg,
    agentId: params.agentId,
  });
  return (
    normalizeModelSelection(params.modelOverride) ??
    resolveSubagentConfiguredModelSelection({
      cfg: params.cfg,
      agentId: params.agentId,
    }) ??
    normalizeModelSelection(params.cfg.agents?.defaults?.model?.primary) ??
    `${runtimeDefault.provider}/${runtimeDefault.model}`
  );
}

export function resolveThinkingDefault(params: { cfg: RemoteClawConfig }): ThinkLevel {
  return params.cfg.agents?.defaults?.thinkingDefault ?? "off";
}
