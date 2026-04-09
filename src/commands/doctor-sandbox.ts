// Gutted in RemoteClaw fork (Middleware Boundary Principle)
import type { RemoteClawConfig } from "../config/config.js";
export const doctorSandbox = (..._args: unknown[]) => undefined as unknown;
export const reportSandboxDoctor = (..._args: unknown[]) => undefined as unknown;
export const maybeRepairSandboxImages = async (
  cfg: RemoteClawConfig,
  ..._args: unknown[]
): Promise<RemoteClawConfig> => cfg;
export const noteSandboxScopeWarnings = (..._args: unknown[]) => undefined as unknown;
