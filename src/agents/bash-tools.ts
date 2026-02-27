// Stub: bash-tools infrastructure was gutted (#68/#70).
// This file provides type-only exports consumed by pi-embedded-runner
// (which cannot be modified).

export type ExecToolDefaults = {
  host?: string;
  security?: string;
  ask?: string;
  node?: string | boolean;
  pathPrepend?: string[];
  safeBins?: string[];
  safeBinTrustedDirs?: string[];
  safeBinProfiles?: Record<string, unknown>;
  agentId?: string;
  backgroundMs?: number;
  timeoutSec?: number;
  approvalRunningNoticeMs?: number;
  sandbox?: unknown;
  elevated?: ExecElevatedDefaults;
  allowBackground?: boolean;
  scopeKey?: string;
  sessionKey?: string;
  messageProvider?: string;
  notifyOnExit?: boolean;
  notifyOnExitEmptySuccess?: boolean;
  cwd?: string;
};

export type ExecElevatedDefaults = {
  enabled: boolean;
  allowed: boolean;
  defaultLevel: "on" | "off" | "ask" | "full";
};
