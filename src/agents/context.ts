// Gutted in RemoteClaw fork (Middleware Boundary Principle)
// Context tokens come from the session store, not model-lookup tables.
export type AgentContext = Record<string, unknown>;
export const createAgentContext = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const lookupContextTokens = (..._args: unknown[]): number => 200000; // Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const resolveContextTokensForModel = (..._args: unknown[]): number => 200000; // Gutted in RemoteClaw fork (Middleware Boundary Principle)
