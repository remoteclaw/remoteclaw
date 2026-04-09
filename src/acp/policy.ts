// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type AcpPolicy = Record<string, unknown>;
export const resolveAcpPolicy = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export type ToolPolicyOverrides = Record<string, unknown>;

export const resolveAcpAgentPolicyError = (..._args: unknown[]) => undefined as unknown;
export const resolveAcpDispatchPolicyError = (..._args: unknown[]) => undefined as unknown;
