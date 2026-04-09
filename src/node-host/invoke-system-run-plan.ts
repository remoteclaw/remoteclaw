// Stub — new upstream module (v2026.3.2)
// Gutted in RemoteClaw fork (Middleware Boundary Principle)

export type SystemRunApprovalPlan = {
  approved: boolean;
  reason?: string;
  argv?: string[];
};

export type SystemRunApprovalFileOperand = {
  path: string;
  type: string;
};

export function buildSystemRunApprovalPlan(
  ..._args: unknown[]
): { ok: true; plan: SystemRunApprovalPlan; cmdText: string } | { ok: false; message: string } {
  return { ok: true, plan: { approved: true }, cmdText: "" };
}

export type HandleSystemRunInvokeOptions = {
  command: string[];
  rawCommand?: string | null;
  cwd?: string | null;
  env?: Record<string, string> | null;
};

export const handleSystemRunInvoke = (..._args: unknown[]) => Promise.resolve(undefined as unknown);

export function hardenApprovedExecutionPaths(
  ..._args: unknown[]
): { ok: true; argv: string[] } | { ok: false; error: string } {
  return { ok: true, argv: [] };
}
