import type { RemoteClawConfig } from "../config/config.js";
import { resolveAgentConfig } from "./agent-scope.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  createToolFsPolicy: "live",
  resolveToolFsConfig: "live",
  resolveEffectiveToolFsWorkspaceOnly: "live",
} as const;

export type ToolFsPolicy = {
  workspaceOnly: boolean;
};

export function createToolFsPolicy(params: { workspaceOnly?: boolean }): ToolFsPolicy {
  return {
    workspaceOnly: params.workspaceOnly === true,
  };
}

export function resolveToolFsConfig(params: { cfg?: RemoteClawConfig; agentId?: string }): {
  workspaceOnly?: boolean;
} {
  const cfg = params.cfg;
  const globalFs = cfg?.tools?.fs;
  const agentFs =
    cfg && params.agentId ? resolveAgentConfig(cfg, params.agentId)?.tools?.fs : undefined;
  return {
    workspaceOnly: agentFs?.workspaceOnly ?? globalFs?.workspaceOnly,
  };
}

export function resolveEffectiveToolFsWorkspaceOnly(params: {
  cfg?: RemoteClawConfig;
  agentId?: string;
}): boolean {
  return resolveToolFsConfig(params).workspaceOnly === true;
}
