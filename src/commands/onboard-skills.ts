import type { RemoteClawConfig } from "../config/config.js";

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export async function setupSkills(
  cfg: RemoteClawConfig,
  ..._args: unknown[]
): Promise<RemoteClawConfig> {
  return cfg;
}
