import path from "node:path";
import { type CommandOptions, runCommandWithTimeout } from "../process/exec.js";
import { readPackageName, readPackageVersion } from "./package-json.js";
import { trimLogTail } from "./restart-sentinel.js";
import { type UpdateChannel, channelToNpmTag, DEFAULT_PACKAGE_CHANNEL } from "./update-channels.js";
import {
  cleanupGlobalRenameDirs,
  detectGlobalInstallManagerForRoot,
  globalInstallArgs,
  globalInstallFallbackArgs,
} from "./update-global.js";

export type UpdateStepResult = {
  name: string;
  command: string;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  stdoutTail?: string | null;
  stderrTail?: string | null;
};

export type UpdateRunResult = {
  status: "ok" | "error" | "skipped";
  mode: "pnpm" | "bun" | "npm" | "unknown";
  root?: string;
  reason?: string;
  before?: { version?: string | null };
  after?: { version?: string | null };
  steps: UpdateStepResult[];
  durationMs: number;
};

type CommandRunner = (
  argv: string[],
  options: CommandOptions,
) => Promise<{ stdout: string; stderr: string; code: number | null }>;

export type UpdateStepInfo = {
  name: string;
  command: string;
  index: number;
  total: number;
};

export type UpdateStepCompletion = UpdateStepInfo & {
  durationMs: number;
  exitCode: number | null;
  stderrTail?: string | null;
};

export type UpdateStepProgress = {
  onStepStart?: (step: UpdateStepInfo) => void;
  onStepComplete?: (step: UpdateStepCompletion) => void;
};

type UpdateRunnerOptions = {
  cwd?: string;
  argv1?: string;
  tag?: string;
  channel?: UpdateChannel;
  timeoutMs?: number;
  runCommand?: CommandRunner;
  progress?: UpdateStepProgress;
};

const DEFAULT_TIMEOUT_MS = 20 * 60_000;
const MAX_LOG_CHARS = 8000;
const START_DIRS = ["cwd", "argv1", "process"];
const DEFAULT_PACKAGE_NAME = "remoteclaw";

function normalizeDir(value?: string | null) {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return path.resolve(trimmed);
}

function resolveNodeModulesBinPackageRoot(argv1: string): string | null {
  const normalized = path.resolve(argv1);
  const parts = normalized.split(path.sep);
  const binIndex = parts.lastIndexOf(".bin");
  if (binIndex <= 0) {
    return null;
  }
  if (parts[binIndex - 1] !== "node_modules") {
    return null;
  }
  const binName = path.basename(normalized);
  const nodeModulesDir = parts.slice(0, binIndex).join(path.sep);
  return path.join(nodeModulesDir, binName);
}

function buildStartDirs(opts: UpdateRunnerOptions): string[] {
  const dirs: string[] = [];
  const cwd = normalizeDir(opts.cwd);
  if (cwd) {
    dirs.push(cwd);
  }
  const argv1 = normalizeDir(opts.argv1);
  if (argv1) {
    dirs.push(path.dirname(argv1));
    const packageRoot = resolveNodeModulesBinPackageRoot(argv1);
    if (packageRoot) {
      dirs.push(packageRoot);
    }
  }
  const proc = normalizeDir(process.cwd());
  if (proc) {
    dirs.push(proc);
  }
  return Array.from(new Set(dirs));
}

function normalizeTag(tag?: string) {
  const trimmed = tag?.trim();
  if (!trimmed) {
    return "latest";
  }
  if (trimmed.startsWith("remoteclaw@")) {
    return trimmed.slice("remoteclaw@".length);
  }
  if (trimmed.startsWith(`${DEFAULT_PACKAGE_NAME}@`)) {
    return trimmed.slice(`${DEFAULT_PACKAGE_NAME}@`.length);
  }
  return trimmed;
}

export async function runGatewayUpdate(opts: UpdateRunnerOptions = {}): Promise<UpdateRunResult> {
  const startedAt = Date.now();
  const runCommand =
    opts.runCommand ??
    (async (argv, options) => {
      const res = await runCommandWithTimeout(argv, options);
      return { stdout: res.stdout, stderr: res.stderr, code: res.code };
    });
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const progress = opts.progress;
  const candidates = buildStartDirs(opts);

  // Resolve the package root from candidate directories.
  const pkgRoot = await resolvePackageRoot(candidates);

  if (!pkgRoot) {
    return {
      status: "error",
      mode: "unknown",
      reason: `no root (${START_DIRS.join(",")})`,
      steps: [],
      durationMs: Date.now() - startedAt,
    };
  }

  const beforeVersion = await readPackageVersion(pkgRoot);
  const globalManager = await detectGlobalInstallManagerForRoot(runCommand, pkgRoot, timeoutMs);
  if (globalManager) {
    const packageName = (await readPackageName(pkgRoot)) ?? DEFAULT_PACKAGE_NAME;
    await cleanupGlobalRenameDirs({
      globalRoot: path.dirname(pkgRoot),
      packageName,
    });
    const channel = opts.channel ?? DEFAULT_PACKAGE_CHANNEL;
    const tag = normalizeTag(opts.tag ?? channelToNpmTag(channel));
    const spec = `${packageName}@${tag}`;

    const command = globalInstallArgs(globalManager, spec).join(" ");
    const stepInfo: UpdateStepInfo = {
      name: "global update",
      command,
      index: 0,
      total: 1,
    };
    progress?.onStepStart?.(stepInfo);
    const stepStarted = Date.now();
    const result = await runCommand(globalInstallArgs(globalManager, spec), {
      cwd: pkgRoot,
      timeoutMs,
    });
    const stepDurationMs = Date.now() - stepStarted;
    const stderrTail = trimLogTail(result.stderr, MAX_LOG_CHARS);
    progress?.onStepComplete?.({
      ...stepInfo,
      durationMs: stepDurationMs,
      exitCode: result.code,
      stderrTail,
    });

    const updateStep: UpdateStepResult = {
      name: "global update",
      command,
      cwd: pkgRoot,
      durationMs: stepDurationMs,
      exitCode: result.code,
      stdoutTail: trimLogTail(result.stdout, MAX_LOG_CHARS),
      stderrTail,
    };
    const steps = [updateStep];

    let finalStep = updateStep;
    if (updateStep.exitCode !== 0) {
      const fallbackArgv = globalInstallFallbackArgs(globalManager, spec);
      if (fallbackArgv) {
        const fbCommand = fallbackArgv.join(" ");
        const fbStepInfo: UpdateStepInfo = {
          name: "global update (omit optional)",
          command: fbCommand,
          index: 0,
          total: 1,
        };
        progress?.onStepStart?.(fbStepInfo);
        const fbStarted = Date.now();
        const fbResult = await runCommand(fallbackArgv, {
          cwd: pkgRoot,
          timeoutMs,
        });
        const fbDurationMs = Date.now() - fbStarted;
        const fbStderrTail = trimLogTail(fbResult.stderr, MAX_LOG_CHARS);
        progress?.onStepComplete?.({
          ...fbStepInfo,
          durationMs: fbDurationMs,
          exitCode: fbResult.code,
          stderrTail: fbStderrTail,
        });

        const fallbackStep: UpdateStepResult = {
          name: "global update (omit optional)",
          command: fbCommand,
          cwd: pkgRoot,
          durationMs: fbDurationMs,
          exitCode: fbResult.code,
          stdoutTail: trimLogTail(fbResult.stdout, MAX_LOG_CHARS),
          stderrTail: fbStderrTail,
        };
        steps.push(fallbackStep);
        finalStep = fallbackStep;
      }
    }

    const afterVersion = await readPackageVersion(pkgRoot);
    return {
      status: finalStep.exitCode === 0 ? "ok" : "error",
      mode: globalManager,
      root: pkgRoot,
      reason: finalStep.exitCode === 0 ? undefined : finalStep.name,
      before: { version: beforeVersion },
      after: { version: afterVersion },
      steps,
      durationMs: Date.now() - startedAt,
    };
  }

  return {
    status: "skipped",
    mode: "unknown",
    root: pkgRoot,
    reason: "no-package-manager",
    before: { version: beforeVersion },
    steps: [],
    durationMs: Date.now() - startedAt,
  };
}

async function resolvePackageRoot(candidates: string[]): Promise<string | null> {
  for (const dir of candidates) {
    let current = dir;
    for (let i = 0; i < 12; i += 1) {
      const name = await readPackageName(current);
      if (name === DEFAULT_PACKAGE_NAME) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }
  return null;
}
