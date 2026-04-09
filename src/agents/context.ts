// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type AgentContext = Record<string, unknown>;
export const createAgentContext = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const lookupContextTokens = (..._args: unknown[]) => 200000 as number;
export const resolveContextTokensForModel = (..._args: unknown[]) => 200000 as number;
