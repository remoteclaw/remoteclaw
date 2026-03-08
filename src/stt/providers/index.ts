import { normalizeProviderId } from "../../agents/provider-utils.js";
import type { SttProvider } from "../types.js";
import { deepgramSttProvider } from "./deepgram/index.js";
import { googleSttProvider } from "./google/index.js";
import { groqSttProvider } from "./groq/index.js";
import { mistralSttProvider } from "./mistral/index.js";
import { openaiSttProvider } from "./openai/index.js";

const STT_PROVIDERS: SttProvider[] = [
  groqSttProvider,
  openaiSttProvider,
  googleSttProvider,
  mistralSttProvider,
  deepgramSttProvider,
];

export function normalizeSttProviderId(id: string): string {
  const normalized = normalizeProviderId(id);
  if (normalized === "gemini") {
    return "google";
  }
  return normalized;
}

export function buildSttProviderRegistry(
  overrides?: Record<string, SttProvider>,
): Map<string, SttProvider> {
  const registry = new Map<string, SttProvider>();
  for (const provider of STT_PROVIDERS) {
    registry.set(normalizeSttProviderId(provider.id), provider);
  }
  if (overrides) {
    for (const [key, provider] of Object.entries(overrides)) {
      registry.set(normalizeSttProviderId(key), provider);
    }
  }
  return registry;
}

export function getSttProvider(
  id: string,
  registry: Map<string, SttProvider>,
): SttProvider | undefined {
  return registry.get(normalizeSttProviderId(id));
}
