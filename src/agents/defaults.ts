// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const DEFAULT_AGENT_ID = "default";
export const DEFAULT_PROVIDER = "anthropic";
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4-20250514";
export const resolveAgentDefaults = (..._args: unknown[]) => ({}) as Record<string, unknown>;

export const DEFAULT_CONTEXT_TOKENS = 200000;
