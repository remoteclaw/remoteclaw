// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type ModelOverrides = Record<string, unknown>;
export const resolveModelOverrides = (..._args: unknown[]) => ({}) as Record<string, unknown>;
export const applyModelOverrideToSessionEntry = (..._args: unknown[]) =>
  ({ updated: false }) as { updated: boolean };
