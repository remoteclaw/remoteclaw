import { resolveAuthStorePathForDisplay } from "../../auth/index.js";
import { listProfilesForProvider } from "../../auth/index.js";
import { ensureAuthProfileStore, resolveEnvApiKey } from "../../auth/provider-auth.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { shortenHomePath } from "../../utils.js";
import { maskApiKey } from "../../utils/mask-api-key.js";

export type ModelAuthDetailMode = "compact" | "verbose";

export const resolveAuthLabel = async (
  provider: string,
  cfg: RemoteClawConfig,
  modelsPath: string,
  agentDir?: string,
  mode: ModelAuthDetailMode = "compact",
): Promise<{ label: string; source: string }> => {
  const formatPath = (value: string) => shortenHomePath(value);
  const store = ensureAuthProfileStore(agentDir, {
    allowKeychainPrompt: false,
  });
  const profiles = listProfilesForProvider(store, provider);
  const nextProfileId = profiles[0];

  if (profiles.length > 0) {
    if (mode === "compact") {
      const profileId = nextProfileId;
      if (!profileId) {
        return { label: "missing", source: "missing" };
      }
      const profile = store.profiles[profileId];
      const configProfile = cfg.auth?.profiles?.[profileId];
      const missing =
        !profile || (configProfile?.provider && configProfile.provider !== profile.provider);

      const more = profiles.length > 1 ? ` (+${profiles.length - 1})` : "";
      if (missing) {
        return { label: `${profileId} missing${more}`, source: "" };
      }

      return {
        label: `${profileId} api-key ${maskApiKey(profile.key ?? "")}${more}`,
        source: "",
      };
    }

    const labels = profiles.map((profileId) => {
      const profile = store.profiles[profileId];
      const configProfile = cfg.auth?.profiles?.[profileId];
      const flags: string[] = [];
      if (profileId === nextProfileId) {
        flags.push("next");
      }

      if (!profile || (configProfile?.provider && configProfile.provider !== profile.provider)) {
        const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
        return `${profileId}=missing${suffix}`;
      }
      const suffix = flags.length > 0 ? ` (${flags.join(", ")})` : "";
      return `${profileId}=${maskApiKey(profile.key ?? "")}${suffix}`;
    });
    return {
      label: labels.join(", "),
      source: `auth-profiles.json: ${formatPath(resolveAuthStorePathForDisplay(agentDir))}`,
    };
  }

  const envKey = resolveEnvApiKey(provider);
  if (envKey) {
    const label = maskApiKey(envKey.apiKey);
    return { label, source: mode === "verbose" ? envKey.source : "" };
  }
  return { label: "missing", source: "missing" };
};

export const formatAuthLabel = (auth: { label: string; source: string }) => {
  if (!auth.source || auth.source === auth.label || auth.source === "missing") {
    return auth.label;
  }
  return `${auth.label} (${auth.source})`;
};

export const resolveProfileOverride = (params: {
  rawProfile?: string;
  provider: string;
  cfg: RemoteClawConfig;
  agentDir?: string;
}): { profileId?: string; error?: string } => {
  const raw = params.rawProfile?.trim();
  if (!raw) {
    return {};
  }
  const store = ensureAuthProfileStore(params.agentDir, {
    allowKeychainPrompt: false,
  });
  const profile = store.profiles[raw];
  if (!profile) {
    return { error: `Auth profile "${raw}" not found.` };
  }
  if (profile.provider !== params.provider) {
    return {
      error: `Auth profile "${raw}" is for ${profile.provider}, not ${params.provider}.`,
    };
  }
  return { profileId: raw };
};
