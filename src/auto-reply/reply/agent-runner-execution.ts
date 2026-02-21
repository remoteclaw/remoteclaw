import crypto from "node:crypto";
import { ensureAuthProfileStore } from "../../agents/auth-profiles.js";
import { type ResolvedProviderAuth, resolveApiKeyForProvider } from "../../agents/model-auth.js";
import { sanitizeUserFacingText } from "../../agents/pi-embedded-helpers.js";
import type { SessionEntry } from "../../config/sessions.js";
import { logVerbose } from "../../globals.js";
import { registerAgentRunContext } from "../../infra/agent-events.js";
import {
  ChannelBridge,
  createCliRuntime,
  type BridgeCallbacks,
  type ChannelMessage,
  type ChannelReply,
} from "../../middleware/index.js";
import { defaultRuntime } from "../../runtime.js";
import { stripHeartbeatToken } from "../heartbeat.js";
import type { TemplateContext } from "../templating.js";
import type { VerboseLevel } from "../thinking.js";
import { isSilentReplyText, SILENT_REPLY_TOKEN } from "../tokens.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import type { BlockReplyPipeline } from "./block-reply-pipeline.js";
import type { FollowupRun } from "./queue.js";
import type { TypingSignaler } from "./typing-mode.js";

export type AgentRunLoopResult =
  | {
      kind: "success";
      runResult: ChannelReply;
      fallbackProvider?: string;
      fallbackModel?: string;
      didLogHeartbeatStrip: boolean;
      autoCompactionCompleted: boolean;
      /** Payload keys sent directly (not via pipeline) during tool flush. */
      directlySentBlockKeys?: Set<string>;
    }
  | { kind: "final"; payload: ReplyPayload };

export async function runAgentTurnWithFallback(params: {
  commandBody: string;
  followupRun: FollowupRun;
  sessionCtx: TemplateContext;
  opts?: GetReplyOptions;
  typingSignals: TypingSignaler;
  blockReplyPipeline: BlockReplyPipeline | null;
  blockStreamingEnabled: boolean;
  blockReplyChunking?: {
    minChars: number;
    maxChars: number;
    breakPreference: "paragraph" | "newline" | "sentence";
    flushOnParagraph?: boolean;
  };
  resolvedBlockStreamingBreak: "text_end" | "message_end";
  applyReplyToMode: (payload: ReplyPayload) => ReplyPayload;
  shouldEmitToolResult: () => boolean;
  shouldEmitToolOutput: () => boolean;
  pendingToolTasks: Set<Promise<void>>;
  resetSessionAfterCompactionFailure: (reason: string) => Promise<boolean>;
  resetSessionAfterRoleOrderingConflict: (reason: string) => Promise<boolean>;
  isHeartbeat: boolean;
  sessionKey?: string;
  getActiveSessionEntry: () => SessionEntry | undefined;
  activeSessionStore?: Record<string, SessionEntry>;
  storePath?: string;
  resolvedVerboseLevel: VerboseLevel;
}): Promise<AgentRunLoopResult> {
  let didLogHeartbeatStrip = false;

  const runId = params.opts?.runId ?? crypto.randomUUID();
  params.opts?.onAgentRunStart?.(runId);
  if (params.sessionKey) {
    registerAgentRunContext(runId, {
      sessionKey: params.sessionKey,
      verboseLevel: params.resolvedVerboseLevel,
      isHeartbeat: params.isHeartbeat,
    });
  }

  const allowPartialStream = !(
    params.followupRun.run.reasoningLevel === "stream" && params.opts?.onReasoningStream
  );
  const normalizeStreamingText = (payload: ReplyPayload): { text?: string; skip: boolean } => {
    if (!allowPartialStream) {
      return { skip: true };
    }
    let text = payload.text;
    if (!params.isHeartbeat && text?.includes("HEARTBEAT_OK")) {
      const stripped = stripHeartbeatToken(text, { mode: "message" });
      if (stripped.didStrip && !didLogHeartbeatStrip) {
        didLogHeartbeatStrip = true;
        logVerbose("Stripped stray HEARTBEAT_OK token from reply");
      }
      if (stripped.shouldSkip) {
        return { skip: true };
      }
      text = stripped.text;
    }
    if (isSilentReplyText(text, SILENT_REPLY_TOKEN)) {
      return { skip: true };
    }
    if (!text) {
      return { skip: true };
    }
    const sanitized = sanitizeUserFacingText(text, { errorContext: false });
    if (!sanitized.trim()) {
      return { skip: true };
    }
    return { text: sanitized, skip: false };
  };

  params.opts?.onModelSelected?.({
    provider: params.followupRun.run.provider,
    model: params.followupRun.run.model,
    thinkLevel: params.followupRun.run.thinkLevel,
  });

  let resolvedAuth: ResolvedProviderAuth | undefined;
  if (params.followupRun.run.authProfileId) {
    const store = ensureAuthProfileStore(params.followupRun.run.workspaceDir);
    resolvedAuth = await resolveApiKeyForProvider({
      provider: params.followupRun.run.provider,
      cfg: params.followupRun.run.config,
      profileId: params.followupRun.run.authProfileId,
      store,
      agentDir: params.followupRun.run.workspaceDir,
    });
  }

  const bridge = new ChannelBridge({
    runtime: createCliRuntime(params.followupRun.run.provider, params.followupRun.run.config),
    sessionDir: params.followupRun.run.workspaceDir,
    defaultModel: params.followupRun.run.model,
    defaultMaxTurns: params.followupRun.run.maxTurns,
    defaultTimeoutMs: params.followupRun.run.timeoutMs,
    auth: resolvedAuth,
  });

  const channelMessage: ChannelMessage = {
    channelId: params.sessionCtx.Provider?.trim().toLowerCase() || "auto-reply",
    userId: params.sessionCtx.AccountId || params.sessionCtx.SenderId?.trim() || "user",
    threadId: params.sessionCtx.MessageThreadId?.toString(),
    text: params.commandBody,
    workspaceDir: params.followupRun.run.workspaceDir,
  };

  const callbacks: BridgeCallbacks = {
    // Progressive text delivery — the key streaming upgrade
    onPartialText:
      allowPartialStream && params.opts?.onPartialReply
        ? async (text) => {
            const normalized = normalizeStreamingText({ text });
            if (normalized.skip || !normalized.text) {
              return;
            }
            void params.typingSignals.signalTextDelta(normalized.text);
            await params.opts!.onPartialReply!({
              text: normalized.text,
              mediaUrls: undefined,
            });
          }
        : undefined,
    // Tool use → typing indicator
    onToolUse: async (_toolName, _toolId) => {
      await params.typingSignals.signalToolStart();
    },
  };

  try {
    const reply = await bridge.handle(channelMessage, callbacks, params.opts?.abortSignal);

    return {
      kind: "success",
      runResult: reply,
      didLogHeartbeatStrip,
      autoCompactionCompleted: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    defaultRuntime.error(`Agent runtime failed before reply: ${message}`);
    const safeMessage = sanitizeUserFacingText(message, { errorContext: true });
    const trimmedMessage = safeMessage.replace(/\.\s*$/, "");

    return {
      kind: "final",
      payload: {
        text: `\u26a0\ufe0f Agent failed before reply: ${trimmedMessage}.\nLogs: remoteclaw logs --follow`,
      },
    };
  }
}
