// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Context tokens come from the session store, not model-lookup tables.
export type AgentContext = Record<string, unknown>;
export const createAgentContext = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const lookupContextTokens = (..._args: unknown[]): number => 200000; // Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const resolveContextTokensForModel = (..._args: unknown[]): number => 200000; // Gutted in RemoteClaw fork (Middleware Boundary Principle)

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  createAgentContext: "partial", // returns empty record; callers tolerate
  lookupContextTokens: "partial", // returns constant 200000 default
  resolveContextTokensForModel: "partial", // returns constant 200000 default
} as const;
