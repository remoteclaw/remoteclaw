import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveAgentConfig } from "../agents/agent-scope.js";
import { loadConfig } from "../config/config.js";
import type { GatewayClient } from "../gateway/client.js";
import { sameFileIdentity } from "../infra/file-identity.js";
import { sanitizeSystemRunEnvOverrides } from "../infra/host-env-security.js";
import { normalizeSystemRunApprovalPlanV2 as normalizeSystemRunApprovalPlan } from "../infra/system-run-approval-binding.js";
import { logWarn } from "../logger.js";

// Stub types and functions: exec-approvals, exec-host, exec-safe-bin, system-run-command,
// and exec-policy infrastructure was gutted.
type ExecSecurity = "deny" | "allowlist" | "full";
type ExecAsk = "off" | "on-miss" | "always";
type ExecAllowlistEntry = { pattern: string };
type ExecCommandSegment = {
  argv: string[];
  resolution?: { resolvedPath?: string; effectiveArgv?: string[] };
};
type ExecHostRequest = Record<string, unknown>;
type ExecHostResponse = {
  ok: boolean;
  error: { reason: string; message: string };
  payload: ExecHostRunResult;
};
type ExecHostRunResult = Record<string, unknown>;

type ApprovedCwdSnapshot = {
  cwd: string;
  stat: fs.Stats;
};

function resolveSystemRunCommand(opts: {
  command?: unknown;
  rawCommand?: unknown;
}):
  | { ok: true; argv: string[]; shellCommand: string | null; cmdText: string }
  | { ok: false; message: string } {
  const cmd = opts.command;
  const raw = opts.rawCommand;
  if (Array.isArray(cmd) && cmd.length > 0) {
    const argv = cmd.map((c) => String(c));
    return { ok: true, argv, shellCommand: null, cmdText: argv.join(" ") };
  }
  if (typeof raw === "string" && raw.trim()) {
    const shell = process.platform === "win32" ? ["cmd.exe", "/c", raw] : ["sh", "-lc", raw];
    return { ok: true, argv: shell, shellCommand: raw, cmdText: raw };
  }
  return { ok: false, message: "command required" };
}

function resolveExecApprovals(
  _agentId?: string,
  overrides?: { security?: ExecSecurity; ask?: ExecAsk },
) {
  return {
    file: {} as Record<string, unknown>,
    agent: {
      security: overrides?.security ?? ("allowlist" as ExecSecurity),
      ask: overrides?.ask ?? ("on-miss" as ExecAsk),
      askFallback: undefined as string | undefined,
    },
    allowlist: [] as ExecAllowlistEntry[],
    socketPath: undefined as string | undefined,
    token: undefined as string | undefined,
  };
}

function evaluateExecAllowlist(_opts: Record<string, unknown>) {
  return {
    analysisOk: true,
    allowlistMatches: [] as ExecAllowlistEntry[],
    allowlistSatisfied: false,
  };
}

function evaluateShellAllowlist(_opts: Record<string, unknown>) {
  return {
    analysisOk: true,
    allowlistMatches: [] as ExecAllowlistEntry[],
    allowlistSatisfied: false,
    segments: [] as ExecCommandSegment[],
  };
}

function analyzeArgvCommand(_opts: { argv: string[]; cwd?: string; env?: Record<string, string> }) {
  return { ok: true, segments: [] as ExecCommandSegment[] };
}

function resolveAllowAlwaysPatterns(_opts: Record<string, unknown>) {
  return [] as string[];
}

function addAllowlistEntry(
  _file: Record<string, unknown>,
  _agentId: string | undefined,
  _pattern: string,
) {
  // no-op: exec approvals gutted
}

function recordAllowlistUse(
  _file: Record<string, unknown>,
  _agentId: string | undefined,
  _match: ExecAllowlistEntry,
  _cmdText: string,
  _resolvedPath?: string,
) {
  // no-op: exec approvals gutted
}

function resolveExecSafeBinRuntimePolicy(_opts: Record<string, unknown>) {
  return {
    safeBins: new Set<string>(),
    safeBinProfiles: {} as Record<string, unknown>,
    trustedSafeBinDirs: new Set<string>(),
  };
}

function evaluateSystemRunPolicy(opts: Record<string, unknown>) {
  return {
    allowed: true,
    approvedByAsk: opts.approved === true,
    analysisOk: true,
    allowlistSatisfied: false,
    eventReason: "approval-required" as const,
    errorMessage: "SYSTEM_RUN_DENIED: approval required",
    approvalDecision: opts.approvalDecision as string | undefined,
  };
}

function resolveExecApprovalDecision(value?: unknown): string | undefined {
  if (value === "allow-once" || value === "allow-always") {
    return value;
  }
  return undefined;
}

export function formatSystemRunAllowlistMissMessage(_opts?: Record<string, unknown>): string {
  return "SYSTEM_RUN_DENIED: allowlist miss";
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isPathLikeExecutableToken(value: string): boolean {
  if (!value) {
    return false;
  }
  if (value.startsWith(".") || value.startsWith("/") || value.startsWith("\\")) {
    return true;
  }
  if (value.includes("/") || value.includes("\\")) {
    return true;
  }
  if (process.platform === "win32" && /^[a-zA-Z]:[\\/]/.test(value)) {
    return true;
  }
  return false;
}

function pathComponentsFromRootSync(targetPath: string): string[] {
  const absolute = path.resolve(targetPath);
  const parts: string[] = [];
  let cursor = absolute;
  while (true) {
    parts.unshift(cursor);
    const parent = path.dirname(cursor);
    if (parent === cursor) {
      return parts;
    }
    cursor = parent;
  }
}

function isWritableByCurrentProcessSync(candidate: string): boolean {
  try {
    fs.accessSync(candidate, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function hasMutableSymlinkPathComponentSync(targetPath: string): boolean {
  for (const component of pathComponentsFromRootSync(targetPath)) {
    try {
      if (!fs.lstatSync(component).isSymbolicLink()) {
        continue;
      }
      const parentDir = path.dirname(component);
      if (isWritableByCurrentProcessSync(parentDir)) {
        return true;
      }
    } catch {
      return true;
    }
  }
  return false;
}

function resolveCanonicalApprovalCwdSync(
  rawCwd: string,
): { ok: true; snapshot: ApprovedCwdSnapshot } | { ok: false; message: string } {
  const requestedCwd = path.resolve(rawCwd);
  let cwdLstat: fs.Stats;
  let cwdStat: fs.Stats;
  let cwdReal: string;
  let cwdRealStat: fs.Stats;
  try {
    cwdLstat = fs.lstatSync(requestedCwd);
    cwdStat = fs.statSync(requestedCwd);
    cwdReal = fs.realpathSync(requestedCwd);
    cwdRealStat = fs.statSync(cwdReal);
  } catch {
    return {
      ok: false,
      message: "SYSTEM_RUN_DENIED: approval requires an existing canonical cwd",
    };
  }
  if (!cwdStat.isDirectory()) {
    return {
      ok: false,
      message: "SYSTEM_RUN_DENIED: approval requires cwd to be a directory",
    };
  }
  if (hasMutableSymlinkPathComponentSync(requestedCwd)) {
    return {
      ok: false,
      message: "SYSTEM_RUN_DENIED: approval requires canonical cwd (no symlink path components)",
    };
  }
  if (cwdLstat.isSymbolicLink()) {
    return {
      ok: false,
      message: "SYSTEM_RUN_DENIED: approval requires canonical cwd (no symlink cwd)",
    };
  }
  if (
    !sameFileIdentity(cwdStat, cwdLstat) ||
    !sameFileIdentity(cwdStat, cwdRealStat) ||
    !sameFileIdentity(cwdLstat, cwdRealStat)
  ) {
    return {
      ok: false,
      message: "SYSTEM_RUN_DENIED: approval cwd identity mismatch",
    };
  }
  return { ok: true, snapshot: { cwd: cwdReal, stat: cwdStat } };
}

export function hardenApprovedExecutionPaths(params: {
  approvedByAsk: boolean;
  argv: string[];
  shellCommand: string | null;
  cwd: string | undefined;
}):
  | {
      ok: true;
      argv: string[];
      argvChanged: boolean;
      cwd: string | undefined;
      approvedCwdSnapshot: ApprovedCwdSnapshot | undefined;
    }
  | { ok: false; message: string } {
  if (!params.approvedByAsk) {
    return {
      ok: true,
      argv: params.argv,
      argvChanged: false,
      cwd: params.cwd,
      approvedCwdSnapshot: undefined,
    };
  }

  let hardenedCwd = params.cwd;
  let approvedCwdSnapshot: ApprovedCwdSnapshot | undefined;
  if (hardenedCwd) {
    const canonicalCwd = resolveCanonicalApprovalCwdSync(hardenedCwd);
    if (!canonicalCwd.ok) {
      return canonicalCwd;
    }
    hardenedCwd = canonicalCwd.snapshot.cwd;
    approvedCwdSnapshot = canonicalCwd.snapshot;
  }

  if (params.shellCommand !== null || params.argv.length === 0) {
    return {
      ok: true,
      argv: params.argv,
      argvChanged: false,
      cwd: hardenedCwd,
      approvedCwdSnapshot,
    };
  }

  const argv = [...params.argv];
  const rawExecutable = argv[0] ?? "";
  if (!isPathLikeExecutableToken(rawExecutable)) {
    return { ok: true, argv, argvChanged: false, cwd: hardenedCwd, approvedCwdSnapshot };
  }

  const base = hardenedCwd ?? process.cwd();
  const candidate = path.isAbsolute(rawExecutable)
    ? rawExecutable
    : path.resolve(base, rawExecutable);
  let pinnedExecutable: string;
  try {
    pinnedExecutable = fs.realpathSync(candidate);
  } catch {
    return {
      ok: false,
      message: "SYSTEM_RUN_DENIED: approval requires a stable executable path",
    };
  }

  if (pinnedExecutable === params.argv[0]) {
    return {
      ok: true,
      argv: params.argv,
      argvChanged: false,
      cwd: hardenedCwd,
      approvedCwdSnapshot,
    };
  }

  argv[0] = pinnedExecutable;
  return { ok: true, argv, argvChanged: true, cwd: hardenedCwd, approvedCwdSnapshot };
}

export function formatExecCommand(argv: string[]): string {
  return argv
    .map((arg) => {
      if (arg.length === 0) {
        return '""';
      }
      const needsQuotes = /\s|"/.test(arg);
      if (!needsQuotes) {
        return arg;
      }
      return `"${arg.replace(/"/g, '\\"')}"`;
    })
    .join(" ");
}

export function buildSystemRunApprovalPlanV2(params: {
  command?: unknown;
  rawCommand?: unknown;
  cwd?: unknown;
  agentId?: unknown;
  sessionKey?: unknown;
}): { ok: true; plan: SystemRunApprovalPlanV2; cmdText: string } | { ok: false; message: string } {
  const command = resolveSystemRunCommand({
    command: params.command,
    rawCommand: params.rawCommand,
  });
  if (!command.ok) {
    return { ok: false, message: command.message };
  }
  if (command.argv.length === 0) {
    return { ok: false, message: "command required" };
  }
  const hardening = hardenApprovedExecutionPaths({
    approvedByAsk: true,
    argv: command.argv,
    shellCommand: command.shellCommand,
    cwd: normalizeString(params.cwd) ?? undefined,
  });
  if (!hardening.ok) {
    return { ok: false, message: hardening.message };
  }
  const rawCommand = hardening.argvChanged
    ? formatExecCommand(hardening.argv) || null
    : command.cmdText.trim() || null;
  return {
    ok: true,
    plan: {
      version: 2,
      argv: hardening.argv,
      cwd: hardening.cwd ?? null,
      rawCommand,
      commandPreview: rawCommand,
      agentId: normalizeString(params.agentId),
      sessionKey: normalizeString(params.sessionKey),
    },
    cmdText: command.cmdText,
  };
}

function revalidateApprovedCwdSnapshot(params: { snapshot: ApprovedCwdSnapshot }): boolean {
  const { cwd, stat: approvedStat } = params.snapshot;
  const hardened = hardenApprovedExecutionPaths({
    approvedByAsk: true,
    argv: [],
    shellCommand: null,
    cwd,
  });
  if (!hardened.ok || hardened.cwd !== cwd) {
    return false;
  }
  let currentCwdStat: fs.Stats;
  try {
    currentCwdStat = fs.statSync(cwd);
  } catch {
    return false;
  }
  if (!currentCwdStat.isDirectory()) {
    return false;
  }
  if (!sameFileIdentity(approvedStat, currentCwdStat)) {
    return false;
  }
  return true;
}

function hashFileContentsSync(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function revalidateApprovedMutableFileOperand(params: {
  snapshot: SystemRunApprovalFileOperand;
  argv: string[];
  cwd: string | undefined;
}): boolean {
  const operand = params.argv[params.snapshot.argvIndex]?.trim();
  if (!operand) {
    return false;
  }
  const resolvedPath = path.resolve(params.cwd ?? process.cwd(), operand);
  let realPath: string;
  try {
    realPath = fs.realpathSync(resolvedPath);
  } catch {
    return false;
  }
  if (realPath !== params.snapshot.path) {
    return false;
  }
  try {
    return hashFileContentsSync(realPath) === params.snapshot.sha256;
  } catch {
    return false;
  }
}

import type {
  SystemRunApprovalFileOperand,
  SystemRunApprovalPlanV2,
} from "../infra/system-run-approval-binding.js";
import type {
  ExecEventPayload,
  ExecFinishedEventParams,
  RunResult,
  SystemRunParams,
} from "./invoke-types.js";

type SystemRunInvokeResult = {
  ok: boolean;
  payloadJSON?: string | null;
  error?: { code?: string; message?: string } | null;
};

type SystemRunDeniedReason =
  | "security=deny"
  | "approval-required"
  | "allowlist-miss"
  | "execution-plan-miss"
  | "companion-unavailable"
  | "permission:screenRecording";

type SystemRunExecutionContext = {
  sessionKey: string;
  runId: string;
  cmdText: string;
};

type SystemRunAllowlistAnalysis = {
  analysisOk: boolean;
  allowlistMatches: ExecAllowlistEntry[];
  allowlistSatisfied: boolean;
  segments: ExecCommandSegment[];
};

type ResolvedExecApprovals = ReturnType<typeof resolveExecApprovals>;

type SystemRunParsePhase = {
  argv: string[];
  shellCommand: string | null;
  cmdText: string;
  approvalPlan: SystemRunApprovalPlanV2 | null;
  agentId: string | undefined;
  sessionKey: string;
  runId: string;
  execution: SystemRunExecutionContext;
  approvalDecision: ReturnType<typeof resolveExecApprovalDecision>;
  envOverrides: Record<string, string> | undefined;
  env: Record<string, string> | undefined;
  cwd: string | undefined;
  timeoutMs: number | undefined;
  needsScreenRecording: boolean;
  approved: boolean;
};

type SystemRunPolicyPhase = SystemRunParsePhase & {
  approvals: ResolvedExecApprovals;
  security: ExecSecurity;
  policy: ReturnType<typeof evaluateSystemRunPolicy>;
  allowlistMatches: ExecAllowlistEntry[];
  analysisOk: boolean;
  allowlistSatisfied: boolean;
  segments: ExecCommandSegment[];
  plannedAllowlistArgv: string[] | undefined;
  isWindows: boolean;
  approvedCwdSnapshot: ApprovedCwdSnapshot | undefined;
};

const safeBinTrustedDirWarningCache = new Set<string>();
const APPROVAL_CWD_DRIFT_DENIED_MESSAGE =
  "SYSTEM_RUN_DENIED: approval cwd changed before execution";
const APPROVAL_SCRIPT_OPERAND_DRIFT_DENIED_MESSAGE =
  "SYSTEM_RUN_DENIED: approval script operand changed before execution";

function warnWritableTrustedDirOnce(message: string): void {
  if (safeBinTrustedDirWarningCache.has(message)) {
    return;
  }
  safeBinTrustedDirWarningCache.add(message);
  logWarn(message);
}

function normalizeDeniedReason(reason: string | null | undefined): SystemRunDeniedReason {
  switch (reason) {
    case "security=deny":
    case "approval-required":
    case "allowlist-miss":
    case "execution-plan-miss":
    case "companion-unavailable":
    case "permission:screenRecording":
      return reason;
    default:
      return "approval-required";
  }
}

export type HandleSystemRunInvokeOptions = {
  client: GatewayClient;
  params: SystemRunParams;
  execHostEnforced: boolean;
  execHostFallbackAllowed: boolean;
  resolveExecSecurity: (value?: string) => ExecSecurity;
  resolveExecAsk: (value?: string) => ExecAsk;
  isCmdExeInvocation: (argv: string[]) => boolean;
  sanitizeEnv: (overrides?: Record<string, string> | null) => Record<string, string> | undefined;
  runCommand: (
    argv: string[],
    cwd: string | undefined,
    env: Record<string, string> | undefined,
    timeoutMs: number | undefined,
  ) => Promise<RunResult>;
  runViaMacAppExecHost: (params: {
    approvals: ReturnType<typeof resolveExecApprovals>;
    request: ExecHostRequest;
  }) => Promise<ExecHostResponse | null>;
  sendNodeEvent: (client: GatewayClient, event: string, payload: unknown) => Promise<void>;
  buildExecEventPayload: (payload: ExecEventPayload) => ExecEventPayload;
  sendInvokeResult: (result: SystemRunInvokeResult) => Promise<void>;
  sendExecFinishedEvent: (params: ExecFinishedEventParams) => Promise<void>;
  preferMacAppExecHost: boolean;
};

async function sendSystemRunDenied(
  opts: Pick<
    HandleSystemRunInvokeOptions,
    "client" | "sendNodeEvent" | "buildExecEventPayload" | "sendInvokeResult"
  >,
  execution: SystemRunExecutionContext,
  params: {
    reason: SystemRunDeniedReason;
    message: string;
  },
) {
  await opts.sendNodeEvent(
    opts.client,
    "exec.denied",
    opts.buildExecEventPayload({
      sessionKey: execution.sessionKey,
      runId: execution.runId,
      host: "node",
      command: execution.cmdText,
      reason: params.reason,
    }),
  );
  await opts.sendInvokeResult({
    ok: false,
    error: { code: "UNAVAILABLE", message: params.message },
  });
}

function evaluateSystemRunAllowlist(params: {
  shellCommand: string | null;
  argv: string[];
  approvals: ReturnType<typeof resolveExecApprovals>;
  security: ExecSecurity;
  safeBins: ReturnType<typeof resolveExecSafeBinRuntimePolicy>["safeBins"];
  safeBinProfiles: ReturnType<typeof resolveExecSafeBinRuntimePolicy>["safeBinProfiles"];
  trustedSafeBinDirs: ReturnType<typeof resolveExecSafeBinRuntimePolicy>["trustedSafeBinDirs"];
  cwd: string | undefined;
  env: Record<string, string> | undefined;
}): SystemRunAllowlistAnalysis {
  if (params.shellCommand) {
    const allowlistEval = evaluateShellAllowlist({
      command: params.shellCommand,
      allowlist: params.approvals.allowlist,
      safeBins: params.safeBins,
      safeBinProfiles: params.safeBinProfiles,
      cwd: params.cwd,
      env: params.env,
      trustedSafeBinDirs: params.trustedSafeBinDirs,
      platform: process.platform,
    });
    return {
      analysisOk: allowlistEval.analysisOk,
      allowlistMatches: allowlistEval.allowlistMatches,
      allowlistSatisfied:
        params.security === "allowlist" && allowlistEval.analysisOk
          ? allowlistEval.allowlistSatisfied
          : false,
      segments: allowlistEval.segments,
    };
  }

  const analysis = analyzeArgvCommand({ argv: params.argv, cwd: params.cwd, env: params.env });
  const allowlistEval = evaluateExecAllowlist({
    analysis,
    allowlist: params.approvals.allowlist,
    safeBins: params.safeBins,
    safeBinProfiles: params.safeBinProfiles,
    cwd: params.cwd,
    trustedSafeBinDirs: params.trustedSafeBinDirs,
  });
  return {
    analysisOk: analysis.ok,
    allowlistMatches: allowlistEval.allowlistMatches,
    allowlistSatisfied:
      params.security === "allowlist" && analysis.ok ? allowlistEval.allowlistSatisfied : false,
    segments: analysis.segments,
  };
}

function resolvePlannedAllowlistArgv(params: {
  security: ExecSecurity;
  shellCommand: string | null;
  policy: {
    approvedByAsk: boolean;
    analysisOk: boolean;
    allowlistSatisfied: boolean;
  };
  segments: ExecCommandSegment[];
}): string[] | undefined | null {
  if (
    params.security !== "allowlist" ||
    params.policy.approvedByAsk ||
    params.shellCommand ||
    !params.policy.analysisOk ||
    !params.policy.allowlistSatisfied ||
    params.segments.length !== 1
  ) {
    return undefined;
  }
  const plannedAllowlistArgv = params.segments[0]?.resolution?.effectiveArgv;
  return plannedAllowlistArgv && plannedAllowlistArgv.length > 0 ? plannedAllowlistArgv : null;
}

function resolveSystemRunExecArgv(params: {
  plannedAllowlistArgv: string[] | undefined;
  argv: string[];
  security: ExecSecurity;
  isWindows: boolean;
  policy: {
    approvedByAsk: boolean;
    analysisOk: boolean;
    allowlistSatisfied: boolean;
  };
  shellCommand: string | null;
  segments: ExecCommandSegment[];
}): string[] {
  let execArgv = params.plannedAllowlistArgv ?? params.argv;
  if (
    params.security === "allowlist" &&
    params.isWindows &&
    !params.policy.approvedByAsk &&
    params.shellCommand &&
    params.policy.analysisOk &&
    params.policy.allowlistSatisfied &&
    params.segments.length === 1 &&
    params.segments[0]?.argv.length > 0
  ) {
    execArgv = params.segments[0].argv;
  }
  return execArgv;
}

function applyOutputTruncation(result: RunResult) {
  if (!result.truncated) {
    return;
  }
  const suffix = "... (truncated)";
  if (result.stderr.trim().length > 0) {
    result.stderr = `${result.stderr}\n${suffix}`;
  } else {
    result.stdout = `${result.stdout}\n${suffix}`;
  }
}

async function parseSystemRunPhase(
  opts: HandleSystemRunInvokeOptions,
): Promise<SystemRunParsePhase | null> {
  const command = resolveSystemRunCommand({
    command: opts.params.command,
    rawCommand: opts.params.rawCommand,
  });
  if (!command.ok) {
    await opts.sendInvokeResult({
      ok: false,
      error: { code: "INVALID_REQUEST", message: command.message },
    });
    return null;
  }
  if (command.argv.length === 0) {
    await opts.sendInvokeResult({
      ok: false,
      error: { code: "INVALID_REQUEST", message: "command required" },
    });
    return null;
  }

  const shellCommand = command.shellCommand;
  const cmdText = command.cmdText;
  const approvalPlan =
    opts.params.systemRunPlan === undefined
      ? null
      : normalizeSystemRunApprovalPlan(opts.params.systemRunPlan);
  if (opts.params.systemRunPlan !== undefined && !approvalPlan) {
    await opts.sendInvokeResult({
      ok: false,
      error: { code: "INVALID_REQUEST", message: "systemRunPlan invalid" },
    });
    return null;
  }
  const agentId = opts.params.agentId?.trim() || undefined;
  const sessionKey = opts.params.sessionKey?.trim() || "node";
  const runId = opts.params.runId?.trim() || crypto.randomUUID();
  const envOverrides = sanitizeSystemRunEnvOverrides({
    overrides: opts.params.env ?? undefined,
    shellWrapper: shellCommand !== null,
  });
  return {
    argv: command.argv,
    shellCommand,
    cmdText,
    approvalPlan,
    agentId,
    sessionKey,
    runId,
    execution: { sessionKey, runId, cmdText },
    approvalDecision: resolveExecApprovalDecision(opts.params.approvalDecision),
    envOverrides,
    env: opts.sanitizeEnv(envOverrides),
    cwd: opts.params.cwd?.trim() || undefined,
    timeoutMs: opts.params.timeoutMs ?? undefined,
    needsScreenRecording: opts.params.needsScreenRecording === true,
    approved: opts.params.approved === true,
  };
}

async function evaluateSystemRunPolicyPhase(
  opts: HandleSystemRunInvokeOptions,
  parsed: SystemRunParsePhase,
): Promise<SystemRunPolicyPhase | null> {
  const cfg = loadConfig();
  const agentExec = parsed.agentId
    ? resolveAgentConfig(cfg, parsed.agentId)?.tools?.exec
    : undefined;
  const configuredSecurity = opts.resolveExecSecurity(
    agentExec?.security ?? cfg.tools?.exec?.security,
  );
  const configuredAsk = opts.resolveExecAsk(agentExec?.ask ?? cfg.tools?.exec?.ask);
  const approvals = resolveExecApprovals(parsed.agentId, {
    security: configuredSecurity,
    ask: configuredAsk,
  });
  const security = approvals.agent.security;
  const ask = approvals.agent.ask;
  const { safeBins, safeBinProfiles, trustedSafeBinDirs } = resolveExecSafeBinRuntimePolicy({
    global: cfg.tools?.exec,
    local: agentExec,
    onWarning: warnWritableTrustedDirOnce,
  });
  let { analysisOk, allowlistMatches, allowlistSatisfied, segments } = evaluateSystemRunAllowlist({
    shellCommand: parsed.shellCommand,
    argv: parsed.argv,
    approvals,
    security,
    safeBins,
    safeBinProfiles,
    trustedSafeBinDirs,
    cwd: parsed.cwd,
    env: parsed.env,
  });
  const isWindows = process.platform === "win32";
  const cmdInvocation = parsed.shellCommand
    ? opts.isCmdExeInvocation(segments[0]?.argv ?? [])
    : opts.isCmdExeInvocation(parsed.argv);
  const policy = evaluateSystemRunPolicy({
    security,
    ask,
    analysisOk,
    allowlistSatisfied,
    approvalDecision: parsed.approvalDecision,
    approved: parsed.approved,
    isWindows,
    cmdInvocation,
    shellWrapperInvocation: parsed.shellCommand !== null,
  });
  analysisOk = policy.analysisOk;
  allowlistSatisfied = policy.allowlistSatisfied;
  if (!policy.allowed) {
    await sendSystemRunDenied(opts, parsed.execution, {
      reason: policy.eventReason,
      message: policy.errorMessage,
    });
    return null;
  }

  // Fail closed if policy/runtime drift re-allows unapproved shell wrappers.
  if (security === "allowlist" && parsed.shellCommand && !policy.approvedByAsk) {
    await sendSystemRunDenied(opts, parsed.execution, {
      reason: "approval-required",
      message: "SYSTEM_RUN_DENIED: approval required",
    });
    return null;
  }

  const hardenedPaths = hardenApprovedExecutionPaths({
    approvedByAsk: policy.approvedByAsk,
    argv: parsed.argv,
    shellCommand: parsed.shellCommand,
    cwd: parsed.cwd,
  });
  if (!hardenedPaths.ok) {
    await sendSystemRunDenied(opts, parsed.execution, {
      reason: "approval-required",
      message: hardenedPaths.message,
    });
    return null;
  }
  const approvedCwdSnapshot = policy.approvedByAsk ? hardenedPaths.approvedCwdSnapshot : undefined;
  if (policy.approvedByAsk && hardenedPaths.cwd && !approvedCwdSnapshot) {
    await sendSystemRunDenied(opts, parsed.execution, {
      reason: "approval-required",
      message: APPROVAL_CWD_DRIFT_DENIED_MESSAGE,
    });
    return null;
  }

  const plannedAllowlistArgv = resolvePlannedAllowlistArgv({
    security,
    shellCommand: parsed.shellCommand,
    policy,
    segments,
  });
  if (plannedAllowlistArgv === null) {
    await sendSystemRunDenied(opts, parsed.execution, {
      reason: "execution-plan-miss",
      message: "SYSTEM_RUN_DENIED: execution plan mismatch",
    });
    return null;
  }
  return {
    ...parsed,
    argv: hardenedPaths.argv,
    cwd: hardenedPaths.cwd,
    approvals,
    security,
    policy,
    allowlistMatches,
    analysisOk,
    allowlistSatisfied,
    segments,
    plannedAllowlistArgv: plannedAllowlistArgv ?? undefined,
    isWindows,
    approvedCwdSnapshot,
  };
}

async function executeSystemRunPhase(
  opts: HandleSystemRunInvokeOptions,
  phase: SystemRunPolicyPhase,
): Promise<void> {
  if (
    phase.approvedCwdSnapshot &&
    !revalidateApprovedCwdSnapshot({ snapshot: phase.approvedCwdSnapshot })
  ) {
    logWarn(`security: system.run approval cwd drift blocked (runId=${phase.runId})`);
    await sendSystemRunDenied(opts, phase.execution, {
      reason: "approval-required",
      message: APPROVAL_CWD_DRIFT_DENIED_MESSAGE,
    });
    return;
  }
  if (
    phase.approvalPlan?.mutableFileOperand &&
    !revalidateApprovedMutableFileOperand({
      snapshot: phase.approvalPlan.mutableFileOperand,
      argv: phase.argv,
      cwd: phase.cwd,
    })
  ) {
    logWarn(`security: system.run approval script drift blocked (runId=${phase.runId})`);
    await sendSystemRunDenied(opts, phase.execution, {
      reason: "approval-required",
      message: APPROVAL_SCRIPT_OPERAND_DRIFT_DENIED_MESSAGE,
    });
    return;
  }

  const useMacAppExec = opts.preferMacAppExecHost;
  if (useMacAppExec) {
    const execRequest: ExecHostRequest = {
      command: phase.plannedAllowlistArgv ?? phase.argv,
      // Forward canonical display text so companion approval/prompt surfaces bind to
      // the exact command context already validated on the node-host.
      rawCommand: phase.cmdText || null,
      cwd: phase.cwd ?? null,
      env: phase.envOverrides ?? null,
      timeoutMs: phase.timeoutMs ?? null,
      needsScreenRecording: phase.needsScreenRecording,
      agentId: phase.agentId ?? null,
      sessionKey: phase.sessionKey ?? null,
      approvalDecision: phase.approvalDecision,
    };
    const response = await opts.runViaMacAppExecHost({
      approvals: phase.approvals,
      request: execRequest,
    });
    if (!response) {
      if (opts.execHostEnforced || !opts.execHostFallbackAllowed) {
        await sendSystemRunDenied(opts, phase.execution, {
          reason: "companion-unavailable",
          message: "COMPANION_APP_UNAVAILABLE: macOS app exec host unreachable",
        });
        return;
      }
    } else if (!response.ok) {
      await sendSystemRunDenied(opts, phase.execution, {
        reason: normalizeDeniedReason(response.error.reason),
        message: response.error.message,
      });
      return;
    } else {
      const result: ExecHostRunResult = response.payload;
      await opts.sendExecFinishedEvent({
        sessionKey: phase.sessionKey,
        runId: phase.runId,
        cmdText: phase.cmdText,
        result,
      });
      await opts.sendInvokeResult({
        ok: true,
        payloadJSON: JSON.stringify(result),
      });
      return;
    }
  }

  if (phase.policy.approvalDecision === "allow-always" && phase.security === "allowlist") {
    if (phase.policy.analysisOk) {
      const patterns = resolveAllowAlwaysPatterns({
        segments: phase.segments,
        cwd: phase.cwd,
        env: phase.env,
        platform: process.platform,
      });
      for (const pattern of patterns) {
        if (pattern) {
          addAllowlistEntry(phase.approvals.file, phase.agentId, pattern);
        }
      }
    }
  }

  if (phase.allowlistMatches.length > 0) {
    const seen = new Set<string>();
    for (const match of phase.allowlistMatches) {
      if (!match?.pattern || seen.has(match.pattern)) {
        continue;
      }
      seen.add(match.pattern);
      recordAllowlistUse(
        phase.approvals.file,
        phase.agentId,
        match,
        phase.cmdText,
        phase.segments[0]?.resolution?.resolvedPath,
      );
    }
  }

  if (phase.needsScreenRecording) {
    await sendSystemRunDenied(opts, phase.execution, {
      reason: "permission:screenRecording",
      message: "PERMISSION_MISSING: screenRecording",
    });
    return;
  }

  const execArgv = resolveSystemRunExecArgv({
    plannedAllowlistArgv: phase.plannedAllowlistArgv,
    argv: phase.argv,
    security: phase.security,
    isWindows: phase.isWindows,
    policy: phase.policy,
    shellCommand: phase.shellCommand,
    segments: phase.segments,
  });

  const result = await opts.runCommand(execArgv, phase.cwd, phase.env, phase.timeoutMs);
  applyOutputTruncation(result);
  await opts.sendExecFinishedEvent({
    sessionKey: phase.sessionKey,
    runId: phase.runId,
    cmdText: phase.cmdText,
    result,
  });

  await opts.sendInvokeResult({
    ok: true,
    payloadJSON: JSON.stringify({
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      success: result.success,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error ?? null,
    }),
  });
}

export async function handleSystemRunInvoke(opts: HandleSystemRunInvokeOptions): Promise<void> {
  const parsed = await parseSystemRunPhase(opts);
  if (!parsed) {
    return;
  }
  const policyPhase = await evaluateSystemRunPolicyPhase(opts, parsed);
  if (!policyPhase) {
    return;
  }
  await executeSystemRunPhase(opts, policyPhase);
}
