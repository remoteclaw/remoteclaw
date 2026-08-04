import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import { cancel, isCancel } from "@clack/prompts";
import { ensureAgentWorkspace } from "../agents/workspace.js";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveConfigPath } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { resolveSessionTranscriptsDirForAgent } from "../config/sessions.js";
import { callGateway } from "../gateway/call.js";
import { normalizeControlUiBasePath } from "../gateway/control-ui-shared.js";
import { isValidIPv4 } from "../gateway/net.js";
import { movePathToTrash } from "../infra/fs-safe.js";
import {
  inspectBestEffortPrimaryTailnetIPv4,
  pickBestEffortPrimaryLanIPv4,
} from "../infra/network-discovery-display.js";
import { isSafeExecutableValue } from "../infra/safe-executable-value.js";
import { resolveWindowsSystem32Path } from "../infra/windows-system-paths.js";
import { isWSL } from "../infra/wsl.js";
import { runCommandWithTimeout } from "../process/exec.js";
import type { RuntimeEnv } from "../runtime.js";
import { normalizeOptionalString } from "../shared/string-coerce.js";
import { stylePromptTitle } from "../terminal/prompt-style.js";
import {
  resolveConfigDir,
  resolveUserPath,
  shortenHomeInString,
  shortenHomePath,
  sleep,
} from "../utils.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import { VERSION } from "../version.js";
import type { OnboardMode, ResetScope } from "./onboard-types.js";

export function guardCancel<T>(value: T | symbol, runtime: RuntimeEnv): T {
  if (isCancel(value)) {
    cancel(stylePromptTitle("Setup cancelled.") ?? "Setup cancelled.");
    runtime.exit(0);
    throw new Error("unreachable");
  }
  return value;
}

export function summarizeExistingConfig(config: RemoteClawConfig): string {
  const rows: string[] = [];
  if (config.gateway?.mode) {
    rows.push(shortenHomeInString(`gateway.mode: ${config.gateway.mode}`));
  }
  if (typeof config.gateway?.port === "number") {
    rows.push(shortenHomeInString(`gateway.port: ${config.gateway.port}`));
  }
  if (config.gateway?.bind) {
    rows.push(shortenHomeInString(`gateway.bind: ${config.gateway.bind}`));
  }
  if (config.gateway?.remote?.url) {
    rows.push(shortenHomeInString(`gateway.remote.url: ${config.gateway.remote.url}`));
  }
  return rows.length ? rows.join("\n") : "No key settings detected.";
}

export function randomToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function normalizeGatewayTokenInput(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  // Reject the literal string "undefined" — a common bug when JS undefined
  // gets coerced to a string via template literals or String(undefined).
  if (trimmed === "undefined" || trimmed === "null") {
    return "";
  }
  return trimmed;
}

export function validateGatewayPasswordInput(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return "Required";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "Required";
  }
  if (trimmed === "undefined" || trimmed === "null") {
    return 'Cannot be the literal string "undefined" or "null"';
  }
  return undefined;
}

export function printWizardHeader(runtime: RuntimeEnv) {
  const header = [
    "▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄",
    "██░▄▄░██░▄▄▄██░▀▄▀░██░▄▄▄░██░░░░░██░▄▄▄██░▄▄▀██░████░▄▄▀██░███░██",
    "██░▀▀▄██░▄▄▄██░█░█░██░███░████░████░▄▄▄██░█████░████░▀▀░██░█░█░██",
    "██░█░███░▀▀▀██░█░█░██░▀▀▀░████░████░▀▀▀██░▀▀▄██░▀▀░█░██░██▄▀▄▀▄██",
    "▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀",
    "                        🦀 REMOTECLAW 🦀                         ",
    " ",
  ].join("\n");
  runtime.log(header);
}

export function applyWizardMetadata(
  cfg: RemoteClawConfig,
  params: { command: string; mode: OnboardMode },
): RemoteClawConfig {
  const commit =
    normalizeOptionalString(process.env.GIT_COMMIT) ?? normalizeOptionalString(process.env.GIT_SHA);
  return {
    ...cfg,
    wizard: {
      ...cfg.wizard,
      lastRunAt: new Date().toISOString(),
      lastRunVersion: VERSION,
      lastRunCommit: commit,
      lastRunCommand: params.command,
      lastRunMode: params.mode,
    },
  };
}

type BrowserOpenSupport = {
  ok: boolean;
  reason?: string;
  command?: string;
};

type BrowserOpenCommand = {
  argv: string[] | null;
  reason?: string;
  command?: string;
};

// Only web URLs may be handed to an OS URL handler. `file://` would open a
// local file, and custom schemes reach whatever application claims them, so a
// URL that reaches openUrl by mistake must not become an arbitrary OS action.
const BROWSER_OPEN_ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function isBrowserOpenableUrl(url: string): boolean {
  try {
    return BROWSER_OPEN_ALLOWED_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export async function resolveBrowserOpenCommand(): Promise<BrowserOpenCommand> {
  const platform = process.platform;
  const hasDisplay = Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
  const isSsh =
    Boolean(process.env.SSH_CLIENT) ||
    Boolean(process.env.SSH_TTY) ||
    Boolean(process.env.SSH_CONNECTION);

  if (isSsh && !hasDisplay && platform !== "win32") {
    return { argv: null, reason: "ssh-no-display" };
  }

  if (platform === "win32") {
    // rundll32 + FileProtocolHandler hands the URL to the registered handler as
    // a single argument. `cmd /c start` instead re-parses it through the shell,
    // where `&` in an OAuth query string splits it into further commands.
    const rundll32 = resolveWindowsSystem32Path("rundll32.exe");
    return {
      argv: [rundll32, "url.dll,FileProtocolHandler"],
      command: rundll32,
    };
  }

  if (platform === "darwin") {
    const hasOpen = await detectBinary("open");
    return hasOpen ? { argv: ["open"], command: "open" } : { argv: null, reason: "missing-open" };
  }

  if (platform === "linux") {
    const wsl = await isWSL();
    if (!hasDisplay && !wsl) {
      return { argv: null, reason: "no-display" };
    }
    if (wsl) {
      const hasWslview = await detectBinary("wslview");
      if (hasWslview) {
        return { argv: ["wslview"], command: "wslview" };
      }
      if (!hasDisplay) {
        return { argv: null, reason: "wsl-no-wslview" };
      }
    }
    const hasXdgOpen = await detectBinary("xdg-open");
    return hasXdgOpen
      ? { argv: ["xdg-open"], command: "xdg-open" }
      : { argv: null, reason: "missing-xdg-open" };
  }

  return { argv: null, reason: "unsupported-platform" };
}

export async function detectBrowserOpenSupport(): Promise<BrowserOpenSupport> {
  const resolved = await resolveBrowserOpenCommand();
  if (!resolved.argv) {
    return { ok: false, reason: resolved.reason };
  }
  return { ok: true, command: resolved.command };
}

export function formatControlUiSshHint(params: {
  port: number;
  basePath?: string;
  token?: string;
}): string {
  const basePath = normalizeControlUiBasePath(params.basePath);
  const uiPath = basePath ? `${basePath}/` : "/";
  const localUrl = `http://localhost:${params.port}${uiPath}`;
  const authedUrl = params.token
    ? `${localUrl}#token=${encodeURIComponent(params.token)}`
    : undefined;
  const sshTarget = resolveSshTargetHint();
  return [
    "No GUI detected. Open from your computer:",
    `ssh -N -L ${params.port}:127.0.0.1:${params.port} ${sshTarget}`,
    "Then open:",
    localUrl,
    authedUrl,
    "Docs:",
    "https://docs.remoteclaw.org/gateway/remote",
    "https://docs.remoteclaw.org/web/control-ui",
  ]
    .filter(Boolean)
    .join("\n");
}

function resolveSshTargetHint(): string {
  const user = process.env.USER || process.env.LOGNAME || "user";
  const conn = process.env.SSH_CONNECTION?.trim().split(/\s+/);
  const host = conn?.[2] ?? "<host>";
  return `${user}@${host}`;
}

export async function openUrl(url: string): Promise<boolean> {
  if (shouldSkipBrowserOpenInTests()) {
    return false;
  }
  if (!isBrowserOpenableUrl(url)) {
    return false;
  }
  const resolved = await resolveBrowserOpenCommand();
  if (!resolved.argv) {
    return false;
  }
  try {
    await runCommandWithTimeout([...resolved.argv, url], { timeoutMs: 5_000 });
    return true;
  } catch {
    // ignore; we still print the URL for manual open
    return false;
  }
}

export async function openUrlInBackground(url: string): Promise<boolean> {
  if (shouldSkipBrowserOpenInTests()) {
    return false;
  }
  if (!isBrowserOpenableUrl(url)) {
    return false;
  }
  if (process.platform !== "darwin") {
    return false;
  }
  const resolved = await resolveBrowserOpenCommand();
  if (!resolved.argv || resolved.command !== "open") {
    return false;
  }
  const command = ["open", "-g", url];
  try {
    await runCommandWithTimeout(command, { timeoutMs: 5_000 });
    return true;
  } catch {
    return false;
  }
}

export async function ensureWorkspaceAndSessions(
  workspaceDir: string,
  runtime: RuntimeEnv,
  options?: { agentId?: string },
) {
  const ws = await ensureAgentWorkspace(workspaceDir);
  runtime.log(`Workspace OK: ${shortenHomePath(ws.dir)}`);
  const sessionsDir = resolveSessionTranscriptsDirForAgent(options?.agentId);
  await fs.mkdir(sessionsDir, { recursive: true });
  runtime.log(`Sessions OK: ${shortenHomePath(sessionsDir)}`);
}

export async function moveToTrash(pathname: string, runtime: RuntimeEnv): Promise<void> {
  if (!pathname) {
    return;
  }
  try {
    await fs.lstat(pathname);
  } catch {
    return;
  }
  try {
    const targetPath = path.resolve(pathname);
    const sourcePath = await resolveMoveToTrashSourcePath(targetPath);
    await movePathToTrash(sourcePath, {
      allowedRoots: await resolveMoveToTrashAllowedRoots(sourcePath),
    });
    runtime.log(`Moved to Trash: ${shortenHomePath(pathname)}`);
  } catch {
    runtime.log(`Failed to move to Trash (manual delete): ${shortenHomePath(pathname)}`);
  }
}

// Mirror the canonicalization movePathToTrash performs internally, so the
// allowed roots below are derived from the same parent the rename will use.
async function resolveMoveToTrashSourcePath(targetPath: string): Promise<string> {
  return path.join(await fs.realpath(path.dirname(targetPath)), path.basename(targetPath));
}

// These roots are derived from the target, so they do NOT bound where a reset
// can reach — a config path that is itself a symlink into /etc still resolves
// inside its own canonical parent. They exist to satisfy the fs-safe contract
// and to keep a link whose target lives elsewhere from being read as an escape.
// Bounding reset to known-owned directories would need roots sourced from
// resolveConfigDir()/resolveStateDir() instead.
async function resolveMoveToTrashAllowedRoots(sourcePath: string): Promise<string[]> {
  const allowedRoots = [path.dirname(sourcePath)];
  const stat = await fs.lstat(sourcePath);
  if (stat.isSymbolicLink()) {
    try {
      allowedRoots.push(path.dirname(await fs.realpath(sourcePath)));
    } catch {
      // Broken symlink: the lexical parent is the only root that applies.
    }
  }
  return [...new Set(allowedRoots)];
}

export async function handleReset(scope: ResetScope, workspaceDir: string, runtime: RuntimeEnv) {
  await moveToTrash(resolveConfigPath(), runtime);
  if (scope === "config") {
    return;
  }
  await moveToTrash(path.join(resolveConfigDir(), "credentials"), runtime);
  // Reset removes the entire agents tree (every agent's sessions, workspace cache, etc.).
  // Per-agent dirs are created by setup/add commands, so this is the correct scope.
  await moveToTrash(path.join(resolveStateDir(), "agents"), runtime);
  if (scope === "full") {
    await moveToTrash(workspaceDir, runtime);
  }
}

export async function detectBinary(name: string): Promise<boolean> {
  if (!name?.trim()) {
    return false;
  }
  if (!isSafeExecutableValue(name)) {
    return false;
  }
  const resolved = name.startsWith("~") ? resolveUserPath(name) : name;
  if (
    path.isAbsolute(resolved) ||
    resolved.startsWith(".") ||
    resolved.includes("/") ||
    resolved.includes("\\")
  ) {
    try {
      await fs.access(resolved);
      return true;
    } catch {
      return false;
    }
  }

  const command =
    process.platform === "win32"
      ? [resolveWindowsSystem32Path("where.exe"), name]
      : ["/usr/bin/env", "which", name];
  try {
    const result = await runCommandWithTimeout(command, { timeoutMs: 2000 });
    return result.code === 0 && result.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

function shouldSkipBrowserOpenInTests(): boolean {
  if (process.env.VITEST) {
    return true;
  }
  return process.env.NODE_ENV === "test";
}

export async function probeGatewayReachable(params: {
  url: string;
  token?: string;
  password?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; detail?: string }> {
  const url = params.url.trim();
  const timeoutMs = params.timeoutMs ?? 1500;
  try {
    await callGateway({
      url,
      token: params.token,
      password: params.password,
      method: "health",
      timeoutMs,
      clientName: GATEWAY_CLIENT_NAMES.PROBE,
      mode: GATEWAY_CLIENT_MODES.PROBE,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: summarizeError(err) };
  }
}

export async function waitForGatewayReachable(params: {
  url: string;
  token?: string;
  password?: string;
  /** Total time to wait before giving up. */
  deadlineMs?: number;
  /** Per-probe timeout (each probe makes a full gateway health request). */
  probeTimeoutMs?: number;
  /** Delay between probes. */
  pollMs?: number;
}): Promise<{ ok: boolean; detail?: string }> {
  const deadlineMs = params.deadlineMs ?? 15_000;
  const pollMs = params.pollMs ?? 400;
  const probeTimeoutMs = params.probeTimeoutMs ?? 1500;
  const startedAt = Date.now();
  let lastDetail: string | undefined;

  while (Date.now() - startedAt < deadlineMs) {
    const probe = await probeGatewayReachable({
      url: params.url,
      token: params.token,
      password: params.password,
      timeoutMs: probeTimeoutMs,
    });
    if (probe.ok) {
      return probe;
    }
    lastDetail = probe.detail;
    await sleep(pollMs);
  }

  return { ok: false, detail: lastDetail };
}

function summarizeError(err: unknown): string {
  let raw = "unknown error";
  if (err instanceof Error) {
    raw = err.message || raw;
  } else if (typeof err === "string") {
    raw = err || raw;
  } else if (err !== undefined) {
    raw = inspect(err, { depth: 2 });
  }
  const line =
    raw
      .split("\n")
      .map((s) => s.trim())
      .find(Boolean) ?? raw;
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

export function resolveControlUiLinks(params: {
  port: number;
  bind?: "auto" | "lan" | "loopback" | "custom" | "tailnet";
  customBindHost?: string;
  basePath?: string;
}): { httpUrl: string; wsUrl: string } {
  const port = params.port;
  const bind = params.bind ?? "loopback";
  const customBindHost = params.customBindHost?.trim();
  const { tailnetIPv4 } = inspectBestEffortPrimaryTailnetIPv4();
  const host = (() => {
    if (bind === "custom" && customBindHost && isValidIPv4(customBindHost)) {
      return customBindHost;
    }
    if (bind === "tailnet" && tailnetIPv4) {
      return tailnetIPv4 ?? "127.0.0.1";
    }
    if (bind === "lan") {
      return pickBestEffortPrimaryLanIPv4() ?? "127.0.0.1";
    }
    return "127.0.0.1";
  })();
  const basePath = normalizeControlUiBasePath(params.basePath);
  const uiPath = basePath ? `${basePath}/` : "/";
  const wsPath = basePath ? basePath : "";
  return {
    httpUrl: `http://${host}:${port}${uiPath}`,
    wsUrl: `ws://${host}:${port}${wsPath}`,
  };
}

// Re-export for upstream compatibility
export const DEFAULT_WORKSPACE = "workspace";
