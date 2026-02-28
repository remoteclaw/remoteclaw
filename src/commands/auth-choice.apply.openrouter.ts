import { ensureAuthProfileStore, resolveAuthProfileOrder } from "../agents/auth-profiles.js";
import { resolveEnvApiKey } from "../agents/model-auth.js";
import {
  formatApiKeyPreview,
  normalizeApiKeyInput,
  validateApiKeyInput,
} from "./auth-choice.api-key.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import {
  applyAuthProfileConfig,
  applyOpenrouterConfig,
  setOpenrouterApiKey,
} from "./onboard-auth.js";

export async function applyAuthChoiceOpenRouter(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult> {
  let nextConfig = params.config;

  const store = ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false });
  const profileOrder = resolveAuthProfileOrder({
    cfg: nextConfig,
    store,
    provider: "openrouter",
  });
  const existingProfileId = profileOrder.find((profileId) => Boolean(store.profiles[profileId]));
  const existingCred = existingProfileId ? store.profiles[existingProfileId] : undefined;
  let profileId = "openrouter:default";
  let mode: "api_key" | "oauth" | "token" = "api_key";
  let hasCredential = false;

  if (existingProfileId && existingCred?.type) {
    profileId = existingProfileId;
    mode =
      existingCred.type === "oauth" ? "oauth" : existingCred.type === "token" ? "token" : "api_key";
    hasCredential = true;
  }

  if (!hasCredential && params.opts?.token && params.opts?.tokenProvider === "openrouter") {
    await setOpenrouterApiKey(normalizeApiKeyInput(params.opts.token), params.agentDir);
    hasCredential = true;
  }

  if (!hasCredential) {
    const envKey = resolveEnvApiKey("openrouter");
    if (envKey) {
      const useExisting = await params.prompter.confirm({
        message: `Use existing OPENROUTER_API_KEY (${envKey.source}, ${formatApiKeyPreview(envKey.apiKey)})?`,
        initialValue: true,
      });
      if (useExisting) {
        await setOpenrouterApiKey(envKey.apiKey, params.agentDir);
        hasCredential = true;
      }
    }
  }

  if (!hasCredential) {
    const key = await params.prompter.text({
      message: "Enter OpenRouter API key",
      validate: validateApiKeyInput,
    });
    await setOpenrouterApiKey(normalizeApiKeyInput(String(key ?? "")), params.agentDir);
    hasCredential = true;
  }

  if (hasCredential) {
    nextConfig = applyAuthProfileConfig(nextConfig, {
      profileId,
      provider: "openrouter",
      mode,
    });
  }

  nextConfig = applyOpenrouterConfig(nextConfig);

  return { config: nextConfig };
}
