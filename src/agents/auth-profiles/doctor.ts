import { formatCliCommand } from "../../cli/command-format.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { normalizeProviderId } from "../provider-utils.js";
import { listProfilesForProvider } from "./profiles.js";
import type { AuthProfileStore } from "./types.js";

export function formatAuthDoctorHint(params: {
  cfg?: RemoteClawConfig;
  store: AuthProfileStore;
  provider: string;
  profileId?: string;
}): string {
  const providerKey = normalizeProviderId(params.provider);
  if (providerKey !== "anthropic") {
    return "";
  }

  const legacyProfileId = params.profileId ?? "anthropic:default";
  const storeProfiles = listProfilesForProvider(params.store, providerKey).join(", ");
  const cfgMode = params.cfg?.auth?.profiles?.[legacyProfileId]?.mode;
  const cfgProvider = params.cfg?.auth?.profiles?.[legacyProfileId]?.provider;

  return [
    "Doctor hint (for GitHub issue):",
    `- provider: ${providerKey}`,
    `- config: ${legacyProfileId}${
      cfgProvider || cfgMode ? ` (provider=${cfgProvider ?? "?"}, mode=${cfgMode ?? "?"})` : ""
    }`,
    `- auth store profiles: ${storeProfiles || "(none)"}`,
    `Fix: run "${formatCliCommand("remoteclaw doctor --yes")}"`,
  ].join("\n");
}
