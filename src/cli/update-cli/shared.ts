import { spawnSync } from "node:child_process";
import path from "node:path";
import { readPackageName, readPackageVersion } from "../../infra/package-json.js";
import { resolveRemoteClawPackageRoot } from "../../infra/remoteclaw-root.js";
import { trimLogTail } from "../../infra/restart-sentinel.js";
import { parseSemver } from "../../infra/runtime-guard.js";
import { fetchNpmTagVersion } from "../../infra/update-check.js";
import {
  detectGlobalInstallManagerByPresence,
  detectGlobalInstallManagerForRoot,
  type CommandRunner,
  type GlobalInstallManager,
} from "../../infra/update-global.js";
import type { UpdateStepProgress, UpdateStepResult } from "../../infra/update-runner.js";
import { runCommandWithTimeout } from "../../process/exec.js";
import { defaultRuntime } from "../../runtime.js";
import { theme } from "../../terminal/theme.js";
import { pathExists } from "../../utils.js";

export type UpdateCommandOptions = {
  json?: boolean;
  restart?: boolean;
  dryRun?: boolean;
  channel?: string;
  tag?: string;
  timeout?: string;
  yes?: boolean;
};

export type UpdateStatusOptions = {
  json?: boolean;
  timeout?: string;
};

export type UpdateWizardOptions = {
  timeout?: string;
};

const INVALID_TIMEOUT_ERROR = "--timeout must be a positive integer (seconds)";

export function parseTimeoutMsOrExit(timeout?: string): number | undefined | null {
  const timeoutMs = timeout ? Number.parseInt(timeout, 10) * 1000 : undefined;
  if (timeoutMs !== undefined && (Number.isNaN(timeoutMs) || timeoutMs <= 0)) {
    defaultRuntime.error(INVALID_TIMEOUT_ERROR);
    defaultRuntime.exit(1);
    return null;
  }
  return timeoutMs;
}

const MAX_LOG_CHARS = 8000;

export const DEFAULT_PACKAGE_NAME = "remoteclaw";

export function normalizeTag(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("remoteclaw@")) {
    return trimmed.slice("remoteclaw@".length);
  }
  if (trimmed.startsWith(`${DEFAULT_PACKAGE_NAME}@`)) {
    return trimmed.slice(`${DEFAULT_PACKAGE_NAME}@`.length);
  }
  return trimmed;
}

export function normalizeVersionTag(tag: string): string | null {
  const trimmed = tag.trim();
  if (!trimmed) {
    return null;
  }
  const cleaned = trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
  return parseSemver(cleaned) ? cleaned : null;
}

export { readPackageName, readPackageVersion };

export async function resolveTargetVersion(
  tag: string,
  timeoutMs?: number,
): Promise<string | null> {
  const direct = normalizeVersionTag(tag);
  if (direct) {
    return direct;
  }
  const res = await fetchNpmTagVersion({ tag, timeoutMs });
  return res.version ?? null;
}

export function resolveNodeRunner(): string {
  const base = path.basename(process.execPath).toLowerCase();
  if (base === "node" || base === "node.exe") {
    return process.execPath;
  }
  return "node";
}

export async function resolveUpdateRoot(): Promise<string> {
  return (
    (await resolveRemoteClawPackageRoot({
      moduleUrl: import.meta.url,
      argv1: process.argv[1],
      cwd: process.cwd(),
    })) ?? process.cwd()
  );
}

export async function runUpdateStep(params: {
  name: string;
  argv: string[];
  cwd?: string;
  timeoutMs: number;
  progress?: UpdateStepProgress;
}): Promise<UpdateStepResult> {
  const command = params.argv.join(" ");
  params.progress?.onStepStart?.({
    name: params.name,
    command,
    index: 0,
    total: 0,
  });

  const started = Date.now();
  const res = await runCommandWithTimeout(params.argv, {
    cwd: params.cwd,
    timeoutMs: params.timeoutMs,
  });
  const durationMs = Date.now() - started;
  const stderrTail = trimLogTail(res.stderr, MAX_LOG_CHARS);

  params.progress?.onStepComplete?.({
    name: params.name,
    command,
    index: 0,
    total: 0,
    durationMs,
    exitCode: res.code,
    stderrTail,
  });

  return {
    name: params.name,
    command,
    cwd: params.cwd ?? process.cwd(),
    durationMs,
    exitCode: res.code,
    stdoutTail: trimLogTail(res.stdout, MAX_LOG_CHARS),
    stderrTail,
  };
}

export async function resolveGlobalManager(params: {
  root: string;
  timeoutMs: number;
}): Promise<GlobalInstallManager> {
  const runCommand = createGlobalCommandRunner();

  const detected = await detectGlobalInstallManagerForRoot(
    runCommand,
    params.root,
    params.timeoutMs,
  );
  if (detected) {
    return detected;
  }

  const byPresence = await detectGlobalInstallManagerByPresence(runCommand, params.timeoutMs);
  return byPresence ?? "npm";
}

export async function tryWriteCompletionCache(root: string, jsonMode: boolean): Promise<void> {
  const binPath = path.join(root, "remoteclaw.mjs");
  if (!(await pathExists(binPath))) {
    return;
  }

  const result = spawnSync(resolveNodeRunner(), [binPath, "completion", "--write-state"], {
    cwd: root,
    env: process.env,
    encoding: "utf-8",
  });

  if (result.error) {
    if (!jsonMode) {
      defaultRuntime.log(theme.warn(`Completion cache update failed: ${String(result.error)}`));
    }
    return;
  }

  if (result.status !== 0 && !jsonMode) {
    const stderr = (result.stderr ?? "").toString().trim();
    const detail = stderr ? ` (${stderr})` : "";
    defaultRuntime.log(theme.warn(`Completion cache update failed${detail}.`));
  }
}

export function createGlobalCommandRunner(): CommandRunner {
  return async (argv, options) => {
    const res = await runCommandWithTimeout(argv, options);
    return { stdout: res.stdout, stderr: res.stderr, code: res.code };
  };
}
