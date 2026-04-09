// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const createMemoryProvider = (..._args: unknown[]) => undefined as unknown;
export const getMemoryProvider = (..._args: unknown[]) => undefined as unknown;
export type MemoryProvider = Record<string, unknown>;

// oxlint-disable-next-line typescript/no-explicit-any
export type MemorySearchManager = Record<string, any>;
export type MemorySearchManagerResult = {
  manager: MemorySearchManager | null;
  error?: string;
  purpose?: string;
  [key: string]: unknown;
};
export const getMemorySearchManager = (..._args: unknown[]): Promise<MemorySearchManagerResult> =>
  Promise.resolve({ manager: null, error: "Memory subsystem gutted in RemoteClaw fork" });
