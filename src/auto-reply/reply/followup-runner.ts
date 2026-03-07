import crypto from "node:crypto";
import { resolveChannelMessageToolHints } from "../../agents/channel-tools.js";
import { resolveGatewayPort } from "../../config/paths.js";
import type { SessionEntry } from "../../config/sessions.js";
import type { TypingMode } from "../../config/types.js";
import { resolveGatewayCredentialsFromConfig } from "../../gateway/credentials.js";
import { logVerbose } from "../../globals.js";
import { ChannelBridge } from "../../middleware/channel-bridge.js";
import {
  resolveCliRuntimeArgs,
  resolveCliRuntimeProvider,
} from "../../middleware/runtime-factory.js";
import type { SessionMap } from "../../middleware/session-map.js";
import type { BridgeCallbacks, ChannelMessage } from "../../middleware/types.js";
import type { GetReplyOptions } from "../types.js";
import type { FollowupRun } from "./queue.js";
import { createTypingSignaler } from "./typing-mode.js";
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
  const { opts, typing, typingMode, sessionStore, sessionKey } = params;

  return async (queued: FollowupRun) => {
    const typingSignals = createTypingSignaler({
      typing,
      mode: typingMode,
      isHeartbeat: false,
    });

    try {
      await typingSignals.signalRunStart();

      const provider = queued.run.provider;
      const cfg = queued.run.config;

      // Session adapter: reads CLI session ID from the auto-reply session store.
      const sessionMap = {
        async get() {
          const entry = sessionKey ? sessionStore?.[sessionKey] : undefined;
          return entry?.cliSessionIds?.[provider];
        },
        async set() {
          // Session updates handled by caller (persistRunSessionUsage)
        },
        async delete() {
          // Session cleanup handled by caller
        },
      } as unknown as SessionMap;

      // Resolve gateway connection from config.
      const port = resolveGatewayPort(cfg ?? undefined);
      const gatewayUrl = `ws://127.0.0.1:${port}`;
      const gatewayToken = cfg
        ? (resolveGatewayCredentialsFromConfig({ cfg, env: process.env }).token ?? "")
        : "";

      const bridge = new ChannelBridge({
        provider: resolveCliRuntimeProvider(cfg),
        sessionMap,
        gatewayUrl,
        gatewayToken,
        workspaceDir: queued.run.workspaceDir,
        runtimeArgs: resolveCliRuntimeArgs(cfg),
      });

      // Build channel message from followup run fields.
      const messageToolHints = resolveChannelMessageToolHints({
        cfg,
        channel: queued.originatingChannel,
        accountId: queued.originatingAccountId,
      });

      const message: ChannelMessage = {
        id: queued.messageId ?? crypto.randomUUID(),
        text: queued.prompt,
        from: queued.originatingAccountId ?? "",
        channelId: queued.originatingTo ?? "",
        provider: queued.originatingChannel ?? "",
        timestamp: Date.now(),
        replyToId:
          queued.originatingThreadId != null ? String(queued.originatingThreadId) : undefined,
        messageToolHints: messageToolHints?.length ? messageToolHints : undefined,
        senderIsOwner: queued.run.senderIsOwner,
        extraContext: queued.run.extraSystemPrompt || undefined,
      };

      // Wire BridgeCallbacks from opts callbacks.
      const callbacks: BridgeCallbacks = {
        onPartialReply: opts?.onPartialReply,
        onBlockReply: opts?.onBlockReply,
        onToolResult: opts?.onToolResult,
      };

      await bridge.handle(message, callbacks, opts?.abortSignal);
      logVerbose("followup queue: bridge.handle() completed");
    } finally {
      typing.markRunComplete();
    }
  };
}
