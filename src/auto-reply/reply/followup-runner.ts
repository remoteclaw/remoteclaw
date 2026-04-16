import crypto from "node:crypto";
import type { SessionEntry } from "../../config/sessions.js";
import type { TypingMode } from "../../config/types.js";
import { logVerbose } from "../../globals.js";
import { registerAgentRunContext } from "../../infra/agent-events.js";
import { isInternalMessageChannel } from "../../utils/message-channel.js";
import type { GetReplyOptions } from "../types.js";
import { resolveOriginMessageProvider } from "./origin-routing.js";
import type { FollowupRun } from "./queue.js";
import type { TypingController } from "./typing.js";

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
  const { typing } = params;

  return async (queued: FollowupRun) => {
    try {
      const runId = crypto.randomUUID();
      const shouldSurfaceToControlUi = isInternalMessageChannel(
        resolveOriginMessageProvider({
          originatingChannel: queued.originatingChannel,
          provider: queued.run.messageProvider,
        }),
      );
      if (queued.run.sessionKey) {
        registerAgentRunContext(runId, {
          sessionKey: queued.run.sessionKey,
          verboseLevel: queued.run.verboseLevel,
          isControlUiVisible: shouldSurfaceToControlUi,
        });
      }
      // Embedded Pi runner was gutted — followup runs are now no-ops.
      // CLI-based AgentRuntime handles agent execution through a different path.
      logVerbose(`followup queue: embedded runner gutted, skipping run ${runId}`);
    } finally {
      typing.markRunComplete();
      typing.markDispatchIdle();
    }
  };
}
