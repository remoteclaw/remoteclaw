import {
  collectProviderApiKeysForExecution,
  executeWithApiKeyRotation,
} from "../auth/api-key-rotation.js";
import { requireApiKey, resolveApiKeyForProvider } from "../auth/provider-auth.js";
import type { RemoteClawConfig } from "../config/config.js";
import type {
  MediaUnderstandingConfig,
  MediaUnderstandingModelConfig,
} from "../config/types.tools.js";
import { DEFAULT_AUDIO_MODELS } from "./defaults.js";
import { buildSttProviderRegistry, getSttProvider } from "./providers/index.js";
import type { AudioTranscriptionResult, SttProvider } from "./types.js";

export type SttProviderRegistry = Map<string, SttProvider>;

type ProviderQuery = Record<string, string | number | boolean>;

function normalizeProviderQuery(
  options?: Record<string, string | number | boolean>,
): ProviderQuery | undefined {
  if (!options) {
    return undefined;
  }
  const query: ProviderQuery = {};
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined) {
      continue;
    }
    query[key] = value;
  }
  return Object.keys(query).length > 0 ? query : undefined;
}

function buildDeepgramCompatQuery(options?: {
  detectLanguage?: boolean;
  punctuate?: boolean;
  smartFormat?: boolean;
}): ProviderQuery | undefined {
  if (!options) {
    return undefined;
  }
  const query: ProviderQuery = {};
  if (typeof options.detectLanguage === "boolean") {
    query.detect_language = options.detectLanguage;
  }
  if (typeof options.punctuate === "boolean") {
    query.punctuate = options.punctuate;
  }
  if (typeof options.smartFormat === "boolean") {
    query.smart_format = options.smartFormat;
  }
  return Object.keys(query).length > 0 ? query : undefined;
}

function normalizeDeepgramQueryKeys(query: ProviderQuery): ProviderQuery {
  const normalized = { ...query };
  if ("detectLanguage" in normalized) {
    normalized.detect_language = normalized.detectLanguage as boolean;
    delete normalized.detectLanguage;
  }
  if ("smartFormat" in normalized) {
    normalized.smart_format = normalized.smartFormat as boolean;
    delete normalized.smartFormat;
  }
  return normalized;
}

export function resolveProviderQuery(params: {
  providerId: string;
  config?: MediaUnderstandingConfig;
  entry: MediaUnderstandingModelConfig;
}): ProviderQuery | undefined {
  const { providerId, config, entry } = params;
  const mergedOptions = normalizeProviderQuery({
    ...config?.providerOptions?.[providerId],
    ...entry.providerOptions?.[providerId],
  });
  if (providerId !== "deepgram") {
    return mergedOptions;
  }
  const query = normalizeDeepgramQueryKeys(mergedOptions ?? {});
  const compat = buildDeepgramCompatQuery({ ...config?.deepgram, ...entry.deepgram });
  for (const [key, value] of Object.entries(compat ?? {})) {
    if (query[key] === undefined) {
      query[key] = value;
    }
  }
  return Object.keys(query).length > 0 ? query : undefined;
}

export type TranscribeAudioParams = {
  buffer: Buffer;
  fileName: string;
  mime?: string;
  providerId: string;
  cfg: RemoteClawConfig;
  entry: MediaUnderstandingModelConfig;
  config?: MediaUnderstandingConfig;
  agentDir?: string;
  providerRegistry: SttProviderRegistry;
  language?: string;
  prompt?: string;
  timeoutMs: number;
};

export async function transcribeAudioWithProvider(
  params: TranscribeAudioParams,
): Promise<AudioTranscriptionResult> {
  const { providerId, cfg, entry, config } = params;

  const provider = getSttProvider(providerId, params.providerRegistry);
  if (!provider) {
    throw new Error(`STT provider not available: ${providerId}`);
  }

  const auth = await resolveApiKeyForProvider({
    provider: providerId,
    cfg,
    profileId: entry.profile,
    preferredProfile: entry.preferredProfile,
  });
  const apiKeys = collectProviderApiKeysForExecution({
    provider: providerId,
    primaryApiKey: requireApiKey(auth, providerId),
  });

  const baseUrl = entry.baseUrl ?? config?.baseUrl;
  const mergedHeaders = {
    ...config?.headers,
    ...entry.headers,
  };
  const headers = Object.keys(mergedHeaders).length > 0 ? mergedHeaders : undefined;

  const providerQuery = resolveProviderQuery({
    providerId,
    config,
    entry,
  });

  const model = entry.model?.trim() || DEFAULT_AUDIO_MODELS[providerId];

  return await executeWithApiKeyRotation({
    provider: providerId,
    apiKeys,
    execute: async (apiKey) =>
      provider.transcribeAudio({
        buffer: params.buffer,
        fileName: params.fileName,
        mime: params.mime,
        apiKey,
        baseUrl,
        headers,
        model,
        language:
          params.language ??
          entry.language ??
          config?.language ??
          cfg.tools?.media?.audio?.language,
        prompt: params.prompt,
        query: providerQuery,
        timeoutMs: params.timeoutMs,
      }),
  });
}

export { buildSttProviderRegistry } from "./providers/index.js";
export type { SttProvider } from "./types.js";
