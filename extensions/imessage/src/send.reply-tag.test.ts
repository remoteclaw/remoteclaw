import { describe, expect, it, vi } from "vitest";
import type { loadConfig } from "../../../src/config/config.js";
import type { ResolvedIMessageAccount } from "./accounts.js";
import type { IMessageRpcClient } from "./client.js";
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
  const request = vi.fn(
    async (_method: string, _params?: Record<string, unknown>, _opts?: unknown) => ({
      message_id: "imsg-1",
    }),
  );
  const client = { request, stop: vi.fn(async () => {}) } as unknown as IMessageRpcClient;
  return { client, request };
}

function lastSendParams(request: ReturnType<typeof createFakeClient>["request"]) {
  const call = request.mock.calls.at(-1);
  if (!call) {
    throw new Error("send was not called");
  }
  expect(call[0]).toBe("send");
  return (call[1] ?? {}) as Record<string, unknown>;
}

// Regression coverage for #2990 (ports openclaw#39512): the legacy `imsg` bridge
// delivers text verbatim and does not interpret RemoteClaw's inline directive
// tags, so reply threading must ride the structured `reply_to` RPC field and the
// user-visible body must never contain a `[[rc:reply:...]]` (or other directive)
// tag.
describe("sendMessageIMessage reply threading", () => {
  it("passes replyToId as a structured reply_to param instead of embedding it in text", async () => {
    const { client, request } = createFakeClient();

    await sendMessageIMessage("+15551234567", "hello world", {
      client,
      config: cfg,
      account,
      replyToId: "abc-123",
    });

    const params = lastSendParams(request);
    expect(params.text).toBe("hello world");
    expect(params.reply_to).toBe("abc-123");
  });

  it("strips an inline [[rc:reply:...]] tag from text and still threads via reply_to", async () => {
    const { client, request } = createFakeClient();

    await sendMessageIMessage("+15551234567", "[[rc:reply:old]] hello", {
      client,
      config: cfg,
      account,
      replyToId: "new-id",
    });

    const params = lastSendParams(request);
    expect(params.text).toBe("hello");
    expect(params.reply_to).toBe("new-id");
  });

  it("sanitizes replyToId before passing it as the reply_to param", async () => {
    const { client, request } = createFakeClient();

    await sendMessageIMessage("+15551234567", "hello", {
      client,
      config: cfg,
      account,
      replyToId: " [ab]\n\u0000c\td ] ",
    });

    const params = lastSendParams(request);
    expect(params.text).toBe("hello");
    expect(params.reply_to).toBe("abcd");
  });

  it("omits reply_to when the sanitized replyToId is empty", async () => {
    const { client, request } = createFakeClient();

    await sendMessageIMessage("+15551234567", "hello", {
      client,
      config: cfg,
      account,
      replyToId: "[]\n\t",
    });

    const params = lastSendParams(request);
    expect(params.text).toBe("hello");
    expect(params.reply_to).toBeUndefined();
  });

  it("strips a stray [[rc:reply:...]] tag even when no replyToId option is given", async () => {
    const { client, request } = createFakeClient();

    await sendMessageIMessage("+15551234567", "[[rc:reply:65]] Great question", {
      client,
      config: cfg,
      account,
    });

    const params = lastSendParams(request);
    expect(params.text).toBe("Great question");
    expect(params.reply_to).toBeUndefined();
  });

  it("strips a [[audio_as_voice]] tag from outbound text", async () => {
    const { client, request } = createFakeClient();

    await sendMessageIMessage("+15551234567", "hello [[audio_as_voice]] world", {
      client,
      config: cfg,
      account,
    });

    const params = lastSendParams(request);
    expect(params.text).toBe("hello world");
  });

  it("throws when the text is only directive tags and there is no media", async () => {
    const { client } = createFakeClient();

    await expect(
      sendMessageIMessage("+15551234567", "[[rc:reply:65]]", {
        client,
        config: cfg,
        account,
      }),
    ).rejects.toThrow("iMessage send requires text or media");
  });
});
