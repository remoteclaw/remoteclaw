import "./test-helpers.js";
import crypto from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { monitorWebChannel } from "./auto-reply.js";
import {
  createMockWebListener,
  installWebAutoReplyTestHomeHooks,
  installWebAutoReplyUnitTestHooks,
  resetLoadConfigMock,
  setLoadConfigMock,
} from "./auto-reply.test-harness.js";
import type { WebInboundMessage } from "./inbound.js";

installWebAutoReplyTestHomeHooks();

describe("web auto-reply", () => {
  installWebAutoReplyUnitTestHooks({ pinDns: true });
  type ListenerFactory = NonNullable<Parameters<typeof monitorWebChannel>[1]>;
  const SMALL_MEDIA_CAP_MB = 0.1;
  const SMALL_MEDIA_CAP_BYTES = Math.floor(SMALL_MEDIA_CAP_MB * 1024 * 1024);

  async function setupSingleInboundMessage(params: {
    resolverValue: { text: string; mediaUrl: string };
    sendMedia: ReturnType<typeof vi.fn>;
    reply?: ReturnType<typeof vi.fn>;
  }) {
    const reply = params.reply ?? vi.fn().mockResolvedValue(undefined);
    const sendComposing = vi.fn(async () => undefined);
    const resolver = vi.fn().mockResolvedValue(params.resolverValue);

    let capturedOnMessage: ((msg: WebInboundMessage) => Promise<void>) | undefined;
    const listenerFactory: ListenerFactory = async ({ onMessage }) => {
      capturedOnMessage = onMessage;
      return createMockWebListener();
    };

    await monitorWebChannel(false, listenerFactory, false, resolver);
    expect(capturedOnMessage).toBeDefined();

    return {
      reply,
      dispatch: async (
        id = "msg1",
        overrides?: Partial<
          Pick<WebInboundMessage, "from" | "conversationId" | "to" | "accountId" | "chatId">
        >,
      ) => {
        await capturedOnMessage?.({
          body: "hello",
          from: "+1",
          conversationId: "+1",
          to: "+2",
          accountId: "default",
          chatType: "direct",
          chatId: "+1",
          ...overrides,
          id,
          sendComposing,
          reply,
          sendMedia: params.sendMedia,
        } as WebInboundMessage);
      },
    };
  }

  function getSingleImagePayload(sendMedia: ReturnType<typeof vi.fn>) {
    expect(sendMedia).toHaveBeenCalledTimes(1);
    return sendMedia.mock.calls[0][0] as {
      image: Buffer;
      caption?: string;
      mimetype?: string;
    };
  }

  async function withMediaCap<T>(mediaMaxMb: number, run: () => Promise<T>): Promise<T> {
    setLoadConfigMock(() => ({
      agents: {
        defaults: { mediaMaxMb },
        list: [{ id: "main", workspace: "/tmp/test-workspace" }],
      },
    }));
    try {
      return await run();
    } finally {
      resetLoadConfigMock();
    }
  }

  function mockFetchMediaBuffer(buffer: Buffer, mime: string) {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      body: true,
      arrayBuffer: async () =>
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      headers: { get: () => mime },
      status: 200,
    } as unknown as Response);
  }

  async function expectCompressedImageWithinCap(params: {
    mediaUrl: string;
    mime: string;
    image: Buffer;
    messageId: string;
    mediaMaxMb?: number;
  }) {
    await withMediaCap(params.mediaMaxMb ?? 1, async () => {
      const sendMedia = vi.fn();
      const { reply, dispatch } = await setupSingleInboundMessage({
        resolverValue: { text: "hi", mediaUrl: params.mediaUrl },
        sendMedia,
      });
      const fetchMock = mockFetchMediaBuffer(params.image, params.mime);

      await dispatch(params.messageId);

      const payload = getSingleImagePayload(sendMedia);
      expect(payload.image.length).toBeLessThanOrEqual((params.mediaMaxMb ?? 1) * 1024 * 1024);
      expect(payload.mimetype).toBe("image/jpeg");
      expect(reply).not.toHaveBeenCalled();
      fetchMock.mockRestore();
    });
  }

  it("compresses common formats to jpeg under the cap", async () => {
    const formats = [
      {
        name: "png",
        mime: "image/png",
        make: (buf: Buffer, opts: { width: number; height: number }) =>
          sharp(buf, {
            raw: { width: opts.width, height: opts.height, channels: 3 },
          })
            .png({ compressionLevel: 0 })
            .toBuffer(),
      },
      {
        name: "jpeg",
        mime: "image/jpeg",
        make: (buf: Buffer, opts: { width: number; height: number }) =>
          sharp(buf, {
            raw: { width: opts.width, height: opts.height, channels: 3 },
          })
            // Keep source > cap with fewer pixels so the test runs faster.
            .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
            .toBuffer(),
      },
      {
        name: "webp",
        mime: "image/webp",
        make: (buf: Buffer, opts: { width: number; height: number }) =>
          sharp(buf, {
            raw: { width: opts.width, height: opts.height, channels: 3 },
          })
            .webp({ quality: 100 })
            .toBuffer(),
      },
    ] as const;

    const width = 320;
    const height = 320;
    const sharedRaw = crypto.randomBytes(width * height * 3);

    const renderedFormats = await Promise.all(
      formats.map(async (fmt) => ({
        ...fmt,
        image: await fmt.make(sharedRaw, { width, height }),
      })),
    );

    await withMediaCap(SMALL_MEDIA_CAP_MB, async () => {
      const sendMedia = vi.fn();
      const { reply, dispatch } = await setupSingleInboundMessage({
        resolverValue: {
          text: "hi",
          mediaUrl: "https://example.com/big.image",
        },
        sendMedia,
      });
      let fetchIndex = 0;

      const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        const matched =
          renderedFormats[Math.min(fetchIndex, renderedFormats.length - 1)] ?? renderedFormats[0];
        fetchIndex += 1;
        const { image, mime } = matched;
        return {
          ok: true,
          body: true,
          arrayBuffer: async () =>
            image.buffer.slice(image.byteOffset, image.byteOffset + image.byteLength),
          headers: { get: () => mime },
          status: 200,
        } as unknown as Response;
      });

      try {
        for (const [index, fmt] of renderedFormats.entries()) {
          expect(fmt.image.length).toBeGreaterThan(SMALL_MEDIA_CAP_BYTES);
          const beforeCalls = sendMedia.mock.calls.length;
          await dispatch(`msg-${fmt.name}-${index}`, {
            from: `+1${index}`,
            conversationId: `conv-${index}`,
            chatId: `conv-${index}`,
          });
          expect(sendMedia).toHaveBeenCalledTimes(beforeCalls + 1);
          const payload = sendMedia.mock.calls[beforeCalls]?.[0] as {
            image: Buffer;
            caption?: string;
            mimetype?: string;
          };
          expect(payload.image.length).toBeLessThanOrEqual(SMALL_MEDIA_CAP_BYTES);
          expect(payload.mimetype).toBe("image/jpeg");
        }
        expect(sendMedia).toHaveBeenCalledTimes(renderedFormats.length);
        expect(reply).not.toHaveBeenCalled();
      } finally {
        fetchMock.mockRestore();
      }
    });
  });

  it("honors mediaMaxMb from config", async () => {
    const bigPng = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: { r: 0, g: 0, b: 255 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    expect(bigPng.length).toBeGreaterThan(SMALL_MEDIA_CAP_BYTES);
    await expectCompressedImageWithinCap({
      mediaUrl: "https://example.com/big.png",
      mime: "image/png",
      image: bigPng,
      messageId: "msg1",
      mediaMaxMb: SMALL_MEDIA_CAP_MB,
    });
  });
});
