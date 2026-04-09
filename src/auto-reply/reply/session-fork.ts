import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
const CURRENT_SESSION_VERSION = 1;
const SessionManager = {
  load: async (..._args: unknown[]) => ({ version: 1 }),
  open: (..._args: unknown[]) => ({
    getLeafId: () => null as string | null,
    createBranchedSession: (..._a: unknown[]) => null as string | null,
    getSessionFile: () => "" as string,
    getSessionId: () => "" as string,
    getSessionDir: () => "" as string,
    getCwd: () => process.cwd(),
  }),
};
import type { RemoteClawConfig } from "../../config/config.js";
import { resolveSessionFilePath, type SessionEntry } from "../../config/sessions.js";

/**
 * Default max parent token count beyond which thread/session parent forking is skipped.
 * This prevents new thread sessions from inheriting near-full parent context.
 * See #26905.
 */
const DEFAULT_PARENT_FORK_MAX_TOKENS = 100_000;

export function resolveParentForkMaxTokens(cfg: RemoteClawConfig): number {
  const configured = cfg.session?.parentForkMaxTokens;
  if (typeof configured === "number" && Number.isFinite(configured) && configured >= 0) {
    return Math.floor(configured);
  }
  return DEFAULT_PARENT_FORK_MAX_TOKENS;
}

export function forkSessionFromParent(params: {
  parentEntry: SessionEntry;
  agentId: string;
  sessionsDir: string;
}): { sessionId: string; sessionFile: string } | null {
  const parentSessionFile = resolveSessionFilePath(
    params.parentEntry.sessionId,
    params.parentEntry,
    { agentId: params.agentId, sessionsDir: params.sessionsDir },
  );
  if (!parentSessionFile || !fs.existsSync(parentSessionFile)) {
    return null;
  }
  try {
    const manager = SessionManager.open(parentSessionFile);
    const leafId = manager.getLeafId();
    if (leafId) {
      const sessionFile = manager.createBranchedSession(leafId) ?? manager.getSessionFile();
      const sessionId = manager.getSessionId();
      if (sessionFile && sessionId) {
        return { sessionId, sessionFile };
      }
    }
    const sessionId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const fileTimestamp = timestamp.replace(/[:.]/g, "-");
    const sessionFile = path.join(manager.getSessionDir(), `${fileTimestamp}_${sessionId}.jsonl`);
    const header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: sessionId,
      timestamp,
      cwd: manager.getCwd(),
      parentSession: parentSessionFile,
    };
    fs.writeFileSync(sessionFile, `${JSON.stringify(header)}\n`, "utf-8");
    return { sessionId, sessionFile };
  } catch {
    return null;
  }
}
