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
  defaults?: {
    ask?: ExecAsk;
    security?: ExecSecurity;
    [key: string]: unknown;
  };
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
export const loadExecApprovals = ensureExecApprovals;
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

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const DEFAULT_EXEC_APPROVAL_TIMEOUT_MS = 30000;

const ASK_ORDER: ExecAsk[] = ["off", "on-miss", "always"];
const SECURITY_ORDER: ExecSecurity[] = ["deny", "allowlist", "full"];

export function maxAsk(a: ExecAsk, b: ExecAsk): ExecAsk {
  return ASK_ORDER[Math.max(ASK_ORDER.indexOf(a), ASK_ORDER.indexOf(b))] ?? "always";
}
export function minSecurity(a: ExecSecurity, b: ExecSecurity): ExecSecurity {
  return SECURITY_ORDER[Math.min(SECURITY_ORDER.indexOf(a), SECURITY_ORDER.indexOf(b))] ?? "deny";
}
export function normalizeExecAsk(v: unknown): ExecAsk | undefined {
  if (typeof v === "string" && ["off", "on-miss", "always"].includes(v)) {
    return v as ExecAsk;
  }
  return undefined;
}
export function normalizeExecSecurity(v: unknown): ExecSecurity | undefined {
  if (typeof v === "string" && ["deny", "allowlist", "full"].includes(v)) {
    return v as ExecSecurity;
  }
  return undefined;
}

export async function resolveExecApprovalsFromFile(params: {
  file: ExecApprovalsFile;
  agentId?: string;
  overrides?: { security?: ExecSecurity; ask?: ExecAsk };
}): Promise<ExecApprovalsResolved> {
  const file = params.file ?? {};
  const defaults = file.defaults as
    | { security?: ExecSecurity; ask?: ExecAsk; askFallback?: string }
    | undefined;
  return {
    file: file as Record<string, unknown>,
    agent: {
      security: params.overrides?.security ?? defaults?.security ?? "allowlist",
      ask: params.overrides?.ask ?? defaults?.ask ?? "on-miss",
      askFallback: defaults?.askFallback,
    },
    allowlist: [],
    socketPath: undefined,
    token: undefined,
    defaults,
  };
}
export type SystemRunApprovalPlan = {
  approved: boolean;
  reason?: string;
  rawCommand?: string;
  mutableFileOperand?: string;
};
