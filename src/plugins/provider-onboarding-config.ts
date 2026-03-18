import { findNormalizedProviderKey } from "../agents/provider-id.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { AgentModelEntryConfig } from "../config/types.agent-defaults.js";
import type {
  ModelApi,
  ModelDefinitionConfig,
  ModelProviderConfig,
} from "../config/types.models.js";

function extractAgentDefaultModelFallbacks(model: unknown): string[] | undefined {
  if (!model || typeof model !== "object") {
    return undefined;
  }
  if (!("fallbacks" in model)) {
    return undefined;
  }
  const fallbacks = (model as { fallbacks?: unknown }).fallbacks;
  return Array.isArray(fallbacks) ? fallbacks.map((v) => String(v)) : undefined;
}

export type AgentModelAliasEntry =
  | string
  | {
      modelRef: string;
      alias?: string;
    };

function normalizeAgentModelAliasEntry(entry: AgentModelAliasEntry): {
  modelRef: string;
  alias?: string;
} {
  if (typeof entry === "string") {
    return { modelRef: entry };
  }
  return entry;
}

export function withAgentModelAliases(
  existing: Record<string, AgentModelEntryConfig> | undefined,
  aliases: readonly AgentModelAliasEntry[],
): Record<string, AgentModelEntryConfig> {
  const next = { ...existing };
  for (const entry of aliases) {
    const normalized = normalizeAgentModelAliasEntry(entry);
    next[normalized.modelRef] = {
      ...next[normalized.modelRef],
      ...(normalized.alias ? { alias: next[normalized.modelRef]?.alias ?? normalized.alias } : {}),
    };
  }
  return next;
}

export function applyOnboardAuthAgentModelsAndProviders(
  cfg: RemoteClawConfig,
  params: {
    agentModels: Record<string, AgentModelEntryConfig>;
    providers: Record<string, ModelProviderConfig>;
  },
): RemoteClawConfig {
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        models: params.agentModels,
      },
    },
    models: {
      mode: cfg.models?.mode ?? "merge",
      providers: params.providers,
    },
  };
}

export function applyAgentDefaultModelPrimary(
  cfg: RemoteClawConfig,
  primary: string,
): RemoteClawConfig {
  const existingFallbacks = extractAgentDefaultModelFallbacks(cfg.agents?.defaults?.model);
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...cfg.agents?.defaults,
        model: {
          ...(existingFallbacks ? { fallbacks: existingFallbacks } : undefined),
          primary,
        },
      },
    },
  };
}

export function applyProviderConfigWithDefaultModels(
  cfg: RemoteClawConfig,
  params: {
    agentModels: Record<string, AgentModelEntryConfig>;
    providerId: string;
    api: ModelApi;
    baseUrl: string;
    defaultModels: ModelDefinitionConfig[];
    defaultModelId?: string;
  },
): RemoteClawConfig {
  const providerState = resolveProviderModelMergeState(cfg, params.providerId);

  const defaultModels = params.defaultModels;
  const defaultModelId = params.defaultModelId ?? defaultModels[0]?.id;
  const hasDefaultModel = defaultModelId
    ? providerState.existingModels.some((model) => model.id === defaultModelId)
    : true;
  const mergedModels =
    providerState.existingModels.length > 0
      ? hasDefaultModel || defaultModels.length === 0
        ? providerState.existingModels
        : [...providerState.existingModels, ...defaultModels]
      : defaultModels;
  return applyProviderConfigWithMergedModels(cfg, {
    agentModels: params.agentModels,
    providerId: params.providerId,
    providerState,
    api: params.api,
    baseUrl: params.baseUrl,
    mergedModels,
    fallbackModels: defaultModels,
  });
}

export function applyProviderConfigWithDefaultModel(
  cfg: RemoteClawConfig,
  params: {
    agentModels: Record<string, AgentModelEntryConfig>;
    providerId: string;
    api: ModelApi;
    baseUrl: string;
    defaultModel: ModelDefinitionConfig;
    defaultModelId?: string;
  },
): RemoteClawConfig {
  return applyProviderConfigWithDefaultModels(cfg, {
    agentModels: params.agentModels,
    providerId: params.providerId,
    api: params.api,
    baseUrl: params.baseUrl,
    defaultModels: [params.defaultModel],
    defaultModelId: params.defaultModelId ?? params.defaultModel.id,
  });
}

export function applyProviderConfigWithDefaultModelPreset(
  cfg: RemoteClawConfig,
  params: {
    providerId: string;
    api: ModelApi;
    baseUrl: string;
    defaultModel: ModelDefinitionConfig;
    defaultModelId?: string;
    aliases?: readonly AgentModelAliasEntry[];
    primaryModelRef?: string;
  },
): RemoteClawConfig {
  const next = applyProviderConfigWithDefaultModel(cfg, {
    agentModels: withAgentModelAliases(cfg.agents?.defaults?.models, params.aliases ?? []),
    providerId: params.providerId,
    api: params.api,
    baseUrl: params.baseUrl,
    defaultModel: params.defaultModel,
    defaultModelId: params.defaultModelId,
  });
  return params.primaryModelRef
    ? applyAgentDefaultModelPrimary(next, params.primaryModelRef)
    : next;
}

export function applyProviderConfigWithDefaultModelsPreset(
  cfg: RemoteClawConfig,
  params: {
    providerId: string;
    api: ModelApi;
    baseUrl: string;
    defaultModels: ModelDefinitionConfig[];
    defaultModelId?: string;
    aliases?: readonly AgentModelAliasEntry[];
    primaryModelRef?: string;
  },
): RemoteClawConfig {
  const next = applyProviderConfigWithDefaultModels(cfg, {
    agentModels: withAgentModelAliases(cfg.agents?.defaults?.models, params.aliases ?? []),
    providerId: params.providerId,
    api: params.api,
    baseUrl: params.baseUrl,
    defaultModels: params.defaultModels,
    defaultModelId: params.defaultModelId,
  });
  return params.primaryModelRef
    ? applyAgentDefaultModelPrimary(next, params.primaryModelRef)
    : next;
}

export function applyProviderConfigWithModelCatalog(
  cfg: RemoteClawConfig,
  params: {
    agentModels: Record<string, AgentModelEntryConfig>;
    providerId: string;
    api: ModelApi;
    baseUrl: string;
    catalogModels: ModelDefinitionConfig[];
  },
): RemoteClawConfig {
  const providerState = resolveProviderModelMergeState(cfg, params.providerId);
  const catalogModels = params.catalogModels;
  const mergedModels =
    providerState.existingModels.length > 0
      ? [
          ...providerState.existingModels,
          ...catalogModels.filter(
            (model) => !providerState.existingModels.some((existing) => existing.id === model.id),
          ),
        ]
      : catalogModels;
  return applyProviderConfigWithMergedModels(cfg, {
    agentModels: params.agentModels,
    providerId: params.providerId,
    providerState,
    api: params.api,
    baseUrl: params.baseUrl,
    mergedModels,
    fallbackModels: catalogModels,
  });
}

export function applyProviderConfigWithModelCatalogPreset(
  cfg: RemoteClawConfig,
  params: {
    providerId: string;
    api: ModelApi;
    baseUrl: string;
    catalogModels: ModelDefinitionConfig[];
    aliases?: readonly AgentModelAliasEntry[];
    primaryModelRef?: string;
  },
): RemoteClawConfig {
  const next = applyProviderConfigWithModelCatalog(cfg, {
    agentModels: withAgentModelAliases(cfg.agents?.defaults?.models, params.aliases ?? []),
    providerId: params.providerId,
    api: params.api,
    baseUrl: params.baseUrl,
    catalogModels: params.catalogModels,
  });
  return params.primaryModelRef
    ? applyAgentDefaultModelPrimary(next, params.primaryModelRef)
    : next;
}

type ProviderModelMergeState = {
  providers: Record<string, ModelProviderConfig>;
  existingProvider?: ModelProviderConfig;
  existingModels: ModelDefinitionConfig[];
};

function resolveProviderModelMergeState(
  cfg: RemoteClawConfig,
  providerId: string,
): ProviderModelMergeState {
  const providers = { ...cfg.models?.providers } as Record<string, ModelProviderConfig>;
  const existingProviderKey = findNormalizedProviderKey(providers, providerId);
  const existingProvider =
    existingProviderKey !== undefined
      ? (providers[existingProviderKey] as ModelProviderConfig | undefined)
      : undefined;
  const existingModels: ModelDefinitionConfig[] = Array.isArray(existingProvider?.models)
    ? existingProvider.models
    : [];
  if (existingProviderKey && existingProviderKey !== providerId) {
    delete providers[existingProviderKey];
  }
  return { providers, existingProvider, existingModels };
}

function applyProviderConfigWithMergedModels(
  cfg: RemoteClawConfig,
  params: {
    agentModels: Record<string, AgentModelEntryConfig>;
    providerId: string;
    providerState: ProviderModelMergeState;
    api: ModelApi;
    baseUrl: string;
    mergedModels: ModelDefinitionConfig[];
    fallbackModels: ModelDefinitionConfig[];
  },
): RemoteClawConfig {
  params.providerState.providers[params.providerId] = buildProviderConfig({
    existingProvider: params.providerState.existingProvider,
    api: params.api,
    baseUrl: params.baseUrl,
    mergedModels: params.mergedModels,
    fallbackModels: params.fallbackModels,
  });
  return applyOnboardAuthAgentModelsAndProviders(cfg, {
    agentModels: params.agentModels,
    providers: params.providerState.providers,
  });
}

function buildProviderConfig(params: {
  existingProvider: ModelProviderConfig | undefined;
  api: ModelApi;
  baseUrl: string;
  mergedModels: ModelDefinitionConfig[];
  fallbackModels: ModelDefinitionConfig[];
}): ModelProviderConfig {
  const { apiKey: existingApiKey, ...existingProviderRest } = (params.existingProvider ?? {}) as {
    apiKey?: string;
  };
  const normalizedApiKey = typeof existingApiKey === "string" ? existingApiKey.trim() : undefined;

  return {
    ...existingProviderRest,
    baseUrl: params.baseUrl,
    api: params.api,
    ...(normalizedApiKey ? { apiKey: normalizedApiKey } : {}),
    models: params.mergedModels.length > 0 ? params.mergedModels : params.fallbackModels,
  };
}
