// Focused regression coverage for the inbound message-ID replay guard wired into
// createDiscordMessageHandler (#2968). These three cases were re-homed out of the
// still-quarantined message-handler.queue.test.ts (which stays quarantined only on its
// timeout-fallback-reply cases, an open maintainer-intent decision) so the dedup behavior
// gates CI on its own. Mirrors the #2953/#2970 focused-spec re-homing precedent.
import { describe, expect, it, vi } from "vitest";
import { DiscordRetryableInboundError } from "./inbound-dedupe.js";
import {
  createDiscordMessageHandler,
  preflightDiscordMessageMock,
  processDiscordMessageMock,
} from "./message-handler.module-test-helpers.js";
import {
  createDiscordHandlerParams,
  createDiscordPreflightContext,
} from "./message-handler.test-helpers.js";

type SetStatusFn = (patch: Record<string, unknown>) => void;

function createMessageData(messageId: string, channelId = "ch-1") {
  return {
    channel_id: channelId,
    author: { id: "user-1" },
    message: {
      id: messageId,
      author: { id: "user-1", bot: false },
      content: "hello",
      channel_id: channelId,
      attachments: [{ id: `att-${messageId}` }],
    },
  };
}

function createPreflightContext(channelId = "ch-1") {
  return {
    ...createDiscordPreflightContext(channelId),
    accountId: "default",
    token: "test-token",
    textLimit: 2_000,
    replyToMode: "off" as const,
    discordConfig: {
      enabled: true,
      token: "test-token",
      groupPolicy: "allowlist" as const,
    },
  };
}

function installDefaultDiscordPreflight() {
  preflightDiscordMessageMock.mockImplementation(async (params: { data: { channel_id: string } }) =>
    createPreflightContext(params.data.channel_id),
  );
}

function createHandlerWithDefaultPreflight(overrides?: {
  setStatus?: SetStatusFn;
  workerRunTimeoutMs?: number;
}) {
  installDefaultDiscordPreflight();
  return createDiscordMessageHandler(createDiscordHandlerParams(overrides));
}

describe("createDiscordMessageHandler inbound replay guard", () => {
  it("drops duplicate inbound message deliveries before they reach preflight", async () => {
    preflightDiscordMessageMock.mockReset();
    processDiscordMessageMock.mockReset();

    const handler = createHandlerWithDefaultPreflight();
    const duplicate = createMessageData("m-dup");

    await expect(handler(duplicate as never, {} as never)).resolves.toBeUndefined();
    await expect(handler(duplicate as never, {} as never)).resolves.toBeUndefined();

    await vi.waitFor(() => {
      expect(processDiscordMessageMock).toHaveBeenCalledTimes(1);
    });
    expect(preflightDiscordMessageMock).toHaveBeenCalledTimes(1);
  });

  it("retries duplicate deliveries after an explicit retryable worker failure", async () => {
    preflightDiscordMessageMock.mockReset();
    processDiscordMessageMock.mockReset();

    processDiscordMessageMock
      .mockRejectedValueOnce(new DiscordRetryableInboundError("retry me"))
      .mockResolvedValueOnce(undefined);
    const params = createDiscordHandlerParams();
    const handler = createDiscordMessageHandler(params);
    installDefaultDiscordPreflight();
    const duplicate = createMessageData("m-retry");

    await expect(handler(duplicate as never, {} as never)).resolves.toBeUndefined();
    await vi.waitFor(() => {
      expect(processDiscordMessageMock).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(params.runtime.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "discord inbound worker failed: DiscordRetryableInboundError: retry me",
        ),
      );
    });

    await expect(handler(duplicate as never, {} as never)).resolves.toBeUndefined();
    await vi.waitFor(() => {
      expect(processDiscordMessageMock).toHaveBeenCalledTimes(2);
    });
    expect(preflightDiscordMessageMock).toHaveBeenCalledTimes(2);
  });

  it("keeps replay committed after a non-retryable worker failure", async () => {
    preflightDiscordMessageMock.mockReset();
    processDiscordMessageMock.mockReset();

    const visibleSideEffect = vi.fn();
    processDiscordMessageMock.mockImplementationOnce(async () => {
      visibleSideEffect();
      throw new Error("post-send failure");
    });
    const params = createDiscordHandlerParams();
    const handler = createDiscordMessageHandler(params);
    installDefaultDiscordPreflight();
    const duplicate = createMessageData("m-fail");

    await expect(handler(duplicate as never, {} as never)).resolves.toBeUndefined();
    await vi.waitFor(() => {
      expect(processDiscordMessageMock).toHaveBeenCalledTimes(1);
    });
    await vi.waitFor(() => {
      expect(params.runtime.error).toHaveBeenCalledWith(
        expect.stringContaining("discord inbound worker failed: Error: post-send failure"),
      );
    });

    await expect(handler(duplicate as never, {} as never)).resolves.toBeUndefined();
    await Promise.resolve();

    expect(processDiscordMessageMock).toHaveBeenCalledTimes(1);
    expect(preflightDiscordMessageMock).toHaveBeenCalledTimes(1);
    expect(visibleSideEffect).toHaveBeenCalledTimes(1);
  });
});
