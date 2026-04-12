import type { RemoteClawConfig } from "../config/config.js";

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export async function maybeSeedControlUiAllowedOriginsAtStartup(params: {
  config: RemoteClawConfig;
  writeConfig: (...args: never[]) => void | Promise<void>;
  log: unknown;
}): Promise<RemoteClawConfig> {
  return params.config;
}
