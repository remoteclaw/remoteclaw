// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export type AcpManager = {
  resolveSession: (
    ..._args: unknown[]
  ) => { kind: string; error?: unknown; meta?: Record<string, unknown> } | null;
  runTurn: (..._args: unknown[]) => Promise<void>;
  close: () => Promise<void>;
  cancelSession: (..._args: unknown[]) => Promise<void>;
  closeSession: (..._args: unknown[]) => Promise<void>;
};
export const createAcpManager = (..._args: unknown[]) => ({}) as AcpManager;

export const getAcpSessionManager = (..._args: unknown[]) =>
  ({
    resolveSession: () => null,
    runTurn: async () => {},
    close: async () => {},
    cancelSession: async () => {},
    closeSession: async () => {},
  }) as AcpManager;
