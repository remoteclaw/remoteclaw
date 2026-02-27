// Stub: pi-embedded execution engine was gutted (#74).
// The followup runner previously called `runEmbeddedPiAgent`; with the
// engine removed, followup runs are no-ops that mark completion.

import type { SessionEntry } from "../../config/sessions.js";
import type { TypingMode } from "../../config/types.js";
import { logVerbose } from "../../globals.js";
import type { GetReplyOptions } from "../types.js";
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

  return async (_queued: FollowupRun) => {
    try {
      logVerbose("followup queue: embedded engine removed (#74); skipping run");
    } finally {
      typing.markRunComplete();
    }
  };
}
