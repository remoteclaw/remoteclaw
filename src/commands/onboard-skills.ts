// Gutted in RemoteClaw fork (Middleware Boundary Principle)
import type { RemoteClawConfig } from "../config/config.js";
export const onboardSkills = (..._args: unknown[]) => undefined as unknown;
export const setupSkills = async (
  cfg: RemoteClawConfig,
  ..._args: unknown[]
): Promise<RemoteClawConfig> => cfg;
