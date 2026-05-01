import { normalizeProviderId } from "../../agents/provider-utils.js";
import type { TtsProviderImpl } from "../types.js";
import { edgeTtsProvider } from "./edge.js";
import { elevenLabsTtsProvider } from "./elevenlabs.js";
import { openaiTtsProvider } from "./openai.js";

const TTS_PROVIDERS: TtsProviderImpl[] = [
  openaiTtsProvider,
  elevenLabsTtsProvider,
  edgeTtsProvider,
];

export function normalizeTtsProviderId(id: string): string {
  return normalizeProviderId(id);
}

export function buildTtsProviderRegistry(
  pluginProviders?: TtsProviderImpl[],
): Map<string, TtsProviderImpl> {
  const registry = new Map<string, TtsProviderImpl>();
  for (const provider of TTS_PROVIDERS) {
    registry.set(normalizeTtsProviderId(provider.id), provider);
  }
  if (pluginProviders) {
    for (const provider of pluginProviders) {
      registry.set(normalizeTtsProviderId(provider.id), provider);
    }
  }
  return registry;
}

export function getTtsProvider(
  id: string,
  registry: Map<string, TtsProviderImpl>,
): TtsProviderImpl | undefined {
  return registry.get(normalizeTtsProviderId(id));
}
