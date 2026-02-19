import { describe, expect, it } from "vitest";
import { toDeliveryResult } from "./delivery-adapter.js";
import type { ChannelReply } from "./types.js";

describe("toDeliveryResult", () => {
  const baseReply: ChannelReply = {
    text: "Hello world",
    sessionId: "sess-123",
    durationMs: 500,
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
    },
    aborted: false,
    error: undefined,
  };

  it("maps a full reply to EmbeddedPiRunResult", () => {
    const result = toDeliveryResult(baseReply, "claude-cli", "claude-sonnet-4-5-20250929");

    expect(result.payloads).toEqual([{ text: "Hello world" }]);
    expect(result.meta.durationMs).toBe(500);
    expect(result.meta.agentMeta).toEqual({
      sessionId: "sess-123",
      provider: "claude-cli",
      model: "claude-sonnet-4-5-20250929",
      usage: {
        input: 100,
        output: 50,
        cacheRead: 10,
        cacheWrite: 5,
      },
    });
    expect(result.meta.aborted).toBeUndefined();
    expect(result.meta.error).toBeUndefined();
  });

  it("returns undefined payloads for empty text", () => {
    const reply: ChannelReply = { ...baseReply, text: "" };
    const result = toDeliveryResult(reply, "claude-cli", "m");

    expect(result.payloads).toBeUndefined();
  });

  it("maps error to meta.error with context_overflow kind", () => {
    const reply: ChannelReply = { ...baseReply, error: "context window exceeded" };
    const result = toDeliveryResult(reply, "claude-cli", "m");

    expect(result.meta.error).toEqual({
      kind: "context_overflow",
      message: "context window exceeded",
    });
  });

  it("sets aborted flag when reply is aborted", () => {
    const reply: ChannelReply = { ...baseReply, aborted: true };
    const result = toDeliveryResult(reply, "claude-cli", "m");

    expect(result.meta.aborted).toBe(true);
  });

  it("handles undefined usage", () => {
    const reply: ChannelReply = { ...baseReply, usage: undefined };
    const result = toDeliveryResult(reply, "claude-cli", "m");

    expect(result.meta.agentMeta?.usage).toBeUndefined();
  });

  it("defaults sessionId to empty string when undefined", () => {
    const reply: ChannelReply = { ...baseReply, sessionId: undefined };
    const result = toDeliveryResult(reply, "claude-cli", "m");

    expect(result.meta.agentMeta?.sessionId).toBe("");
  });

  it("does not set messaging tool fields", () => {
    const result = toDeliveryResult(baseReply, "claude-cli", "m");

    expect(result.didSendViaMessagingTool).toBeUndefined();
    expect(result.messagingToolSentTexts).toBeUndefined();
    expect(result.messagingToolSentTargets).toBeUndefined();
  });
});
