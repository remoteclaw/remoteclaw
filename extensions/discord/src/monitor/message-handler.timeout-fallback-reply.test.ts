// The inbound-worker timeout-fallback-reply cases, re-homed out of
// message-handler.queue.test.ts (#2998) so that file's remaining queue-behavior coverage
// gates CI on its own. Mirrors the #2953/#2970 focused-spec re-homing precedent (and the
// #2968 dedupe re-home before it).
//
// These three assert a user-facing "Discord inbound worker timed out." channel reply.
// `onTimeout` in inbound-worker.ts is deliberately still log-only, pending a separate,
// ratification-pending maintainer decision on whether that fallback reply should exist at
// all (#2998). They fail for that reason and that reason alone — this whole file is
// quarantined until the decision lands. See vitest.quarantine.ts.
import { describe, expect, it, vi } from "vitest";
import {
  createDiscordMessageHandler,
  deliverDiscordReplyMock,
  preflightDiscordMessageMock,
  processDiscordMessageMock,
} from "./message-handler.module-test-helpers.js";
import {
  createDiscordHandlerParams,
  createDiscordPreflightContext,
} from "./message-handler.test-helpers.js";

function createDeferred<T = void>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

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

function createAbortOnTimeoutProcessImplementation() {
  return async (ctx: { abortSignal?: AbortSignal }) => {
    await new Promise<void>((resolve) => {
      if (ctx.abortSignal?.aborted) {
        resolve();
        return;
      }
      ctx.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
    });
  };
}

async function queueTimedMessages(params?: {
  workerRunTimeoutMs?: number;
  beforeCreateHandler?: () => void;
}) {
  preflightDiscordMessageMock.mockReset();
  processDiscordMessageMock.mockReset();
  deliverDiscordReplyMock.mockClear();

  processDiscordMessageMock
    .mockImplementationOnce(createAbortOnTimeoutProcessImplementation())
    .mockImplementationOnce(async () => undefined);
  installDefaultDiscordPreflight();
  params?.beforeCreateHandler?.();

  const handlerParams = createDiscordHandlerParams({
    workerRunTimeoutMs: params?.workerRunTimeoutMs ?? 50,
  });
  const handler = createDiscordMessageHandler(handlerParams);

  await expect(handler(createMessageData("m-1") as never, {} as never)).resolves.toBeUndefined();
  await expect(handler(createMessageData("m-2") as never, {} as never)).resolves.toBeUndefined();

  return { handlerParams };
}

async function runSingleMessageTimeout(params: {
  processImpl: Parameters<typeof processDiscordMessageMock.mockImplementationOnce>[0];
  workerRunTimeoutMs?: number;
}) {
  preflightDiscordMessageMock.mockReset();
  processDiscordMessageMock.mockReset();
  deliverDiscordReplyMock.mockClear();
  processDiscordMessageMock.mockImplementationOnce(params.processImpl);
  installDefaultDiscordPreflight();

  const handlerParams = createDiscordHandlerParams({
    workerRunTimeoutMs: params.workerRunTimeoutMs ?? 50,
  });
  const handler = createDiscordMessageHandler(handlerParams);

  await expect(handler(createMessageData("m-1") as never, {} as never)).resolves.toBeUndefined();
  await vi.advanceTimersByTimeAsync(60);
  await Promise.resolve();

  expect(handlerParams.runtime.error).toHaveBeenCalledWith(
    expect.stringContaining("discord inbound worker timed out after"),
  );

  return handlerParams;
}

describe("createDiscordMessageHandler timeout fallback reply", () => {
  it("applies explicit inbound worker timeout to queued runs so stalled runs do not block the queue", async () => {
    vi.useFakeTimers();
    try {
      const { handlerParams } = await queueTimedMessages();

      await vi.advanceTimersByTimeAsync(60);
      await vi.waitFor(() => {
        expect(processDiscordMessageMock).toHaveBeenCalledTimes(2);
      });

      const firstCtx = processDiscordMessageMock.mock.calls[0]?.[0] as
        | { abortSignal?: AbortSignal }
        | undefined;
      expect(firstCtx?.abortSignal?.aborted).toBe(true);
      expect(handlerParams.runtime.error).toHaveBeenCalledWith(
        expect.stringContaining("discord inbound worker timed out after"),
      );
      expect(deliverDiscordReplyMock).toHaveBeenCalledTimes(1);
      expect(deliverDiscordReplyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "channel:ch-1",
          token: "test-token",
          replies: [
            expect.objectContaining({
              isError: true,
              text: "Discord inbound worker timed out.",
            }),
          ],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("waits for the timeout fallback reply before starting the next queued run", async () => {
    vi.useFakeTimers();
    try {
      const deliverTimeoutReply = createDeferred();
      const { handlerParams } = await queueTimedMessages({
        beforeCreateHandler: () => {
          deliverDiscordReplyMock.mockReset();
          deliverDiscordReplyMock.mockImplementationOnce(async () => {
            await deliverTimeoutReply.promise;
          });
        },
      });

      await vi.advanceTimersByTimeAsync(60);
      await vi.waitFor(() => {
        expect(deliverDiscordReplyMock).toHaveBeenCalledTimes(1);
      });

      expect(processDiscordMessageMock).toHaveBeenCalledTimes(1);
      expect(handlerParams.runtime.error).toHaveBeenCalledWith(
        expect.stringContaining("discord inbound worker timed out after"),
      );

      deliverTimeoutReply.resolve();
      await deliverTimeoutReply.promise;

      await vi.waitFor(() => {
        expect(processDiscordMessageMock).toHaveBeenCalledTimes(2);
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("routes the timeout fallback to the created auto-thread target", async () => {
    vi.useFakeTimers();
    try {
      await runSingleMessageTimeout({
        processImpl: async (
          ctx: { abortSignal?: AbortSignal },
          observer?: {
            onReplyPlanResolved?: (params: {
              createdThreadId?: string;
              sessionKey?: string;
            }) => void;
          },
        ) => {
          observer?.onReplyPlanResolved?.({
            createdThreadId: "thread-1",
            sessionKey: "agent:main:discord:channel:thread-1",
          });
          await new Promise<void>((resolve) => {
            if (ctx.abortSignal?.aborted) {
              resolve();
              return;
            }
            ctx.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
          });
        },
      });

      expect(deliverDiscordReplyMock).toHaveBeenCalledTimes(1);
      expect(deliverDiscordReplyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          target: "channel:thread-1",
          sessionKey: "agent:main:discord:channel:thread-1",
          replies: [
            expect.objectContaining({
              isError: true,
              text: "Discord inbound worker timed out.",
            }),
          ],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
