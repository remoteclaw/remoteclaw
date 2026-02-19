import type { RemoteClawConfig } from "../config/config.js";

export function applyOnboardingLocalWorkspaceConfig(
  baseConfig: RemoteClawConfig,
  workspaceDir: string,
): RemoteClawConfig {
  return {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };
}
