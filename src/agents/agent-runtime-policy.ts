import type { AgentRuntimePolicyConfig } from "../config/types.agents-shared.js";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resolveAgentRuntimePolicy: "live",
} as const;

type AgentRuntimePolicyContainer = {
  agentRuntime?: AgentRuntimePolicyConfig;
};

export function resolveAgentRuntimePolicy(
  container: AgentRuntimePolicyContainer | undefined,
): AgentRuntimePolicyConfig | undefined {
  const preferred = container?.agentRuntime;
  if (hasAgentRuntimePolicy(preferred)) {
    return preferred;
  }
  return undefined;
}

function hasAgentRuntimePolicy(value: AgentRuntimePolicyConfig | undefined): boolean {
  return Boolean(value?.id?.trim());
}
