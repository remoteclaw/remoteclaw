import type { RemoteClawConfig } from "../config/config.js";

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export async function applyAgentDefaultPrimaryModel(params: {
  cfg: RemoteClawConfig;
  model: string;
}): Promise<{ next: RemoteClawConfig; changed: boolean }> {
  return { next: params.cfg, changed: false };
}
