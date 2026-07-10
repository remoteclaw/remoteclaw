/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  normalizeAgentRunTimeoutPhase: "live",
  normalizeProviderStarted: "live",
} as const;

export const AGENT_RUN_TIMEOUT_PHASES = [
  "queue",
  "preflight",
  "provider",
  "post_turn",
  "gateway_draining",
] as const;

export type AgentRunTimeoutPhase = (typeof AGENT_RUN_TIMEOUT_PHASES)[number];

const AGENT_RUN_TIMEOUT_PHASE_SET = new Set<string>(AGENT_RUN_TIMEOUT_PHASES);

export function normalizeAgentRunTimeoutPhase(value: unknown): AgentRunTimeoutPhase | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return AGENT_RUN_TIMEOUT_PHASE_SET.has(normalized)
    ? (normalized as AgentRunTimeoutPhase)
    : undefined;
}

export function normalizeProviderStarted(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
