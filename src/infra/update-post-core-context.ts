import type { RemoteClawConfig } from "../config/types.remoteclaw.js";

export const POST_CORE_UPDATE_SOURCE_CONFIG_PATH_ENV =
  "REMOTECLAW_UPDATE_POST_CORE_SOURCE_CONFIG_PATH";

export type PreUpdateConfigRestoreInput = {
  sourceConfig: RemoteClawConfig;
  authoredConfig: RemoteClawConfig;
};
