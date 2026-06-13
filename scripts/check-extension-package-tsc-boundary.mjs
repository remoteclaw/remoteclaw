#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const repoRoot = resolve(import.meta.dirname, "..");
const tscBin = require.resolve("typescript/bin/tsc");
const extensionPackageBoundaryBaseConfig = "../tsconfig.package-boundary.base.json";
const FAILURE_OUTPUT_TAIL_LINES = 40;
const ROOTDIR_BOUNDARY_CANARY_IMPORT_PATH =
  "../../src/plugins/contracts/rootdir-boundary-canary.ts";
const ROOTDIR_BOUNDARY_CANARY_OUTPUT_HINT = "src/plugins/contracts/rootdir-boundary-canary.ts";

function parseMode(argv) {
  const modeArg = argv.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg?.slice("--mode=".length) ?? "all";
  if (!new Set(["all", "canary"]).has(mode)) {
    throw new Error(`Unknown mode: ${mode}`);
  }
  return mode;
}

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function summarizeOutputSection(name, output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return "";
  }

  const lines = trimmed.split("\n");
  if (lines.length <= FAILURE_OUTPUT_TAIL_LINES) {
    return `${name}:\n${trimmed}`;
  }

  const omittedLineCount = lines.length - FAILURE_OUTPUT_TAIL_LINES;
  const tail = lines.slice(-FAILURE_OUTPUT_TAIL_LINES).join("\n");
  return `${name}:\n[... ${omittedLineCount} earlier lines omitted ...]\n${tail}`;
}

function formatFailureFooter(params = {}) {
  const footerLines = [];
  if (params.kind) {
    footerLines.push(`kind: ${params.kind}`);
  }
  if (Number.isFinite(params.elapsedMs)) {
    footerLines.push(`elapsed: ${params.elapsedMs}ms`);
  }
  if (params.note) {
    footerLines.push(params.note);
  }
  return footerLines.join("\n");
}

export function formatBoundaryCheckSuccessSummary(params = {}) {
  const lines = ["extension package boundary check passed"];
  if (params.mode) {
    lines.push(`mode: ${params.mode}`);
  }
  if (Number.isInteger(params.canaryCount)) {
    lines.push(`canary plugins: ${params.canaryCount}`);
  }
  if (Number.isFinite(params.canaryElapsedMs) && params.canaryElapsedMs > 0) {
    lines.push(`canary elapsed: ${params.canaryElapsedMs}ms`);
  }
  if (Number.isFinite(params.elapsedMs)) {
    lines.push(`elapsed: ${params.elapsedMs}ms`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatStepFailure(label, params = {}) {
  const stdoutSection = summarizeOutputSection("stdout", params.stdout ?? "");
  const stderrSection = summarizeOutputSection("stderr", params.stderr ?? "");
  const footer = formatFailureFooter(params);
  return [label, stdoutSection, stderrSection, footer].filter(Boolean).join("\n\n");
}

function attachStepFailureMetadata(error, label, params = {}) {
  error.stepLabel = label;
  error.kind = params.kind ?? "unknown";
  error.elapsedMs = params.elapsedMs ?? null;
  error.fullOutput = [label, params.stdout ?? "", params.stderr ?? "", formatFailureFooter(params)]
    .filter(Boolean)
    .join("\n")
    .trim();
  return error;
}

function collectBundledExtensionIds() {
  return readdirSync(join(repoRoot, "extensions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

function resolveExtensionTsconfigPath(extensionId) {
  return join(repoRoot, "extensions", extensionId, "tsconfig.json");
}

function readExtensionTsconfig(extensionId) {
  return readJsonFile(resolveExtensionTsconfigPath(extensionId));
}

function collectOptInExtensionIds() {
  return collectBundledExtensionIds().filter((extensionId) => {
    const tsconfigPath = resolveExtensionTsconfigPath(extensionId);
    if (!existsSync(tsconfigPath)) {
      return false;
    }
    return readExtensionTsconfig(extensionId).extends === extensionPackageBoundaryBaseConfig;
  });
}

function collectCanaryExtensionIds(extensionIds) {
  return [
    ...new Map(
      extensionIds.map((extensionId) => [
        JSON.stringify(readExtensionTsconfig(extensionId)),
        extensionId,
      ]),
    ).values(),
  ];
}

function abortSiblingSteps(abortController) {
  if (abortController && !abortController.signal.aborted) {
    abortController.abort();
  }
}

export function runNodeStepAsync(label, args, timeoutMs, params = {}) {
  const abortController = params.abortController;
  const onFailure = params.onFailure;
  const startedAt = Date.now();
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      env: process.env,
      signal: abortController?.signal,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill("SIGTERM");
      settled = true;
      const error = attachStepFailureMetadata(
        new Error(
          formatStepFailure(label, {
            stdout,
            stderr,
            kind: "timeout",
            elapsedMs: Date.now() - startedAt,
            note: `${label} timed out after ${timeoutMs}ms`,
          }),
        ),
        label,
        {
          stdout,
          stderr,
          kind: "timeout",
          elapsedMs: Date.now() - startedAt,
          note: `${label} timed out after ${timeoutMs}ms`,
        },
      );
      onFailure?.(error);
      abortSiblingSteps(abortController);
      rejectPromise(error);
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      settled = true;
      if (error.name === "AbortError" && abortController?.signal.aborted) {
        rejectPromise(
          attachStepFailureMetadata(new Error(`${label} canceled after sibling failure`), label, {
            kind: "canceled",
            elapsedMs: Date.now() - startedAt,
            note: "canceled after sibling failure",
          }),
        );
        return;
      }
      const failure = attachStepFailureMetadata(
        new Error(
          formatStepFailure(label, {
            stdout,
            stderr,
            kind: "spawn-error",
            elapsedMs: Date.now() - startedAt,
            note: error.message,
          }),
        ),
        label,
        {
          stdout,
          stderr,
          kind: "spawn-error",
          elapsedMs: Date.now() - startedAt,
          note: error.message,
        },
      );
      onFailure?.(failure);
      abortSiblingSteps(abortController);
      rejectPromise(failure);
    });
    child.on("close", (code) => {
      if (settled) {
        return;
      }
      clearTimeout(timer);
      settled = true;
      if (code === 0) {
        resolvePromise({ stdout, stderr, elapsedMs: Date.now() - startedAt });
        return;
      }
      const error = attachStepFailureMetadata(
        new Error(
          formatStepFailure(label, {
            stdout,
            stderr,
            kind: "nonzero-exit",
            elapsedMs: Date.now() - startedAt,
          }),
        ),
        label,
        {
          stdout,
          stderr,
          kind: "nonzero-exit",
          elapsedMs: Date.now() - startedAt,
        },
      );
      onFailure?.(error);
      abortSiblingSteps(abortController);
      rejectPromise(error);
    });
  });
}

export function resolveCanaryArtifactPaths(extensionId, rootDir = repoRoot) {
  const extensionRoot = resolve(rootDir, "extensions", extensionId);
  return {
    extensionRoot,
    canaryPath: resolve(extensionRoot, "__rootdir_boundary_canary__.ts"),
    tsconfigPath: resolve(extensionRoot, "tsconfig.rootdir-canary.json"),
  };
}

export function cleanupCanaryArtifacts(extensionId, rootDir = repoRoot) {
  const { canaryPath, tsconfigPath } = resolveCanaryArtifactPaths(extensionId, rootDir);
  rmSync(canaryPath, { force: true });
  rmSync(tsconfigPath, { force: true });
}

export function cleanupCanaryArtifactsForExtensions(extensionIds, rootDir = repoRoot) {
  for (const extensionId of extensionIds) {
    cleanupCanaryArtifacts(extensionId, rootDir);
  }
}

export function installCanaryArtifactCleanup(extensionIds, params = {}) {
  const rootDir = params.rootDir ?? repoRoot;
  const processObject = params.processObject ?? process;
  const exitHandler = () => {
    cleanupCanaryArtifactsForExtensions(extensionIds, rootDir);
  };
  processObject.on("exit", exitHandler);
  return () => {
    processObject.off("exit", exitHandler);
  };
}

export function resolveBoundaryCheckLockPath(rootDir = repoRoot) {
  return resolve(rootDir, "dist", ".extension-package-boundary.lock");
}

function resolveBoundaryCheckLockOwnerPath(lockPath) {
  return join(lockPath, "owner.json");
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "EPERM");
  }
}

function removeStaleBoundaryCheckLock(lockPath) {
  const ownerPath = resolveBoundaryCheckLockOwnerPath(lockPath);
  let owner;
  try {
    owner = JSON.parse(readFileSync(ownerPath, "utf8"));
  } catch {
    rmSync(lockPath, { force: true, recursive: true });
    return true;
  }

  if (owner && typeof owner === "object" && isProcessAlive(owner.pid)) {
    return false;
  }
  rmSync(lockPath, { force: true, recursive: true });
  return true;
}

export function acquireBoundaryCheckLock(params = {}) {
  const rootDir = params.rootDir ?? repoRoot;
  const processObject = params.processObject ?? process;
  const lockPath = resolveBoundaryCheckLockPath(rootDir);
  mkdirSync(dirname(lockPath), { recursive: true });
  try {
    mkdirSync(lockPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
      if (removeStaleBoundaryCheckLock(lockPath)) {
        mkdirSync(lockPath);
      } else {
        throw attachStepFailureMetadata(
          new Error(
            [
              "extension package boundary check",
              "kind: lock-contention",
              `lock: ${lockPath}`,
              "another extension package boundary check is already running in this checkout",
            ].join("\n\n"),
            { cause: error },
          ),
          "extension package boundary check",
          {
            kind: "lock-contention",
            note: `lock: ${lockPath}\nanother extension package boundary check is already running in this checkout`,
          },
        );
      }
    } else {
      throw error;
    }
  }

  writeFileSync(
    resolveBoundaryCheckLockOwnerPath(lockPath),
    `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );

  const release = () => {
    rmSync(lockPath, { force: true, recursive: true });
  };
  processObject.on("exit", release);
  return () => {
    processObject.off("exit", release);
    release();
  };
}

async function runCanaryCheck(extensionIds) {
  const startedAt = Date.now();
  await Promise.all(
    extensionIds.map(async (extensionId, index) => {
      const { canaryPath, tsconfigPath } = resolveCanaryArtifactPaths(extensionId);

      cleanupCanaryArtifacts(extensionId);
      process.stdout.write(`[${index + 1}/${extensionIds.length}] ${extensionId} canary\n`);
      try {
        writeFileSync(
          canaryPath,
          [
            `import { ROOTDIR_BOUNDARY_CANARY } from "${ROOTDIR_BOUNDARY_CANARY_IMPORT_PATH}";`,
            "void ROOTDIR_BOUNDARY_CANARY;",
            "export {};",
            "",
          ].join("\n"),
          "utf8",
        );
        writeFileSync(
          tsconfigPath,
          `${JSON.stringify(
            {
              extends: "./tsconfig.json",
              include: ["./__rootdir_boundary_canary__.ts"],
              exclude: [],
            },
            null,
            2,
          )}\n`,
          "utf8",
        );

        const result = await runNodeStepAsync(
          `${extensionId} canary`,
          [tscBin, "-p", tsconfigPath, "--noEmit"],
          120_000,
        );
        throw new Error(
          `${extensionId} canary unexpectedly passed\n${result.stdout}${result.stderr}`,
        );
      } catch (error) {
        const output =
          error instanceof Error && typeof error.fullOutput === "string"
            ? error.fullOutput
            : String(error);
        if (!output.includes("TS6059") || !output.includes(ROOTDIR_BOUNDARY_CANARY_OUTPUT_HINT)) {
          throw error;
        }
      } finally {
        cleanupCanaryArtifacts(extensionId);
      }
    }),
  );
  return {
    canaryElapsedMs: Date.now() - startedAt,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const startedAt = Date.now();
  const mode = parseMode(argv);
  const optInExtensionIds = collectOptInExtensionIds();
  const canaryExtensionIds = collectCanaryExtensionIds(optInExtensionIds);
  const cleanupExtensionIds = optInExtensionIds;
  const releaseBoundaryLock = acquireBoundaryCheckLock();
  const teardownCanaryCleanup = installCanaryArtifactCleanup(cleanupExtensionIds);
  let canaryElapsedMs;

  try {
    cleanupCanaryArtifactsForExtensions(cleanupExtensionIds);
    ({ canaryElapsedMs } = await runCanaryCheck(canaryExtensionIds));
    process.stdout.write(
      formatBoundaryCheckSuccessSummary({
        mode,
        canaryCount: canaryExtensionIds.length,
        canaryElapsedMs,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  } finally {
    releaseBoundaryLock?.();
    teardownCanaryCleanup?.();
    cleanupCanaryArtifactsForExtensions(cleanupExtensionIds);
  }
}

if (import.meta.main) {
  await main();
}
