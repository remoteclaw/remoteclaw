import crypto from "node:crypto";
import fs from "node:fs";
import {
  isCompactionFailureError,
  isContextOverflowError,
  isLikelyContextOverflowError,
  isTransientHttpError,
  sanitizeUserFacingText,
} from "../../agents/agent-helpers.js";
import { resolveChannelMessageToolHints } from "../../agents/channel-tools.js";
import { resolveUserTimezone } from "../../agents/date-time.js";
import { resolveGatewayPort } from "../../config/paths.js";
import {
  resolveSessionTranscriptPath,
  type SessionEntry,
  updateSessionStore,
} from "../../config/sessions.js";
import { resolveGatewayCredentialsFromConfig } from "../../gateway/credentials.js";
import { logVerbose } from "../../globals.js";
import { emitAgentEvent, registerAgentRunContext } from "../../infra/agent-events.js";
import { ChannelBridge } from "../../middleware/channel-bridge.js";
import type { SessionMap } from "../../middleware/session-map.js";
import type {
  AgentDeliveryResult,
  BridgeCallbacks,
  ChannelMessage,
} from "../../middleware/types.js";
import { defaultRuntime } from "../../runtime.js";
import type { TemplateContext } from "../templating.js";
import type { VerboseLevel } from "../thinking.js";
import { isSilentReplyPrefixText, isSilentReplyText, SILENT_REPLY_TOKEN } from "../tokens.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import { type BlockReplyPipeline } from "./block-reply-pipeline.js";
import type { FollowupRun } from "./queue.js";
import { createBlockReplyDeliveryHandler } from "./reply-delivery.js";
import type { TypingSignaler } from "./typing-mode.js";

export type RuntimeFallbackAttempt = {
  provider: string;
  model: string;
  error: string;
  reason?: string;
  status?: number;
  code?: string;
};

export type AgentRunLoopResult =
  | {
      kind: "success";
      runId: string;
      runResult: AgentDeliveryResult;
      fallbackProvider?: string;
      fallbackModel?: string;
      fallbackAttempts: RuntimeFallbackAttempt[];
      didLogHeartbeatStrip: boolean;
      autoCompactionCompleted: boolean;
      /** Payload keys sent directly (not via pipeline) during tool flush. */
      directlySentBlockKeys?: Set<string>;
    }
  | { kind: "final"; payload: ReplyPayload };

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Create a SessionMap-compatible adapter that bridges the auto-reply session
 * store to the ChannelBridge's SessionMap interface.
 *
 * `get()` returns the CLI session ID from the active session entry.
 * `set()` is a no-op — session updates are handled by the caller after the run.
 */
function createSessionMapAdapter(params: { getSessionId: () => string | undefined }): SessionMap {
  return {
    async get() {
      return params.getSessionId();
    },
    async set() {
      // Session updates handled by caller (persistRunSessionUsage)
    },
    async delete() {
      // Session cleanup handled by caller
    },
  } as unknown as SessionMap;
}

/** Resolve gateway URL from config for local gateway. */
function resolveGatewayUrlFromConfig(cfg: FollowupRun["run"]["config"]): string {
  const port = resolveGatewayPort(cfg ?? undefined);
  return `ws://127.0.0.1:${port}`;
}

/** Resolve gateway auth token from config. */
function resolveGatewayTokenFromConfig(cfg: FollowupRun["run"]["config"]): string {
  if (!cfg) {
    return "";
  }
  return resolveGatewayCredentialsFromConfig({ cfg, env: process.env }).token ?? "";
}

/**
 * Resolve reaction guidance for the system prompt from channel config.
 *
 * Reads the channel's `reactionLevel` from config and returns guidance
 * only when the level enables agent-controlled reactions ("minimal" or "extensive").
 */
function resolveChannelReactionGuidance(
  cfg: FollowupRun["run"]["config"],
  channel: string | undefined,
): { level: "minimal" | "extensive"; channel: string } | undefined {
  if (!cfg || !channel) {
    return undefined;
  }
  const channelConfig = (cfg.channels as Record<string, Record<string, unknown>> | undefined)?.[
    channel
  ];
  const level = channelConfig?.reactionLevel;
  if (level === "minimal" || level === "extensive") {
    return { level, channel };
  }
  return undefined;
}

/** Build a ChannelMessage from the auto-reply's template context. */
function buildChannelMessage(params: {
  commandBody: string;
  sessionCtx: TemplateContext;
  messageToolHints: string[] | undefined;
  senderIsOwner?: boolean;
  extraSystemPrompt?: string;
  userName?: string;
  agentId?: string;
  timezone?: string;
  authorizedSenders?: string[];
  reactionGuidance?: { level: "minimal" | "extensive"; channel: string };
}): ChannelMessage {
  return {
    id: params.sessionCtx.MessageSidFull ?? params.sessionCtx.MessageSid ?? crypto.randomUUID(),
    text: params.commandBody,
    from: params.sessionCtx.From?.trim() ?? "",
    channelId: params.sessionCtx.To?.trim() ?? "",
    provider: params.sessionCtx.Provider?.trim() ?? "",
    timestamp: Date.now(),
    replyToId: params.sessionCtx.ReplyToId?.trim() || undefined,
    messageToolHints: params.messageToolHints?.length ? params.messageToolHints : undefined,
    senderIsOwner: params.senderIsOwner,
    extraContext: params.extraSystemPrompt || undefined,
    userName: params.userName || undefined,
    agentId: params.agentId || undefined,
    timezone: params.timezone || undefined,
    authorizedSenders: params.authorizedSenders?.length ? params.authorizedSenders : undefined,
    reactionGuidance: params.reactionGuidance,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────

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
  const TRANSIENT_HTTP_RETRY_DELAY_MS = 2_500;
  let didLogHeartbeatStrip = false;
  const autoCompactionCompleted = false;
  // Track payloads sent directly (not via pipeline) during tool flush to avoid duplicates.
  const directlySentBlockKeys = new Set<string>();

  const runId = params.opts?.runId ?? crypto.randomUUID();
  let didNotifyAgentRunStart = false;
  const notifyAgentRunStart = () => {
    if (didNotifyAgentRunStart) {
      return;
    }
    didNotifyAgentRunStart = true;
    params.opts?.onAgentRunStart?.(runId);
  };
  if (params.sessionKey) {
    registerAgentRunContext(runId, {
      sessionKey: params.sessionKey,
      verboseLevel: params.resolvedVerboseLevel,
      isHeartbeat: params.isHeartbeat,
    });
  }
  let runResult: AgentDeliveryResult;
  let fallbackProvider = params.followupRun.run.provider;
  let fallbackModel = params.followupRun.run.model;
  let fallbackAttempts: RuntimeFallbackAttempt[] = [];
  let didResetAfterCompactionFailure = false;
  let didRetryTransientHttpError = false;

  while (true) {
    try {
      const normalizeStreamingText = (payload: ReplyPayload): { text?: string; skip: boolean } => {
        const text = payload.text;
        if (isSilentReplyText(text, SILENT_REPLY_TOKEN)) {
          return { skip: true };
        }
        if (!text) {
          // Allow media-only payloads (e.g. tool result screenshots) through.
          if ((payload.mediaUrls?.length ?? 0) > 0) {
            return { text: undefined, skip: false };
          }
          return { skip: true };
        }
        const sanitized = sanitizeUserFacingText(text, {
          errorContext: Boolean(payload.isError),
        });
        if (!sanitized.trim()) {
          return { skip: true };
        }
        return { text: sanitized, skip: false };
      };
      const handlePartialForTyping = async (payload: ReplyPayload): Promise<string | undefined> => {
        if (isSilentReplyPrefixText(payload.text, SILENT_REPLY_TOKEN)) {
          return undefined;
        }
        const { text, skip } = normalizeStreamingText(payload);
        if (skip || !text) {
          return undefined;
        }
        await params.typingSignals.signalTextDelta(text);
        return text;
      };
      const blockReplyPipeline = params.blockReplyPipeline;
      const onToolResult = params.opts?.onToolResult;
      const provider = params.followupRun.run.provider;
      const model = params.followupRun.run.model;

      // Model fallback gutted in RemoteClaw — CLI agents handle their own model
      // selection and fallback. Run the agent directly with the configured model.

      // Notify that model selection is complete.
      // This allows responsePrefix template interpolation with the actual model.
      params.opts?.onModelSelected?.({
        provider,
        model,
        thinkLevel: params.followupRun.run.thinkLevel,
      });

      const startedAt = Date.now();
      notifyAgentRunStart();
      emitAgentEvent({
        runId,
        stream: "lifecycle",
        data: {
          phase: "start",
          startedAt,
        },
      });

      let lifecycleTerminalEmitted = false;
      try {
        // Session adapter: reads the CLI session ID from the auto-reply session entry.
        const sessionMap = createSessionMapAdapter({
          getSessionId: () => params.getActiveSessionEntry()?.cliSessionIds?.[provider],
        });

        const cfg = params.followupRun.run.config;
        const bridge = new ChannelBridge({
          provider,
          sessionMap,
          gatewayUrl: resolveGatewayUrlFromConfig(cfg),
          gatewayToken: resolveGatewayTokenFromConfig(cfg),
          workspaceDir: params.followupRun.run.workspaceDir,
        });

        const messageToolHints = resolveChannelMessageToolHints({
          cfg,
          channel: params.sessionCtx.Provider?.trim(),
          accountId: params.sessionCtx.AccountId?.trim(),
        });

        const channel = params.sessionCtx.Provider?.trim();
        const message = buildChannelMessage({
          commandBody: params.commandBody,
          sessionCtx: params.sessionCtx,
          messageToolHints,
          senderIsOwner: params.followupRun.run.senderIsOwner,
          extraSystemPrompt: params.followupRun.run.extraSystemPrompt,
          userName: params.followupRun.run.senderName,
          agentId: params.followupRun.run.agentId,
          timezone: resolveUserTimezone(cfg?.agents?.defaults?.userTimezone),
          authorizedSenders: params.followupRun.run.ownerNumbers,
          reactionGuidance: resolveChannelReactionGuidance(cfg, channel),
        });

        // Build BridgeCallbacks that wrap the existing typing/normalization logic.
        const callbacks: BridgeCallbacks = {
          onPartialReply: async (payload) => {
            const textForTyping = await handlePartialForTyping(payload);
            if (!params.opts?.onPartialReply || textForTyping === undefined) {
              return;
            }
            await params.opts.onPartialReply({
              text: textForTyping,
              mediaUrls: payload.mediaUrls,
            });
          },
          onBlockReply: params.opts?.onBlockReply
            ? createBlockReplyDeliveryHandler({
                onBlockReply: params.opts.onBlockReply,
                currentMessageId: params.sessionCtx.MessageSidFull ?? params.sessionCtx.MessageSid,
                normalizeStreamingText,
                applyReplyToMode: params.applyReplyToMode,
                typingSignals: params.typingSignals,
                blockStreamingEnabled: params.blockStreamingEnabled,
                blockReplyPipeline,
                directlySentBlockKeys,
              })
            : undefined,
          onToolResult: onToolResult
            ? (() => {
                // Serialize tool result delivery to preserve message ordering.
                // Without this, concurrent tool callbacks race through typing signals
                // and message sends, causing out-of-order delivery to the user.
                // See: https://github.com/remoteclaw/remoteclaw/issues/11044
                let toolResultChain: Promise<void> = Promise.resolve();
                return (payload: ReplyPayload) => {
                  toolResultChain = toolResultChain
                    .then(async () => {
                      const { text, skip } = normalizeStreamingText(payload);
                      if (skip) {
                        return;
                      }
                      await params.typingSignals.signalTextDelta(text);
                      await onToolResult({
                        text,
                        mediaUrls: payload.mediaUrls,
                      });
                    })
                    .catch((err) => {
                      // Keep chain healthy after an error so later tool results still deliver.
                      logVerbose(`tool result delivery failed: ${String(err)}`);
                    });
                  const task = toolResultChain.finally(() => {
                    params.pendingToolTasks.delete(task);
                  });
                  params.pendingToolTasks.add(task);
                };
              })()
            : undefined,
        };

        const delivery = await bridge.handle(message, callbacks, params.opts?.abortSignal);

        // Complete runtime failure: throw so the catch block can handle it.
        if (delivery.error && delivery.payloads.length === 0) {
          throw new Error(delivery.error);
        }

        // Emit assistant text event for TUI/WebSocket clients (CLI backends don't
        // stream assistant events, so we emit one with the final text).
        const finalText = delivery.run.text?.trim();
        if (finalText) {
          emitAgentEvent({
            runId,
            stream: "assistant",
            data: { text: finalText },
          });
        }

        emitAgentEvent({
          runId,
          stream: "lifecycle",
          data: {
            phase: "end",
            startedAt,
            endedAt: Date.now(),
          },
        });
        lifecycleTerminalEmitted = true;

        runResult = delivery;
      } catch (err) {
        if (!lifecycleTerminalEmitted) {
          emitAgentEvent({
            runId,
            stream: "lifecycle",
            data: {
              phase: "error",
              startedAt,
              endedAt: Date.now(),
              error: String(err),
            },
          });
          lifecycleTerminalEmitted = true;
        }
        throw err;
      } finally {
        // Defensive backstop: never let a run complete without a terminal
        // lifecycle event, otherwise downstream consumers can hang.
        if (!lifecycleTerminalEmitted) {
          emitAgentEvent({
            runId,
            stream: "lifecycle",
            data: {
              phase: "error",
              startedAt,
              endedAt: Date.now(),
              error: "Bridge run completed without lifecycle terminal event",
            },
          });
        }
      }
      fallbackProvider = provider;
      fallbackModel = model;
      fallbackAttempts = [];

      // Surface context overflow errors returned in the result (not thrown).
      // Treat these as a session-level failure and auto-recover by starting a fresh session.
      const bridgeErrorMsg = runResult.error;
      const bridgeErrorSubtype = runResult.run.errorSubtype;
      if (
        bridgeErrorMsg &&
        bridgeErrorSubtype === "context_window" &&
        isContextOverflowError(bridgeErrorMsg) &&
        !didResetAfterCompactionFailure &&
        (await params.resetSessionAfterCompactionFailure(bridgeErrorMsg))
      ) {
        didResetAfterCompactionFailure = true;
        return {
          kind: "final",
          payload: {
            text: "⚠️ Context limit exceeded. I've reset our conversation to start fresh - please try again.\n\nTo prevent this, increase your compaction buffer by setting `agents.defaults.compaction.reserveTokensFloor` to 20000 or higher in your config.",
          },
        };
      }
      if (bridgeErrorMsg && bridgeErrorSubtype === "role_ordering") {
        const didReset = await params.resetSessionAfterRoleOrderingConflict(bridgeErrorMsg);
        if (didReset) {
          return {
            kind: "final",
            payload: {
              text: "⚠️ Message ordering conflict. I've reset the conversation - please try again.",
            },
          };
        }
      }

      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isContextOverflow = isLikelyContextOverflowError(message);
      const isCompactionFailure = isCompactionFailureError(message);
      const isSessionCorruption = /function call turn comes immediately after/i.test(message);
      const isRoleOrderingError = /incorrect role information|roles must alternate/i.test(message);
      const isTransientHttp = isTransientHttpError(message);

      if (
        isCompactionFailure &&
        !didResetAfterCompactionFailure &&
        (await params.resetSessionAfterCompactionFailure(message))
      ) {
        didResetAfterCompactionFailure = true;
        return {
          kind: "final",
          payload: {
            text: "⚠️ Context limit exceeded during compaction. I've reset our conversation to start fresh - please try again.\n\nTo prevent this, increase your compaction buffer by setting `agents.defaults.compaction.reserveTokensFloor` to 20000 or higher in your config.",
          },
        };
      }
      if (isRoleOrderingError) {
        const didReset = await params.resetSessionAfterRoleOrderingConflict(message);
        if (didReset) {
          return {
            kind: "final",
            payload: {
              text: "⚠️ Message ordering conflict. I've reset the conversation - please try again.",
            },
          };
        }
      }

      // Auto-recover from Gemini session corruption by resetting the session
      if (
        isSessionCorruption &&
        params.sessionKey &&
        params.activeSessionStore &&
        params.storePath
      ) {
        const sessionKey = params.sessionKey;
        const corruptedSessionId = params.getActiveSessionEntry()?.sessionId;
        defaultRuntime.error(
          `Session history corrupted (Gemini function call ordering). Resetting session: ${params.sessionKey}`,
        );

        try {
          // Delete transcript file if it exists
          if (corruptedSessionId) {
            const transcriptPath = resolveSessionTranscriptPath(corruptedSessionId);
            try {
              fs.unlinkSync(transcriptPath);
            } catch {
              // Ignore if file doesn't exist
            }
          }

          // Keep the in-memory snapshot consistent with the on-disk store reset.
          delete params.activeSessionStore[sessionKey];

          // Remove session entry from store using a fresh, locked snapshot.
          await updateSessionStore(params.storePath, (store) => {
            delete store[sessionKey];
          });
        } catch (cleanupErr) {
          defaultRuntime.error(
            `Failed to reset corrupted session ${params.sessionKey}: ${String(cleanupErr)}`,
          );
        }

        return {
          kind: "final",
          payload: {
            text: "⚠️ Session history was corrupted. I've reset the conversation - please try again!",
          },
        };
      }

      if (isTransientHttp && !didRetryTransientHttpError) {
        didRetryTransientHttpError = true;
        // Retry the full runWithModelFallback() cycle — transient errors
        // (502/521/etc.) typically affect the whole provider, so falling
        // back to an alternate model first would not help. Instead we wait
        // and retry the complete primary→fallback chain.
        defaultRuntime.error(
          `Transient HTTP provider error before reply (${message}). Retrying once in ${TRANSIENT_HTTP_RETRY_DELAY_MS}ms.`,
        );
        await new Promise<void>((resolve) => {
          setTimeout(resolve, TRANSIENT_HTTP_RETRY_DELAY_MS);
        });
        continue;
      }

      defaultRuntime.error(`Agent failed before reply: ${message}`);
      const safeMessage = isTransientHttp
        ? sanitizeUserFacingText(message, { errorContext: true })
        : message;
      const trimmedMessage = safeMessage.replace(/\.\s*$/, "");
      const fallbackText = isContextOverflow
        ? "⚠️ Context overflow — prompt too large for this model. Try a shorter message or a larger-context model."
        : isRoleOrderingError
          ? "⚠️ Message ordering conflict - please try again. If this persists, use /new to start a fresh session."
          : `⚠️ Agent failed before reply: ${trimmedMessage}.\nLogs: remoteclaw logs --follow`;

      return {
        kind: "final",
        payload: {
          text: fallbackText,
        },
      };
    }
  }

  return {
    kind: "success",
    runId,
    runResult,
    fallbackProvider,
    fallbackModel,
    fallbackAttempts,
    didLogHeartbeatStrip,
    autoCompactionCompleted,
    directlySentBlockKeys: directlySentBlockKeys.size > 0 ? directlySentBlockKeys : undefined,
  };
}
