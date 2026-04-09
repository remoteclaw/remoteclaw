// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const internalMemory = (..._args: unknown[]) => undefined as unknown;
export type InternalMemoryConfig = Record<string, unknown>;

export const listMemoryFiles = (..._args: unknown[]) => [] as string[];
export const normalizeExtraMemoryPaths = (..._args: unknown[]) => [] as string[];
