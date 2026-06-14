import crypto from "node:crypto";
import type { GatewayClient } from "../gateway/client.js";
import { sanitizeSystemRunEnvOverrides } from "../infra/host-env-security.js";
import type {
  ExecEventPayload,
  ExecFinishedEventParams,
  RunResult,
  SystemRunParams,
} from "./invoke-types.js";

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

type SystemRunInvokeResult = {
  ok: boolean;
  payloadJSON?: string | null;
  error?: { code?: string; message?: string } | null;
};

type SystemRunDeniedReason = "permission:screenRecording";

type SystemRunExecutionContext = {
  sessionKey: string;
  runId: string;
  cmdText: string;
};

type SystemRunParsePhase = {
  argv: string[];
  cmdText: string;
  sessionKey: string;
  runId: string;
  execution: SystemRunExecutionContext;
  env: Record<string, string> | undefined;
  cwd: string | undefined;
  timeoutMs: number | undefined;
  needsScreenRecording: boolean;
};

export type HandleSystemRunInvokeOptions = {
  client: GatewayClient;
  params: SystemRunParams;
  sanitizeEnv: (overrides?: Record<string, string> | null) => Record<string, string> | undefined;
  runCommand: (
    argv: string[],
    cwd: string | undefined,
    env: Record<string, string> | undefined,
    timeoutMs: number | undefined,
  ) => Promise<RunResult>;
  sendNodeEvent: (client: GatewayClient, event: string, payload: unknown) => Promise<void>;
  buildExecEventPayload: (payload: ExecEventPayload) => ExecEventPayload;
  sendInvokeResult: (result: SystemRunInvokeResult) => Promise<void>;
  sendExecFinishedEvent: (params: ExecFinishedEventParams) => Promise<void>;
};

async function loadSystemRunConfig(opts: HandleSystemRunInvokeOptions): Promise<RemoteClawConfig> {
  if (opts.loadConfig) {
    return opts.loadConfig();
  }
  const { loadConfig } = await import("../config/config.js");
  return loadConfig();
}

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

  const cmdText = command.cmdText;
  const sessionKey = opts.params.sessionKey?.trim() || "node";
  const runId = opts.params.runId?.trim() || crypto.randomUUID();
  const envOverrides = sanitizeSystemRunEnvOverrides({
    overrides: opts.params.env ?? undefined,
    shellWrapper: command.shellCommand !== null,
  });
  return {
    argv: command.argv,
    cmdText,
    sessionKey,
    runId,
    execution: { sessionKey, runId, cmdText },
    env: opts.sanitizeEnv(envOverrides),
    cwd: opts.params.cwd?.trim() || undefined,
    timeoutMs: opts.params.timeoutMs ?? undefined,
    needsScreenRecording: opts.params.needsScreenRecording === true,
  };
}

export async function handleSystemRunInvoke(opts: HandleSystemRunInvokeOptions): Promise<void> {
  const parsed = await parseSystemRunPhase(opts);
  if (!parsed) {
    return;
  }

  if (parsed.needsScreenRecording) {
    await sendSystemRunDenied(opts, parsed.execution, {
      reason: "permission:screenRecording",
      message: "PERMISSION_MISSING: screenRecording",
    });
    return;
  }

  const result = await opts.runCommand(parsed.argv, parsed.cwd, parsed.env, parsed.timeoutMs);
  applyOutputTruncation(result);
  await opts.sendExecFinishedEvent({
    sessionKey: parsed.sessionKey,
    runId: parsed.runId,
    cmdText: parsed.cmdText,
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
