// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const DEFAULT_CONTEXT_WINDOW_TOKENS = 200000;
export const CONTEXT_WINDOW_HARD_MIN_TOKENS = 4096;
export const guardContextWindowTokens = (..._args: unknown[]) => 200000 as number;
