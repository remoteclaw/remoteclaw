import crypto from "node:crypto";
import type { SessionEntry } from "../../config/sessions.js";
import type { TypingMode } from "../../config/types.js";
import type { GetReplyOptions } from "../types.js";
import type { FollowupRun } from "./queue.js";
import type { TypingController } from "./typing.js";
import { registerAgentRunContext } from "../../infra/agent-events.js";
import { defaultRuntime } from "../../runtime.js";
import { createTypingSignaler } from "./typing-mode.js";

export function createFollowupRunner(params: {
  opts?: GetReplyOptions;
  typing: TypingController;
  typingMode: TypingMode;
  sessionEntry?: SessionEntry;
  sessionStore?: Record<string, SessionEntry>;
  sessionKey?: string;
  storePath?: string;
  defaultModel: string;
  agentCfgContextTokens?: number;
}): (queued: FollowupRun) => Promise<void> {
  const { typing, typingMode, opts } = params;
  const _typingSignals = createTypingSignaler({
    typing,
    mode: typingMode,
    isHeartbeat: opts?.isHeartbeat === true,
  });

  return async (queued: FollowupRun) => {
    try {
      const runId = crypto.randomUUID();
      if (queued.run.sessionKey) {
        registerAgentRunContext(runId, {
          sessionKey: queued.run.sessionKey,
          verboseLevel: queued.run.verboseLevel,
        });
      }
      // pi-embedded: runEmbeddedPiAgent removed (dead code after AgentRuntime migration)
      defaultRuntime.error?.("Followup runner not available: pi-embedded engine removed");
      return;
    } finally {
      typing.markRunComplete();
    }
  };
}
