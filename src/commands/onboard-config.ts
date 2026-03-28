import type { RemoteClawConfig } from "../config/config.js";
import type { DmScope } from "../config/types.base.js";
import type { ToolProfileId } from "../config/types.tools.js";

export const ONBOARDING_DEFAULT_DM_SCOPE: DmScope = "per-channel-peer";
export const ONBOARDING_DEFAULT_TOOLS_PROFILE: ToolProfileId = "coding";

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
    tools: {
      ...baseConfig.tools,
      profile: baseConfig.tools?.profile ?? ONBOARDING_DEFAULT_TOOLS_PROFILE,
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
