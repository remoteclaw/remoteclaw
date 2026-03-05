import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { SILENT_REPLY_TOKEN } from "../auto-reply/tokens.js";
import type { CliDeps } from "../cli/deps.js";
import { agentCommand } from "../commands/agent.js";
import type { RemoteClawConfig } from "../config/config.js";
import {
  resolveAgentIdFromSessionKey,
  resolveAgentMainSessionKey,
  resolveMainSessionKey,
} from "../config/sessions/main-session.js";
import { resolveStorePath } from "../config/sessions/paths.js";
import { loadSessionStore, updateSessionStore } from "../config/sessions/store.js";
import type { SessionEntry } from "../config/sessions/types.js";
import type { AgentDefaultsConfig } from "../config/types.agent-defaults.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { type RuntimeEnv, defaultRuntime } from "../runtime.js";

function generateBootSessionId(): string {
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").replace("T", "_").replace("Z", "");
  const suffix = crypto.randomUUID().slice(0, 8);
  return `boot-${ts}-${suffix}`;
}

type SessionMappingSnapshot = {
  storePath: string;
  sessionKey: string;
  canRestore: boolean;
  hadEntry: boolean;
  entry?: SessionEntry;
};

const log = createSubsystemLogger("gateway/boot");

export type BootConfig = NonNullable<AgentDefaultsConfig["boot"]>;

export type BootRunResult =
  | { status: "skipped"; reason: "not-configured" | "empty" }
  | { status: "ran" }
  | { status: "failed"; reason: string };

function buildBootPrompt(content: string) {
  return [
    "You are running a boot check. Follow the boot instructions exactly.",
    "",
    "Boot instructions:",
    content,
    "",
    "If the instructions ask you to send a message, use the message tool (action=send with channel + target).",
    "Use the `target` field (not `to`) for message tool destinations.",
    `After sending with the message tool, reply with ONLY: ${SILENT_REPLY_TOKEN}.`,
    `If nothing needs attention, reply with ONLY: ${SILENT_REPLY_TOKEN}.`,
  ].join("\n");
}

export async function resolveBootPrompt(
  boot: BootConfig | undefined,
  workspaceDir: string,
): Promise<{
  content?: string;
  status: "ok" | "not-configured" | "empty" | "read-error";
  error?: string;
}> {
  if (!boot) {
    return { status: "not-configured" };
  }

  if (boot.prompt !== undefined) {
    const trimmed = boot.prompt.trim();
    if (!trimmed) {
      return { status: "empty" };
    }
    return { status: "ok", content: trimmed };
  }

  if (boot.file !== undefined) {
    const filePath = path.isAbsolute(boot.file) ? boot.file : path.join(workspaceDir, boot.file);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const trimmed = content.trim();
      if (!trimmed) {
        return { status: "empty" };
      }
      return { status: "ok", content: trimmed };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: "read-error", error: message };
    }
  }

  return { status: "not-configured" };
}

function snapshotMainSessionMapping(params: {
  cfg: RemoteClawConfig;
  sessionKey: string;
}): SessionMappingSnapshot {
  const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
  const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
  try {
    const store = loadSessionStore(storePath, { skipCache: true });
    const entry = store[params.sessionKey];
    if (!entry) {
      return {
        storePath,
        sessionKey: params.sessionKey,
        canRestore: true,
        hadEntry: false,
      };
    }
    return {
      storePath,
      sessionKey: params.sessionKey,
      canRestore: true,
      hadEntry: true,
      entry: structuredClone(entry),
    };
  } catch (err) {
    log.debug("boot: could not snapshot main session mapping", {
      sessionKey: params.sessionKey,
      error: String(err),
    });
    return {
      storePath,
      sessionKey: params.sessionKey,
      canRestore: false,
      hadEntry: false,
    };
  }
}

async function restoreMainSessionMapping(
  snapshot: SessionMappingSnapshot,
): Promise<string | undefined> {
  if (!snapshot.canRestore) {
    return undefined;
  }
  try {
    await updateSessionStore(
      snapshot.storePath,
      (store) => {
        if (snapshot.hadEntry && snapshot.entry) {
          store[snapshot.sessionKey] = snapshot.entry;
          return;
        }
        delete store[snapshot.sessionKey];
      },
      { activeSessionKey: snapshot.sessionKey },
    );
    return undefined;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function runBootOnce(params: {
  cfg: RemoteClawConfig;
  deps: CliDeps;
  boot: BootConfig | undefined;
  workspaceDir: string;
  agentId?: string;
}): Promise<BootRunResult> {
  const bootRuntime: RuntimeEnv = {
    log: () => {},
    error: (message) => log.error(String(message)),
    exit: defaultRuntime.exit,
  };

  const resolved = await resolveBootPrompt(params.boot, params.workspaceDir);

  if (resolved.status === "not-configured") {
    return { status: "skipped", reason: "not-configured" };
  }
  if (resolved.status === "empty") {
    return { status: "skipped", reason: "empty" };
  }
  if (resolved.status === "read-error") {
    log.error(`boot: failed to read boot file: ${resolved.error}`);
    return { status: "failed", reason: resolved.error ?? "read error" };
  }

  const sessionKey = params.agentId
    ? resolveAgentMainSessionKey({ cfg: params.cfg, agentId: params.agentId })
    : resolveMainSessionKey(params.cfg);
  const message = buildBootPrompt(resolved.content ?? "");
  const sessionId = generateBootSessionId();
  const mappingSnapshot = snapshotMainSessionMapping({
    cfg: params.cfg,
    sessionKey,
  });

  let agentFailure: string | undefined;
  try {
    await agentCommand(
      {
        message,
        sessionKey,
        sessionId,
        deliver: false,
      },
      bootRuntime,
      params.deps,
    );
  } catch (err) {
    agentFailure = err instanceof Error ? err.message : String(err);
    log.error(`boot: agent run failed: ${agentFailure}`);
  }

  const mappingRestoreFailure = await restoreMainSessionMapping(mappingSnapshot);
  if (mappingRestoreFailure) {
    log.error(`boot: failed to restore main session mapping: ${mappingRestoreFailure}`);
  }

  if (!agentFailure && !mappingRestoreFailure) {
    return { status: "ran" };
  }
  const reasonParts = [
    agentFailure ? `agent run failed: ${agentFailure}` : undefined,
    mappingRestoreFailure ? `mapping restore failed: ${mappingRestoreFailure}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return { status: "failed", reason: reasonParts.join("; ") };
}
