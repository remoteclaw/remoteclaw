import type { RemoteClawConfig } from "../config/config.js";
import type { DmScope } from "../config/types.base.js";

export const ONBOARDING_DEFAULT_DM_SCOPE: DmScope = "per-channel-peer";

export function applyOnboardingLocalWorkspaceConfig(
  baseConfig: RemoteClawConfig,
  workspace?: string,
): RemoteClawConfig {
  const result: RemoteClawConfig = {
    ...baseConfig,
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
    session: {
      ...baseConfig.session,
      dmScope: baseConfig.session?.dmScope ?? ONBOARDING_DEFAULT_DM_SCOPE,
    },
  };

  if (workspace) {
    const existingList = Array.isArray(result.agents?.list) ? result.agents.list : [];
    const list = existingList.map((entry) =>
      entry && typeof entry === "object" && !("workspace" in entry && entry.workspace)
        ? { ...entry, workspace }
        : entry,
    );
    if (list.length === 0) {
      list.push({ id: "main", workspace });
    }
    result.agents = { ...result.agents, list };
  }

  return result;
}
