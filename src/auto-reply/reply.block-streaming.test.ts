import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { getReplyFromConfig } from "./reply.js";

const piEmbeddedMock = vi.hoisted(() => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: vi.fn(),
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));

vi.mock("../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/index.js")>();
  return { ...actual, ChannelBridge: vi.fn(), ClaudeCliRuntime: vi.fn() };
});
vi.mock("/src/agents/pi-embedded.js", () => piEmbeddedMock);
vi.mock("../agents/pi-embedded.js", () => piEmbeddedMock);
vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

import { ChannelBridge } from "../middleware/index.js";

const mockHandle = vi.fn();

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "openclaw-stream-" });
}

describe("block streaming", () => {
  beforeEach(() => {
    piEmbeddedMock.abortEmbeddedPiRun.mockReset().mockReturnValue(false);
    piEmbeddedMock.queueEmbeddedPiMessage.mockReset().mockReturnValue(false);
    piEmbeddedMock.isEmbeddedPiRunActive.mockReset().mockReturnValue(false);
    piEmbeddedMock.isEmbeddedPiRunStreaming.mockReset().mockReturnValue(false);
    piEmbeddedMock.runEmbeddedPiAgent.mockReset();
    vi.mocked(ChannelBridge).mockImplementation(function () {
      return { handle: mockHandle };
    } as never);
    mockHandle.mockReset();
    mockHandle.mockResolvedValue({
      text: "ok",
      sessionId: "s",
      durationMs: 5,
      usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
      aborted: false,
      error: undefined,
    });
    vi.mocked(loadModelCatalog).mockResolvedValue([
      { id: "claude-opus-4-5", name: "Opus 4.5", provider: "anthropic" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai" },
    ]);
  });

  async function waitForCalls(fn: () => number, calls: number) {
    const deadline = Date.now() + 5000;
    while (fn() < calls) {
      if (Date.now() > deadline) {
        throw new Error(`Expected ${calls} call(s), got ${fn()}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }

  it("waits for block replies before returning final payloads", async () => {
    await withTempHome(async (home) => {
      let releaseTyping: (() => void) | undefined;
      const typingGate = new Promise<void>((resolve) => {
        releaseTyping = resolve;
      });
      const onReplyStart = vi.fn(() => typingGate);
      const onBlockReply = vi.fn().mockResolvedValue(undefined);

      mockHandle.mockResolvedValue({
        text: "hello",
        sessionId: "s",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        aborted: false,
        error: undefined,
      });

      const replyPromise = getReplyFromConfig(
        {
          Body: "ping",
          From: "+1004",
          To: "+2000",
          MessageSid: "msg-123",
          Provider: "discord",
        },
        {
          onReplyStart,
          onBlockReply,
          disableBlockStreaming: false,
        },
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "openclaw"),
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      await waitForCalls(() => onReplyStart.mock.calls.length, 1);
      releaseTyping?.();

      const res = await replyPromise;
      expect(res).toMatchObject({ text: "hello" });
    });
  });

  it("preserves block reply ordering when typing start is slow", async () => {
    await withTempHome(async (home) => {
      let releaseTyping: (() => void) | undefined;
      const typingGate = new Promise<void>((resolve) => {
        releaseTyping = resolve;
      });
      const onReplyStart = vi.fn(() => typingGate);
      const seen: string[] = [];
      const onBlockReply = vi.fn(async (payload) => {
        seen.push(payload.text ?? "");
      });

      mockHandle.mockResolvedValue({
        text: "first\n\nsecond",
        sessionId: "s",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        aborted: false,
        error: undefined,
      });

      const replyPromise = getReplyFromConfig(
        {
          Body: "ping",
          From: "+1004",
          To: "+2000",
          MessageSid: "msg-125",
          Provider: "telegram",
        },
        {
          onReplyStart,
          onBlockReply,
          disableBlockStreaming: false,
        },
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "openclaw"),
            },
          },
          channels: { telegram: { allowFrom: ["*"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      await waitForCalls(() => onReplyStart.mock.calls.length, 1);
      releaseTyping?.();

      const res = await replyPromise;
      expect(res).toMatchObject({ text: "first\n\nsecond" });
    });
  });

  it("drops final payloads when block replies streamed", async () => {
    await withTempHome(async (home) => {
      const onBlockReply = vi.fn().mockResolvedValue(undefined);

      mockHandle.mockResolvedValue({
        text: "chunk-1\nchunk-2",
        sessionId: "s",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        aborted: false,
        error: undefined,
      });

      const res = await getReplyFromConfig(
        {
          Body: "ping",
          From: "+1004",
          To: "+2000",
          MessageSid: "msg-124",
          Provider: "discord",
        },
        {
          onBlockReply,
          disableBlockStreaming: false,
        },
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "openclaw"),
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      expect(res).toMatchObject({ text: "chunk-1\nchunk-2" });
    });
  });

  it("falls back to final payloads when block reply send times out", async () => {
    await withTempHome(async (home) => {
      const onBlockReply = vi.fn().mockResolvedValue(undefined);

      mockHandle.mockResolvedValue({
        text: "final",
        sessionId: "s",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        aborted: false,
        error: undefined,
      });

      const replyPromise = getReplyFromConfig(
        {
          Body: "ping",
          From: "+1004",
          To: "+2000",
          MessageSid: "msg-126",
          Provider: "telegram",
        },
        {
          onBlockReply,
          blockReplyTimeoutMs: 10,
          disableBlockStreaming: false,
        },
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "openclaw"),
            },
          },
          channels: { telegram: { allowFrom: ["*"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      const res = await replyPromise;
      expect(res).toMatchObject({ text: "final" });
    });
  });

  it("does not enable block streaming for telegram streamMode block", async () => {
    await withTempHome(async (home) => {
      const onBlockReply = vi.fn().mockResolvedValue(undefined);

      mockHandle.mockResolvedValue({
        text: "final",
        sessionId: "s",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        aborted: false,
        error: undefined,
      });

      const res = await getReplyFromConfig(
        {
          Body: "ping",
          From: "+1004",
          To: "+2000",
          MessageSid: "msg-126",
          Provider: "telegram",
        },
        {
          onBlockReply,
        },
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "openclaw"),
            },
          },
          channels: { telegram: { allowFrom: ["*"], streamMode: "block" } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("final");
      expect(onBlockReply).not.toHaveBeenCalled();
    });
  });
});
