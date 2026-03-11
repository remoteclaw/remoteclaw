import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import {
  listAgentIds,
  resolveAgentDir,
  resolveAgentWorkspaceDir,
} from "../../agents/agent-scope.js";
import { ensureAgentWorkspace } from "../../agents/workspace.js";
import { movePathToTrash } from "../../browser/trash.js";
import {
  applyAgentConfig,
  findAgentEntryIndex,
  listAgentEntries,
  pruneAgentConfig,
} from "../../commands/agents.config.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveSessionTranscriptsDirForAgent } from "../../config/sessions/paths.js";
import { sameFileIdentity } from "../../infra/file-identity.js";
import { SafeOpenError, readLocalFileSafely } from "../../infra/fs-safe.js";
import { isNotFoundPathError, isPathInside } from "../../infra/path-guards.js";
import { DEFAULT_AGENT_ID, normalizeAgentId } from "../../routing/session-key.js";
import { resolveUserPath } from "../../utils.js";
import {
  ErrorCodes,
  errorShape,
  formatValidationErrors,
  validateAgentsCreateParams,
  validateAgentsDeleteParams,
  validateAgentsFilesGetParams,
  validateAgentsFilesListParams,
  validateAgentsFilesSetParams,
  validateAgentsListParams,
  validateAgentsUpdateParams,
} from "../protocol/index.js";
import { listAgentsForGateway } from "../session-utils.js";
import type { GatewayRequestHandlers } from "./types.js";

/**
 * Resolve the editableFiles glob list for a given agent.
 * Per-agent editableFiles override the defaults; if neither is set, returns [].
 */
function resolveEditableFiles(cfg: RemoteClawConfig, agentId: string): string[] {
  const agentEntry = (cfg.agents?.list ?? []).find(
    (e) => normalizeAgentId(e.id) === normalizeAgentId(agentId),
  );
  if (agentEntry?.editableFiles) {
    return agentEntry.editableFiles;
  }
  return cfg.agents?.defaults?.editableFiles ?? [];
}

/** Reject glob patterns with path traversal or absolute paths. */
function isUnsafePattern(pattern: string): boolean {
  return pattern.includes("..") || path.isAbsolute(pattern);
}

/** Check if a workspace-relative filename matches any of the allowed glob patterns. */
function matchesEditableGlobs(name: string, globs: string[]): boolean {
  if (globs.length === 0) {
    return false;
  }
  return globs.some((glob) => path.matchesGlob(name, glob));
}

type FileMeta = {
  size: number;
  updatedAtMs: number;
};

type ResolvedAgentWorkspaceFilePath =
  | {
      kind: "ready";
      requestPath: string;
      ioPath: string;
      workspaceReal: string;
    }
  | {
      kind: "missing";
      requestPath: string;
      ioPath: string;
      workspaceReal: string;
    }
  | {
      kind: "invalid";
      requestPath: string;
      reason: string;
    };

const SUPPORTS_NOFOLLOW = process.platform !== "win32" && "O_NOFOLLOW" in fsConstants;
const OPEN_WRITE_FLAGS =
  fsConstants.O_WRONLY |
  fsConstants.O_CREAT |
  fsConstants.O_TRUNC |
  (SUPPORTS_NOFOLLOW ? fsConstants.O_NOFOLLOW : 0);

async function resolveWorkspaceRealPath(workspaceDir: string): Promise<string> {
  try {
    return await fs.realpath(workspaceDir);
  } catch {
    return path.resolve(workspaceDir);
  }
}

async function resolveAgentWorkspaceFilePath(params: {
  workspaceDir: string;
  name: string;
  allowMissing: boolean;
}): Promise<ResolvedAgentWorkspaceFilePath> {
  const requestPath = path.join(params.workspaceDir, params.name);
  const workspaceReal = await resolveWorkspaceRealPath(params.workspaceDir);
  const candidatePath = path.resolve(workspaceReal, params.name);
  if (!isPathInside(workspaceReal, candidatePath)) {
    return { kind: "invalid", requestPath, reason: "path escapes workspace root" };
  }

  let candidateLstat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    candidateLstat = await fs.lstat(candidatePath);
  } catch (err) {
    if (isNotFoundPathError(err)) {
      if (params.allowMissing) {
        return { kind: "missing", requestPath, ioPath: candidatePath, workspaceReal };
      }
      return { kind: "invalid", requestPath, reason: "file not found" };
    }
    throw err;
  }

  if (candidateLstat.isSymbolicLink()) {
    let targetReal: string;
    try {
      targetReal = await fs.realpath(candidatePath);
    } catch (err) {
      if (isNotFoundPathError(err)) {
        if (params.allowMissing) {
          return { kind: "missing", requestPath, ioPath: candidatePath, workspaceReal };
        }
        return { kind: "invalid", requestPath, reason: "symlink target not found" };
      }
      throw err;
    }
    if (!isPathInside(workspaceReal, targetReal)) {
      return { kind: "invalid", requestPath, reason: "symlink target escapes workspace root" };
    }
    try {
      const targetStat = await fs.stat(targetReal);
      if (!targetStat.isFile()) {
        return { kind: "invalid", requestPath, reason: "symlink target is not a file" };
      }
    } catch (err) {
      if (isNotFoundPathError(err) && params.allowMissing) {
        return { kind: "missing", requestPath, ioPath: targetReal, workspaceReal };
      }
      throw err;
    }
    return { kind: "ready", requestPath, ioPath: targetReal, workspaceReal };
  }

  if (!candidateLstat.isFile()) {
    return { kind: "invalid", requestPath, reason: "path is not a regular file" };
  }

  const candidateReal = await fs.realpath(candidatePath).catch(() => candidatePath);
  if (!isPathInside(workspaceReal, candidateReal)) {
    return { kind: "invalid", requestPath, reason: "resolved file escapes workspace root" };
  }
  return { kind: "ready", requestPath, ioPath: candidateReal, workspaceReal };
}

async function statFileSafely(filePath: string): Promise<FileMeta | null> {
  try {
    const [stat, lstat] = await Promise.all([fs.stat(filePath), fs.lstat(filePath)]);
    if (lstat.isSymbolicLink() || !stat.isFile()) {
      return null;
    }
    if (!sameFileIdentity(stat, lstat)) {
      return null;
    }
    return {
      size: stat.size,
      updatedAtMs: Math.floor(stat.mtimeMs),
    };
  } catch {
    return null;
  }
}

async function writeFileSafely(filePath: string, content: string): Promise<void> {
  const handle = await fs.open(filePath, OPEN_WRITE_FLAGS, 0o600);
  try {
    const [stat, lstat] = await Promise.all([handle.stat(), fs.lstat(filePath)]);
    if (lstat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("unsafe file path");
    }
    if (!sameFileIdentity(stat, lstat)) {
      throw new Error("path changed during write");
    }
    await handle.writeFile(content, "utf-8");
  } finally {
    await handle.close().catch(() => {});
  }
}

/**
 * Recursively list all files under `dir`, returning workspace-relative paths.
 * Limits depth to avoid unbounded traversal.
 */
async function walkDir(dir: string, base: string, maxDepth: number, depth = 0): Promise<string[]> {
  if (depth > maxDepth) {
    return [];
  }
  let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const result: string[] = [];
  for (const entry of entries) {
    const name = String(entry.name);
    const relPath = base ? `${base}/${name}` : name;
    if (entry.isFile()) {
      result.push(relPath);
    } else if (entry.isDirectory() && !name.startsWith(".")) {
      const sub = await walkDir(path.join(dir, name), relPath, maxDepth, depth + 1);
      result.push(...sub);
    }
  }
  return result;
}

/** Compute the max directory depth implied by glob patterns. */
function maxGlobDepth(globs: string[]): number {
  let max = 0;
  for (const g of globs) {
    if (g.includes("**")) {
      return 10; // cap for safety
    }
    const depth = g.split("/").length - 1;
    if (depth > max) {
      max = depth;
    }
  }
  return Math.max(max, 0);
}

async function listAgentFiles(workspaceDir: string, globs: string[]) {
  const files: Array<{
    name: string;
    path: string;
    size: number;
    updatedAtMs: number;
  }> = [];

  if (globs.length === 0) {
    return files;
  }

  const depth = maxGlobDepth(globs);
  const allFiles = await walkDir(workspaceDir, "", depth);

  for (const relPath of allFiles) {
    if (!matchesEditableGlobs(relPath, globs)) {
      continue;
    }
    const resolved = await resolveAgentWorkspaceFilePath({
      workspaceDir,
      name: relPath,
      allowMissing: true,
    });
    const filePath = resolved.requestPath;
    const meta = resolved.kind === "ready" ? await statFileSafely(resolved.ioPath) : null;
    if (meta) {
      files.push({
        name: relPath,
        path: filePath,
        size: meta.size,
        updatedAtMs: meta.updatedAtMs,
      });
    }
  }

  return files;
}

function resolveAgentIdOrError(agentIdRaw: string, cfg: ReturnType<typeof loadConfig>) {
  const agentId = normalizeAgentId(agentIdRaw);
  const allowed = new Set(listAgentIds(cfg));
  if (!allowed.has(agentId)) {
    return null;
  }
  return agentId;
}

function sanitizeIdentityLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function resolveOptionalStringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function moveToTrashBestEffort(pathname: string): Promise<void> {
  if (!pathname) {
    return;
  }
  try {
    await fs.access(pathname);
  } catch {
    return;
  }
  try {
    await movePathToTrash(pathname);
  } catch {
    // Best-effort: path may already be gone or trash unavailable.
  }
}

export const agentsHandlers: GatewayRequestHandlers = {
  "agents.list": ({ params, respond }) => {
    if (!validateAgentsListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.list params: ${formatValidationErrors(validateAgentsListParams.errors)}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const result = listAgentsForGateway(cfg);
    respond(true, result, undefined);
  },
  "agents.create": async ({ params, respond }) => {
    if (!validateAgentsCreateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.create params: ${formatValidationErrors(
            validateAgentsCreateParams.errors,
          )}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const rawName = String(params.name ?? "").trim();
    const agentId = normalizeAgentId(rawName);
    if (agentId === DEFAULT_AGENT_ID) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `"${DEFAULT_AGENT_ID}" is reserved`),
      );
      return;
    }

    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) >= 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" already exists`),
      );
      return;
    }

    const workspaceDir = resolveUserPath(String(params.workspace ?? "").trim());

    // Resolve agentDir against the config we're about to persist (vs the pre-write config),
    // so subsequent resolutions can't disagree about the agent's directory.
    const emoji = resolveOptionalStringParam(params.emoji);
    const avatar = resolveOptionalStringParam(params.avatar);
    const identity = {
      name: sanitizeIdentityLine(rawName),
      ...(emoji ? { emoji: sanitizeIdentityLine(emoji) } : {}),
      ...(avatar ? { avatar: sanitizeIdentityLine(avatar) } : {}),
    };

    let nextConfig = applyAgentConfig(cfg, {
      agentId,
      name: rawName,
      workspace: workspaceDir,
      identity,
    });
    const agentDir = resolveAgentDir(nextConfig, agentId);
    nextConfig = applyAgentConfig(nextConfig, { agentId, agentDir });

    // Ensure workspace & transcripts exist BEFORE writing config so a failure
    // here does not leave a broken config entry behind.
    await ensureAgentWorkspace(workspaceDir);
    await fs.mkdir(resolveSessionTranscriptsDirForAgent(agentId), { recursive: true });

    await writeConfigFile(nextConfig);

    respond(true, { ok: true, agentId, name: rawName, workspace: workspaceDir }, undefined);
  },
  "agents.update": async ({ params, respond }) => {
    if (!validateAgentsUpdateParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.update params: ${formatValidationErrors(
            validateAgentsUpdateParams.errors,
          )}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const agentId = normalizeAgentId(String(params.agentId ?? ""));
    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" not found`),
      );
      return;
    }

    const workspaceDir =
      typeof params.workspace === "string" && params.workspace.trim()
        ? resolveUserPath(params.workspace.trim())
        : undefined;

    const model = resolveOptionalStringParam(params.model);
    const avatar = resolveOptionalStringParam(params.avatar);

    const nextConfig = applyAgentConfig(cfg, {
      agentId,
      ...(typeof params.name === "string" && params.name.trim()
        ? { name: params.name.trim() }
        : {}),
      ...(workspaceDir ? { workspace: workspaceDir } : {}),
      ...(model ? { model } : {}),
      ...(avatar ? { identity: { avatar: sanitizeIdentityLine(avatar) } } : {}),
    });

    await writeConfigFile(nextConfig);

    if (workspaceDir) {
      await ensureAgentWorkspace(workspaceDir);
    }

    respond(true, { ok: true, agentId }, undefined);
  },
  "agents.delete": async ({ params, respond }) => {
    if (!validateAgentsDeleteParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.delete params: ${formatValidationErrors(
            validateAgentsDeleteParams.errors,
          )}`,
        ),
      );
      return;
    }

    const cfg = loadConfig();
    const agentId = normalizeAgentId(String(params.agentId ?? ""));
    if (agentId === DEFAULT_AGENT_ID) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `"${DEFAULT_AGENT_ID}" cannot be deleted`),
      );
      return;
    }
    if (findAgentEntryIndex(listAgentEntries(cfg), agentId) < 0) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `agent "${agentId}" not found`),
      );
      return;
    }

    const deleteFiles = typeof params.deleteFiles === "boolean" ? params.deleteFiles : true;
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const agentDir = resolveAgentDir(cfg, agentId);
    const sessionsDir = resolveSessionTranscriptsDirForAgent(agentId);

    const result = pruneAgentConfig(cfg, agentId);
    await writeConfigFile(result.config);

    if (deleteFiles) {
      await Promise.all([
        moveToTrashBestEffort(workspaceDir),
        moveToTrashBestEffort(agentDir),
        moveToTrashBestEffort(sessionsDir),
      ]);
    }

    respond(true, { ok: true, agentId, removedBindings: result.removedBindings }, undefined);
  },
  "agents.files.list": async ({ params, respond }) => {
    if (!validateAgentsFilesListParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.files.list params: ${formatValidationErrors(
            validateAgentsFilesListParams.errors,
          )}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const agentId = resolveAgentIdOrError(String(params.agentId ?? ""), cfg);
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const globs = resolveEditableFiles(cfg, agentId);
    const unsafeGlob = globs.find(isUnsafePattern);
    if (unsafeGlob) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `editableFiles pattern "${unsafeGlob}" is unsafe (no ".." or absolute paths)`,
        ),
      );
      return;
    }
    const files = await listAgentFiles(workspaceDir, globs);
    respond(
      true,
      {
        agentId,
        workspace: workspaceDir,
        files,
        ...(globs.length === 0
          ? {
              hint: "configure agents.defaults.editableFiles or per-agent editableFiles to manage workspace files here",
            }
          : {}),
      },
      undefined,
    );
  },
  "agents.files.get": async ({ params, respond }) => {
    if (!validateAgentsFilesGetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.files.get params: ${formatValidationErrors(
            validateAgentsFilesGetParams.errors,
          )}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const rawAgentId = params.agentId;
    const agentId = resolveAgentIdOrError(
      typeof rawAgentId === "string" || typeof rawAgentId === "number" ? String(rawAgentId) : "",
      cfg,
    );
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const rawName = params.name;
    const name = (
      typeof rawName === "string" || typeof rawName === "number" ? String(rawName) : ""
    ).trim();
    if (!name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file name is required"));
      return;
    }
    if (isUnsafePattern(name)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsafe file name "${name}"`),
      );
      return;
    }
    const globs = resolveEditableFiles(cfg, agentId);
    if (!matchesEditableGlobs(name, globs)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `file "${name}" is not in editableFiles`),
      );
      return;
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const filePath = path.join(workspaceDir, name);
    const resolvedPath = await resolveAgentWorkspaceFilePath({
      workspaceDir,
      name,
      allowMissing: true,
    });
    if (resolvedPath.kind === "invalid") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `unsafe workspace file "${name}" (${resolvedPath.reason})`,
        ),
      );
      return;
    }
    if (resolvedPath.kind === "missing") {
      respond(
        true,
        {
          agentId,
          workspace: workspaceDir,
          file: { name, path: filePath, missing: true },
        },
        undefined,
      );
      return;
    }
    let safeRead: Awaited<ReturnType<typeof readLocalFileSafely>>;
    try {
      safeRead = await readLocalFileSafely({ filePath: resolvedPath.ioPath });
    } catch (err) {
      if (err instanceof SafeOpenError && err.code === "not-found") {
        respond(
          true,
          {
            agentId,
            workspace: workspaceDir,
            file: { name, path: filePath, missing: true },
          },
          undefined,
        );
        return;
      }
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsafe workspace file "${name}"`),
      );
      return;
    }
    respond(
      true,
      {
        agentId,
        workspace: workspaceDir,
        file: {
          name,
          path: filePath,
          missing: false,
          size: safeRead.stat.size,
          updatedAtMs: Math.floor(safeRead.stat.mtimeMs),
          content: safeRead.buffer.toString("utf-8"),
        },
      },
      undefined,
    );
  },
  "agents.files.set": async ({ params, respond }) => {
    if (!validateAgentsFilesSetParams(params)) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `invalid agents.files.set params: ${formatValidationErrors(
            validateAgentsFilesSetParams.errors,
          )}`,
        ),
      );
      return;
    }
    const cfg = loadConfig();
    const rawAgentId = params.agentId;
    const agentId = resolveAgentIdOrError(
      typeof rawAgentId === "string" || typeof rawAgentId === "number" ? String(rawAgentId) : "",
      cfg,
    );
    if (!agentId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "unknown agent id"));
      return;
    }
    const rawName = params.name;
    const name = (
      typeof rawName === "string" || typeof rawName === "number" ? String(rawName) : ""
    ).trim();
    if (!name) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "file name is required"));
      return;
    }
    if (isUnsafePattern(name)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsafe file name "${name}"`),
      );
      return;
    }
    const globs = resolveEditableFiles(cfg, agentId);
    if (!matchesEditableGlobs(name, globs)) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `file "${name}" is not in editableFiles`),
      );
      return;
    }
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    await fs.mkdir(workspaceDir, { recursive: true });
    const filePath = path.join(workspaceDir, name);
    const resolvedPath = await resolveAgentWorkspaceFilePath({
      workspaceDir,
      name,
      allowMissing: true,
    });
    if (resolvedPath.kind === "invalid") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `unsafe workspace file "${name}" (${resolvedPath.reason})`,
        ),
      );
      return;
    }
    const parentDir = path.dirname(resolvedPath.ioPath);
    if (parentDir !== resolvedPath.workspaceReal) {
      await fs.mkdir(parentDir, { recursive: true });
    }
    const content = String(params.content ?? "");
    try {
      await writeFileSafely(resolvedPath.ioPath, content);
    } catch {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `unsafe workspace file "${name}"`),
      );
      return;
    }
    const meta = await statFileSafely(resolvedPath.ioPath);
    respond(
      true,
      {
        ok: true,
        agentId,
        workspace: workspaceDir,
        file: {
          name,
          path: filePath,
          missing: false,
          size: meta?.size,
          updatedAtMs: meta?.updatedAtMs,
          content,
        },
      },
      undefined,
    );
  },
};
