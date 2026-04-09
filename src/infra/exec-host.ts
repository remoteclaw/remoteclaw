// Stub — new upstream module (v2026.3.2); full implementation deferred

export type ExecHostRequest = {
  command: string[];
  rawCommand?: string | null;
  cwd?: string | null;
  env?: Record<string, string> | null;
  timeoutMs?: number | null;
  needsScreenRecording?: boolean | null;
  agentId?: string | null;
  sessionKey?: string | null;
  approvalDecision?: "allow-once" | "allow-always" | null;
};

export type ExecHostResponse = {
  exitCode?: number;
  timedOut: boolean;
  success: boolean;
  stdout: string;
  stderr: string;
  signal?: string;
};

export type ExecHostRunResult = ExecHostResponse;

export async function requestExecHostViaSocket(
  ..._args: unknown[]
): Promise<ExecHostResponse | null> {
  return null;
}
