// Stub — new upstream module (v2026.3.2); full implementation deferred
// Gutted in RemoteClaw fork (Middleware Boundary Principle)

export type ExecHost = "sandbox" | "gateway" | "node";
export type ExecTarget = "auto" | ExecHost;
export type ExecSecurity = "deny" | "allowlist" | "full";
export type ExecAsk = "off" | "on-miss" | "always";

export type ExecAllowlistEntry = {
  pattern: string;
  type?: string;
};

export type ExecApprovalsResolved = {
  file: Record<string, unknown>;
  agent: {
    security: ExecSecurity;
    ask: ExecAsk;
    askFallback: string | undefined;
  };
  allowlist: ExecAllowlistEntry[];
  socketPath: string | undefined;
  token: string | undefined;
};

export type SkillBinTrustEntry = {
  bin: string;
  name?: string;
  resolvedPath?: string;
  trusted?: boolean;
};

export type ExecApprovalsFile = Record<string, unknown>;

export function resolveAllowAlwaysPatternEntries(..._args: unknown[]): unknown[] {
  return [];
}

export const ensureExecApprovals = (..._args: unknown[]) => ({}) as ExecApprovalsResolved;
export const mergeExecApprovalsSocketDefaults = (..._args: unknown[]) =>
  ({}) as ExecApprovalsResolved;
export const normalizeExecApprovals = (..._args: unknown[]) => ({}) as ExecApprovalsResolved;
export const readExecApprovalsSnapshot = (..._args: unknown[]) =>
  ({ path: "", exists: false, hash: "", file: {} as ExecApprovalsFile }) as {
    path: string;
    exists: boolean;
    hash: string;
    file: ExecApprovalsFile;
  };
export const saveExecApprovals = (..._args: unknown[]) => Promise.resolve(undefined as unknown);
