import {
  getRuntimeConfigSnapshot,
  getRuntimeConfigSourceSnapshot,
} from "../config/runtime-snapshot.js";
import type { RemoteClawConfig } from "../config/types.remoteclaw.js";

export function resolvePluginActivationSourceConfig(params: {
  config?: RemoteClawConfig;
  activationSourceConfig?: RemoteClawConfig;
}): RemoteClawConfig {
  if (params.activationSourceConfig !== undefined) {
    return params.activationSourceConfig;
  }
  const sourceSnapshot = getRuntimeConfigSourceSnapshot();
  if (sourceSnapshot && params.config === getRuntimeConfigSnapshot()) {
    return sourceSnapshot;
  }
  return params.config ?? {};
}
