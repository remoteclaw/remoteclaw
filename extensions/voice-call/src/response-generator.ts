/**
 * Voice call response generator - routes voice responses through ChannelBridge.
 * Uses the same middleware infrastructure as all other dispatch sites.
 */

import crypto from "node:crypto";
import type { VoiceCallConfig } from "./config.js";
import { loadCoreAgentDeps, type CoreConfig } from "./core-bridge.js";

export type VoiceResponseParams = {
  /** Voice call config */
  voiceConfig: VoiceCallConfig;
  /** Core RemoteClaw config */
  coreConfig: CoreConfig;
  /** Call ID for session tracking */
  callId: string;
  /** Caller's phone number */
  from: string;
  /** Conversation transcript */
  transcript: Array<{ speaker: "user" | "bot"; text: string }>;
  /** Latest user message */
  userMessage: string;
};

export type VoiceResponseResult = {
  text: string | null;
  error?: string;
};

type SessionEntry = {
  sessionId: string;
  updatedAt: number;
};

/**
 * Generate a voice response by routing through ChannelBridge.
 * Uses the same middleware pipeline as messaging, cron, and CLI dispatch sites.
 */
export async function generateVoiceResponse(
  params: VoiceResponseParams,
): Promise<VoiceResponseResult> {
  const { voiceConfig, callId, from, transcript, userMessage, coreConfig } = params;

  if (!coreConfig) {
    return { text: null, error: "Core config unavailable for voice response" };
  }

  let deps: Awaited<ReturnType<typeof loadCoreAgentDeps>>;
  try {
    deps = await loadCoreAgentDeps();
  } catch (err) {
    return {
      text: null,
      error: err instanceof Error ? err.message : "Unable to load core agent dependencies",
    };
  }
  const cfg = coreConfig;

  // Resolve provider from config (e.g., "claude/claude-sonnet-4" → "claude")
  const modelRef = voiceConfig.responseModel || `${deps.DEFAULT_PROVIDER}/${deps.DEFAULT_MODEL}`;
  const slashIndex = modelRef.indexOf("/");
  const provider = slashIndex === -1 ? deps.DEFAULT_PROVIDER : modelRef.slice(0, slashIndex);

  // Resolve workspace
  const agentId = "main";
  const workspaceDir = deps.resolveAgentWorkspaceDir(cfg, agentId);
  await deps.ensureAgentWorkspace(workspaceDir);

  // Load or create session entry (legacy store for backward compatibility)
  const normalizedPhone = from.replace(/\D/g, "");
  const sessionKey = `voice:${normalizedPhone}`;
  const storePath = deps.resolveStorePath(cfg.session?.store, { agentId });
  const sessionStore = deps.loadSessionStore(storePath);
  const now = Date.now();
  let sessionEntry = sessionStore[sessionKey] as SessionEntry | undefined;

  if (!sessionEntry) {
    sessionEntry = {
      sessionId: crypto.randomUUID(),
      updatedAt: now,
    };
    sessionStore[sessionKey] = sessionEntry;
    await deps.saveSessionStore(storePath, sessionStore);
  }

  // Session map adapter: read-only, matching the pattern used by all dispatch sites.
  // set()/delete() are no-ops — session persistence is handled after the run.
  const sessionMap = {
    async get() {
      return sessionEntry.sessionId;
    },
    async set() {},
    async delete() {},
  };

  // Gateway credentials
  const gatewayPort = deps.resolveGatewayPort(cfg);
  const gatewayUrl = `ws://127.0.0.1:${gatewayPort}`;
  const gatewayToken =
    deps.resolveGatewayCredentialsFromConfig({ cfg, env: process.env }).token ?? "";

  // Create ChannelBridge
  const bridge = new deps.ChannelBridge({
    provider,
    sessionMap,
    gatewayUrl,
    gatewayToken,
    workspaceDir,
  });

  // Build voice-specific system prompt with conversation history
  const identity = deps.resolveAgentIdentity(cfg, agentId);
  const agentName = identity?.name?.trim() || "assistant";

  const basePrompt =
    voiceConfig.responseSystemPrompt ??
    `You are ${agentName}, a helpful voice assistant on a phone call. Keep responses brief and conversational (1-2 sentences max). Be natural and friendly. The caller's phone number is ${from}. You have access to tools - use them when helpful.`;

  let voiceContext = basePrompt;
  if (transcript.length > 0) {
    const history = transcript
      .map((entry) => `${entry.speaker === "bot" ? "You" : "Caller"}: ${entry.text}`)
      .join("\n");
    voiceContext = `${basePrompt}\n\nConversation so far:\n${history}`;
  }

  // Build ChannelMessage for voice dispatch
  const runId = `voice:${callId}:${now}`;
  const message = {
    id: runId,
    text: `${voiceContext}\n\nCaller: ${userMessage}`,
    from: normalizedPhone,
    channelId: "voice",
    provider: "voice",
    timestamp: now,
    senderIsOwner: true, // Voice callers have direct phone access → treated as owner
  };

  // Execute with timeout (voice calls have real-time constraints)
  const timeoutMs = voiceConfig.responseTimeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const delivery = await bridge.handle(message, undefined, controller.signal);
    clearTimeout(timer);

    // Update session with new CLI session ID for conversation continuity
    if (delivery.run.sessionId) {
      sessionEntry.sessionId = delivery.run.sessionId;
      sessionEntry.updatedAt = Date.now();
      sessionStore[sessionKey] = sessionEntry;
      await deps.saveSessionStore(storePath, sessionStore);
    }

    // Extract text from payloads
    const texts = (delivery.payloads ?? [])
      .filter((p) => p.text && !p.isError)
      .map((p) => p.text?.trim())
      .filter(Boolean);

    const text = texts.join(" ") || null;

    if (!text && delivery.run.aborted) {
      return { text: null, error: "Response generation was aborted" };
    }

    return { text };
  } catch (err) {
    clearTimeout(timer);
    console.error(`[voice-call] Response generation failed:`, err);
    return { text: null, error: String(err) };
  }
}
