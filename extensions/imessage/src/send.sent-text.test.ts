import { describe, expect, it, vi } from "vitest";
import type { loadConfig } from "../../../src/config/config.js";
import type { ResolvedIMessageAccount } from "./accounts.js";
import type { IMessageRpcClient } from "./client.js";
import { createSentMessageCache } from "./monitor/echo-cache.js";
import { sendMessageIMessage } from "./send.js";

const cfg = {
  channels: { imessage: { enabled: true } },
} as unknown as ReturnType<typeof loadConfig>;

const account: ResolvedIMessageAccount = {
  accountId: "default",
  enabled: true,
  config: {},
  configured: true,
};

function createFakeClient() {
  const request = vi.fn(async () => ({ message_id: "imsg-1" }));
  const client = { request, stop: vi.fn(async () => {}) } as unknown as IMessageRpcClient;
  return { client, request };
}

describe("sendMessageIMessage sent text", () => {
  it("returns the text handed to the bridge, not the caller's input", async () => {
    const { client, request } = createFakeClient();

    const sent = await sendMessageIMessage("+15551234567", "hello", {
      client,
      config: cfg,
      account,
      replyToId: "abc",
    });

    expect(sent.sentText).toBe("[[rc:reply:abc]] hello");
    // The invariant that makes body matching possible: sentText is exactly the
    // body the bridge was asked to send, so it is what the platform echoes back.
    expect(request).toHaveBeenCalledWith(
      "send",
      expect.objectContaining({ text: sent.sentText }),
      expect.anything(),
    );
  });

  it("returns the media placeholder as sent text for media-only sends", async () => {
    const { client, request } = createFakeClient();

    const sent = await sendMessageIMessage("+15551234567", "", {
      client,
      config: cfg,
      account,
      mediaUrl: "https://example.com/a.jpg",
      resolveAttachmentImpl: async () => ({ path: "/fake/a.jpg", contentType: "image/jpeg" }),
    });

    expect(sent.sentText).toBe("<media:image>");
    expect(request).toHaveBeenCalledWith(
      "send",
      expect.objectContaining({ text: "<media:image>" }),
      expect.anything(),
    );
  });

  it("lets the echo cache match a self-echo by body", async () => {
    const { client } = createFakeClient();
    const scope = "default:+15551234567";

    const sent = await sendMessageIMessage("+15551234567", "hello", {
      client,
      config: cfg,
      account,
      replyToId: "abc",
    });

    const cache = createSentMessageCache();
    cache.remember(scope, { text: sent.sentText, messageId: sent.messageId });

    // An echo carrying only the body (no matching outbound id) is still suppressed.
    expect(cache.has(scope, { text: "[[rc:reply:abc]] hello" })).toBe(true);
    // Regression guard for #2971: remembering the caller's pre-transform text
    // would never match the echoed body.
    expect(cache.has(scope, { text: "hello" })).toBe(false);
  });
});
