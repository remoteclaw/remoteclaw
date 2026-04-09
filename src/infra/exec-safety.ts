// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type ExecSafetyLevel = "trusted" | "restricted" | "blocked";
export const DEFAULT_EXEC_SAFETY_LEVEL: ExecSafetyLevel = "trusted";
export const isSafeExecutableValue = (..._args: unknown[]) => true as boolean;
