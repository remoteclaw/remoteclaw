import type { PluginRuntime, RemoteClawConfig } from "remoteclaw/plugin-sdk/zalouser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./monitor.send-mocks.js";
import { __testing } from "./monitor.js";
import { sendMessageZalouserMock } from "./monitor.send-mocks.js";
import { setZalouserRuntime } from "./runtime.js";
import { createZalouserRuntimeEnv } from "./test-helpers.js";
import type { ResolvedZalouserAccount, ZaloInboundMessage } from "./types.js";

// Focused regression spec for #2970 (deliverZalouserReply dropped textMode + chunk options, and
// chunked raw markdown itself instead of letting send.ts chunk after parsing). The paired
// assertion also lives in monitor.group-gating.test.ts, but that file is quarantined on an
// UNRELATED source regression (open-policy non-command DMs are dropped before dispatch, so its
// DM-based long-markdown assert never reaches a send) and therefore never runs in CI — so this
// behavior is gated here instead, over the GROUP path, which dispatches normally.
// Same pattern as the #2953 focused spec in monitor.group-name-matching.test.ts.
//
// These must exercise processMessage's delivery callback rather than sendMessageZalouser
// directly: send.ts already honors textMode/textChunkMode/textChunkLimit, and its own (green,
// non-quarantined) unit tests in send.test.ts passed throughout the broken window. The defect was
// in the CALLER wiring, which only an end-to-end delivery-path test can catch.

const CHUNK_LIMIT = 1200;

/**
 * A chunker that actually splits, unlike the identity stub used elsewhere. If a future change
 * re-introduces outer chunking in deliverZalouserReply, long text arrives as several partial
 * sends instead of one whole one — which is exactly what these tests must catch.
 */
const chunkMarkdownTextWithMode = vi.fn((text: string, limit: number) => {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += limit) {
    chunks.push(text.slice(start, start + limit));
  }
  return chunks.length > 0 ? chunks : [text];
});

const resolveChunkMode = vi.fn(() => "length");
const resolveTextChunkLimit = vi.fn(() => CHUNK_LIMIT);

function installRuntime(replyPayload: { text?: string; mediaUrls?: string[] }) {
  setZalouserRuntime({
    logging: { shouldLogVerbose: () => false },
    channel: {
      commands: {
        shouldComputeCommandAuthorized: vi.fn((body: string) => body.trim().startsWith("/")),
        resolveCommandAuthorizedFromAuthorizers: vi.fn(() => false),
        isControlCommandMessage: vi.fn((body: string) => body.trim().startsWith("/")),
        shouldHandleTextCommands: vi.fn(() => true),
      },
      mentions: {
        buildMentionRegexes: vi.fn(() => []),
        matchesMentionWithExplicit: vi.fn(
          (input) => input.explicit?.isExplicitlyMentioned === true,
        ),
      },
      groups: { resolveRequireMention: vi.fn(() => false) },
      routing: {
        buildAgentSessionKey: vi.fn(() => "agent:main:zalouser:group:g-1"),
        resolveAgentRoute: vi.fn(() => ({
          agentId: "main",
          sessionKey: "agent:main:zalouser:group:g-1",
          accountId: "default",
          mainSessionKey: "agent:main:main",
        })),
      },
      session: {
        resolveStorePath: vi.fn(() => "/tmp"),
        readSessionUpdatedAt: vi.fn(() => undefined),
        recordInboundSession: vi.fn(async () => {}),
      },
      reply: {
        resolveEnvelopeFormatOptions: vi.fn(() => undefined),
        formatAgentEnvelope: vi.fn(({ body }) => body),
        finalizeInboundContext: vi.fn((ctx) => ctx),
        dispatchReplyWithBufferedBlockDispatcher: vi.fn(async ({ dispatcherOptions, ctx }) => {
          await dispatcherOptions.deliver(replyPayload);
          return { queuedFinal: false, counts: { tool: 0, block: 0, final: 0 }, ctx };
        }),
      },
      text: {
        resolveMarkdownTableMode: vi.fn(() => "code"),
        convertMarkdownTables: vi.fn((text: string) => text),
        resolveChunkMode,
        resolveTextChunkLimit,
        chunkMarkdownTextWithMode,
      },
    },
  } as unknown as PluginRuntime);
}

function createAccount(): ResolvedZalouserAccount {
  return {
    accountId: "default",
    enabled: true,
    profile: "default",
    authenticated: true,
    config: { groupPolicy: "open", groups: { "*": { requireMention: false } } },
  };
}

function createConfig(): RemoteClawConfig {
  return { channels: { zalouser: { enabled: true } } };
}

function createGroupMessage(): ZaloInboundMessage {
  return {
    threadId: "g-1",
    isGroup: true,
    senderId: "123",
    senderName: "Alice",
    groupName: "Team",
    content: "hello",
    timestampMs: Date.now(),
    msgId: "m-1",
    hasAnyMention: true,
    wasExplicitlyMentioned: true,
    canResolveExplicitMention: true,
    implicitMention: false,
    raw: { source: "test" },
  };
}

async function deliverReply(replyPayload: { text?: string; mediaUrls?: string[] }) {
  installRuntime(replyPayload);
  await __testing.processMessage({
    message: createGroupMessage(),
    account: createAccount(),
    config: createConfig(),
    runtime: createZalouserRuntimeEnv(),
  });
}

describe("deliverZalouserReply outbound text options (#2970)", () => {
  beforeEach(() => {
    sendMessageZalouserMock.mockClear();
    chunkMarkdownTextWithMode.mockClear();
    resolveTextChunkLimit.mockClear();
  });

  it("sends markdown replies with textMode so send.ts applies Zalo styling", async () => {
    await deliverReply({ text: "**bold** reply" });

    expect(sendMessageZalouserMock).toHaveBeenCalledTimes(1);
    expect(sendMessageZalouserMock).toHaveBeenCalledWith(
      "g-1",
      "**bold** reply",
      expect.objectContaining({
        profile: "default",
        isGroup: true,
        textMode: "markdown",
      }),
    );
  });

  it("honors the configured textChunkLimit instead of dropping it", async () => {
    await deliverReply({ text: "hello" });

    expect(resolveTextChunkLimit).toHaveBeenCalledWith(
      expect.anything(),
      "zalouser",
      "default",
      expect.objectContaining({ fallbackLimit: 2000 }),
    );
    expect(sendMessageZalouserMock).toHaveBeenCalledWith(
      "g-1",
      "hello",
      expect.objectContaining({ textChunkMode: "length", textChunkLimit: CHUNK_LIMIT }),
    );
  });

  it("passes long markdown down once so formatting happens before chunking", async () => {
    // Wrapped in ** and longer than the chunk limit: an outer chunker would cut between the
    // markers and orphan the styling, so send.ts must receive the whole string in one call.
    const replyText = `**${"a".repeat(CHUNK_LIMIT + 1301)}**`;
    await deliverReply({ text: replyText });

    expect(sendMessageZalouserMock).toHaveBeenCalledTimes(1);
    expect(sendMessageZalouserMock).toHaveBeenCalledWith(
      "g-1",
      replyText,
      expect.objectContaining({ textMode: "markdown", textChunkLimit: CHUNK_LIMIT }),
    );
    expect(chunkMarkdownTextWithMode).not.toHaveBeenCalled();
  });

  it("carries the text options on media captions too", async () => {
    await deliverReply({ text: "**caption**", mediaUrls: ["https://example.com/a.jpg"] });

    expect(sendMessageZalouserMock).toHaveBeenCalledTimes(1);
    expect(sendMessageZalouserMock).toHaveBeenCalledWith(
      "g-1",
      "**caption**",
      expect.objectContaining({
        mediaUrl: "https://example.com/a.jpg",
        textMode: "markdown",
        textChunkLimit: CHUNK_LIMIT,
      }),
    );
  });
});
