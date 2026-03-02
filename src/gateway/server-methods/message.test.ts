import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCodes } from "../protocol/index.js";
import { messageHandlers } from "./message.js";
import type { RespondFn } from "./types.js";

vi.mock("../../config/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({}),
}));

vi.mock("../../infra/outbound/message-action-runner.js", () => ({
  runMessageAction: vi.fn(),
}));

import { runMessageAction } from "../../infra/outbound/message-action-runner.js";

const mockRunMessageAction = vi.mocked(runMessageAction);

function invokeHandler(method: string, params: Record<string, unknown>) {
  const respond = vi.fn() as unknown as RespondFn & ReturnType<typeof vi.fn>;
  const handler = messageHandlers[method];
  return {
    respond,
    invoke: async () =>
      await handler({
        params,
        respond: respond as never,
        context: {} as never,
        client: null,
        req: { type: "req", id: "req-1", method },
        isWebchatConnect: () => false,
      }),
  };
}

describe("messageHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers all 10 message methods", () => {
    const methods = Object.keys(messageHandlers);
    expect(methods).toContain("message:send");
    expect(methods).toContain("message:reply");
    expect(methods).toContain("message:thread-reply");
    expect(methods).toContain("message:broadcast");
    expect(methods).toContain("message:react");
    expect(methods).toContain("message:delete");
    expect(methods).toContain("message:sendAttachment");
    expect(methods).toContain("message:sendWithEffect");
    expect(methods).toContain("message:pin");
    expect(methods).toContain("message:readMessages");
    expect(methods).toHaveLength(10);
  });

  // ── message:send ────────────────────────────────────────────────────

  it("message:send calls runMessageAction with action 'send'", async () => {
    const result = { kind: "send", channel: "telegram", action: "send" };
    mockRunMessageAction.mockResolvedValueOnce(result as never);

    const { respond, invoke } = invokeHandler("message:send", {
      target: "user-1",
      message: "Hello",
      channel: "telegram",
      accountId: "acc-1",
    });
    await invoke();

    expect(mockRunMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "send",
        params: expect.objectContaining({ target: "user-1", message: "Hello" }),
      }),
    );
    expect(respond).toHaveBeenCalledWith(true, result);
  });

  // ── message:reply ───────────────────────────────────────────────────

  it("message:reply maps replyToId to replyTo and uses action 'send'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "send" } as never);

    const { respond, invoke } = invokeHandler("message:reply", {
      message: "Reply text",
      replyToId: "msg-42",
      channel: "telegram",
      accountId: "acc-1",
      to: "chat-123",
    });
    await invoke();

    const call = mockRunMessageAction.mock.calls[0]?.[0];
    expect(call?.action).toBe("send");
    expect(call?.params).toHaveProperty("replyTo", "msg-42");
    expect(call?.params).not.toHaveProperty("replyToId");
    expect(respond).toHaveBeenCalledWith(true, expect.anything());
  });

  // ── message:thread-reply ────────────────────────────────────────────

  it("message:thread-reply passes threadId and uses action 'send'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "send" } as never);

    const { invoke } = invokeHandler("message:thread-reply", {
      message: "Thread msg",
      threadId: "thread-1",
      channel: "slack",
      accountId: "acc-1",
      to: "C1234",
    });
    await invoke();

    const call = mockRunMessageAction.mock.calls[0]?.[0];
    expect(call?.action).toBe("send");
    expect(call?.params).toHaveProperty("threadId", "thread-1");
  });

  // ── message:broadcast ───────────────────────────────────────────────

  it("message:broadcast calls runMessageAction with action 'broadcast'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "broadcast" } as never);

    const { invoke } = invokeHandler("message:broadcast", {
      targets: ["user-1", "user-2"],
      message: "Announcement",
      channel: "telegram",
      accountId: "acc-1",
    });
    await invoke();

    expect(mockRunMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "broadcast",
        params: expect.objectContaining({ targets: ["user-1", "user-2"] }),
      }),
    );
  });

  // ── message:react ───────────────────────────────────────────────────

  it("message:react calls runMessageAction with action 'react'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "action" } as never);

    const { invoke } = invokeHandler("message:react", {
      emoji: "\u{1F44D}",
      messageId: "msg-1",
      channel: "telegram",
      accountId: "acc-1",
      to: "chat-123",
    });
    await invoke();

    expect(mockRunMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "react",
        params: expect.objectContaining({ emoji: "\u{1F44D}", messageId: "msg-1" }),
      }),
    );
  });

  // ── message:delete ──────────────────────────────────────────────────

  it("message:delete calls runMessageAction with action 'delete'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "action" } as never);

    const { invoke } = invokeHandler("message:delete", {
      messageId: "msg-99",
      channel: "discord",
      accountId: "acc-1",
      to: "chat-456",
    });
    await invoke();

    expect(mockRunMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        params: expect.objectContaining({ messageId: "msg-99" }),
      }),
    );
  });

  // ── message:sendAttachment ──────────────────────────────────────────

  it("message:sendAttachment maps file to media and uses action 'send'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "send" } as never);

    const { invoke } = invokeHandler("message:sendAttachment", {
      target: "user-1",
      file: "https://example.com/doc.pdf",
      caption: "Here is the file",
      channel: "telegram",
      accountId: "acc-1",
    });
    await invoke();

    const call = mockRunMessageAction.mock.calls[0]?.[0];
    expect(call?.action).toBe("send");
    expect(call?.params).toHaveProperty("media", "https://example.com/doc.pdf");
    expect(call?.params).not.toHaveProperty("file");
    expect(call?.params).toHaveProperty("message", "Here is the file");
  });

  // ── message:sendWithEffect ──────────────────────────────────────────

  it("message:sendWithEffect calls runMessageAction with action 'sendWithEffect'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "action" } as never);

    const { invoke } = invokeHandler("message:sendWithEffect", {
      target: "user-1",
      message: "Surprise!",
      effectId: "confetti",
      channel: "imessage",
      accountId: "acc-1",
    });
    await invoke();

    expect(mockRunMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sendWithEffect",
        params: expect.objectContaining({ effectId: "confetti" }),
      }),
    );
  });

  // ── message:pin ─────────────────────────────────────────────────────

  it("message:pin calls runMessageAction with action 'pin'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "action" } as never);

    const { invoke } = invokeHandler("message:pin", {
      messageId: "msg-5",
      channel: "slack",
      accountId: "acc-1",
      to: "C1234",
    });
    await invoke();

    expect(mockRunMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "pin",
        params: expect.objectContaining({ messageId: "msg-5" }),
      }),
    );
  });

  // ── message:readMessages ────────────────────────────────────────────

  it("message:readMessages calls runMessageAction with action 'read'", async () => {
    mockRunMessageAction.mockResolvedValueOnce({ kind: "action" } as never);

    const { invoke } = invokeHandler("message:readMessages", {
      channelId: "chat-123",
      limit: 10,
      channel: "telegram",
      accountId: "acc-1",
    });
    await invoke();

    expect(mockRunMessageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "read",
        params: expect.objectContaining({ channelId: "chat-123", limit: 10 }),
      }),
    );
  });

  // ── Error handling ──────────────────────────────────────────────────

  it("responds with UNAVAILABLE when runMessageAction throws", async () => {
    mockRunMessageAction.mockRejectedValueOnce(new Error("channel not configured"));

    const { respond, invoke } = invokeHandler("message:send", {
      target: "user-1",
      message: "Hello",
    });
    await invoke();

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: ErrorCodes.UNAVAILABLE,
        message: "channel not configured",
      }),
    );
  });
});
