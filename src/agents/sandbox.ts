/* eslint-disable @typescript-eslint/no-explicit-any */
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Minimal stub: resolves sandbox.mode from agent-specific or defaults config.
import { resolveAgentConfig } from "./agent-scope.js";
export const resolveSandboxConfigForAgent = (cfg?: any, agentId?: string) => {
  const defaults = cfg?.agents?.defaults?.sandbox;
  const agentCfg = cfg && agentId ? resolveAgentConfig(cfg, agentId) : undefined;
  const agentSandbox = agentCfg?.sandbox;
  return {
    mode: agentSandbox?.mode ?? defaults?.mode ?? "off",
    browser: {
      enabled: agentSandbox?.browser?.enabled ?? defaults?.browser?.enabled ?? false,
      network: agentSandbox?.browser?.network ?? defaults?.browser?.network ?? "",
    },
    docker: { ...defaults?.docker, ...agentSandbox?.docker },
  } as any;
};
export const ensureSandboxWorkspaceForSession = (..._args: unknown[]) => undefined as any;
export const resolveSandboxToolPolicyForAgent = (..._args: unknown[]) => undefined as any;
export type SandboxToolPolicy = { deny?: string[]; allow?: string[]; [key: string]: unknown };
export const resolveSandboxRuntimeStatus = (..._args: unknown[]) => undefined as any;
