import type { RemoteClawConfig } from "../config/config.js";

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export async function maybeRepairSandboxImages(
  cfg: RemoteClawConfig,
  ..._args: unknown[]
): Promise<RemoteClawConfig> {
  return cfg;
}
export async function noteSandboxScopeWarnings(..._args: unknown[]): Promise<void> {}
