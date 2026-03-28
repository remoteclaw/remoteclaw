import { emptyPluginConfigSchema } from "../plugins/config-schema.js";
import type {
  RemoteClawPluginApi,
  RemoteClawPluginCommandDefinition,
  RemoteClawPluginConfigSchema,
  OpenClawPluginDefinition,
  PluginInteractiveTelegramHandlerContext,
} from "../plugins/types.js";

export type {
  AnyAgentTool,
  MediaUnderstandingProviderPlugin,
  RemoteClawPluginApi,
  RemoteClawPluginConfigSchema,
  ProviderDiscoveryContext,
  ProviderCatalogContext,
  ProviderCatalogResult,
  ProviderAugmentModelCatalogContext,
  ProviderBuiltInModelSuppressionContext,
  ProviderBuiltInModelSuppressionResult,
  ProviderBuildMissingAuthMessageContext,
  ProviderCacheTtlEligibilityContext,
  ProviderDefaultThinkingPolicyContext,
  ProviderFetchUsageSnapshotContext,
  ProviderModernModelPolicyContext,
  ProviderPreparedRuntimeAuth,
  ProviderResolvedUsageAuth,
  ProviderPrepareExtraParamsContext,
  ProviderPrepareDynamicModelContext,
  ProviderPrepareRuntimeAuthContext,
  ProviderResolveUsageAuthContext,
  ProviderResolveDynamicModelContext,
  ProviderNormalizeResolvedModelContext,
  ProviderRuntimeModel,
  SpeechProviderPlugin,
  ProviderThinkingPolicyContext,
  ProviderWrapStreamFnContext,
  RemoteClawPluginService,
  RemoteClawPluginServiceContext,
  ProviderAuthContext,
  ProviderAuthDoctorHintContext,
  ProviderAuthMethodNonInteractiveContext,
  ProviderAuthMethod,
  ProviderAuthResult,
  RemoteClawPluginCommandDefinition,
  OpenClawPluginDefinition,
  PluginLogger,
  PluginInteractiveTelegramHandlerContext,
} from "../plugins/types.js";
export type { RemoteClawConfig } from "../config/config.js";

export { emptyPluginConfigSchema } from "../plugins/config-schema.js";

type DefinePluginEntryOptions = {
  id: string;
  name: string;
  description: string;
  kind?: OpenClawPluginDefinition["kind"];
  configSchema?: RemoteClawPluginConfigSchema | (() => RemoteClawPluginConfigSchema);
  register: (api: RemoteClawPluginApi) => void;
};

type DefinedPluginEntry = {
  id: string;
  name: string;
  description: string;
  configSchema: RemoteClawPluginConfigSchema;
  register: NonNullable<OpenClawPluginDefinition["register"]>;
} & Pick<OpenClawPluginDefinition, "kind">;

function resolvePluginConfigSchema(
  configSchema: DefinePluginEntryOptions["configSchema"] = emptyPluginConfigSchema,
): RemoteClawPluginConfigSchema {
  return typeof configSchema === "function" ? configSchema() : configSchema;
}

// Small entry surface for provider and command plugins that do not need channel helpers.
export function definePluginEntry({
  id,
  name,
  description,
  kind,
  configSchema = emptyPluginConfigSchema,
  register,
}: DefinePluginEntryOptions): DefinedPluginEntry {
  return {
    id,
    name,
    description,
    ...(kind ? { kind } : {}),
    configSchema: resolvePluginConfigSchema(configSchema),
    register,
  };
}
