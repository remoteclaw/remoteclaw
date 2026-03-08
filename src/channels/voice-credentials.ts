import { resolveApiKeyForProvider } from "../auth/provider-auth.js";
import type { RemoteClawConfig } from "../config/config.js";
import { AUTO_AUDIO_KEY_PROVIDERS } from "../stt/defaults.js";
import { isTtsProviderConfigured, resolveTtsConfig, TTS_PROVIDERS } from "../tts/tts.js";

export type VoiceCredentialStatus = {
  available: boolean;
  provider?: string;
};

export type VoiceCredentialReport = {
  tts: VoiceCredentialStatus;
  stt: VoiceCredentialStatus;
};

/**
 * Check whether at least one STT provider has valid auth credentials.
 *
 * STT has no free fallback — at least one provider must be configured
 * with a valid API key.
 */
export async function checkSttCredentials(): Promise<VoiceCredentialStatus> {
  for (const provider of AUTO_AUDIO_KEY_PROVIDERS) {
    try {
      const auth = await resolveApiKeyForProvider({ provider });
      if (auth.apiKey) {
        return { available: true, provider };
      }
    } catch {
      // no credentials for this provider — try next
    }
  }
  return { available: false };
}

/**
 * Check whether at least one TTS provider has valid auth credentials.
 *
 * Edge TTS is free (no API key needed) and counts as a valid provider.
 */
export async function checkTtsCredentials(cfg: RemoteClawConfig): Promise<VoiceCredentialStatus> {
  const ttsConfig = resolveTtsConfig(cfg);
  for (const provider of TTS_PROVIDERS) {
    if (await isTtsProviderConfigured(ttsConfig, provider)) {
      return { available: true, provider };
    }
  }
  return { available: false };
}

/**
 * Validate that both STT and TTS credentials are available for voice channels.
 */
export async function validateVoiceCredentials(
  cfg: RemoteClawConfig,
): Promise<VoiceCredentialReport> {
  const [tts, stt] = await Promise.all([checkTtsCredentials(cfg), checkSttCredentials()]);
  return { tts, stt };
}
