import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markdownToSignalTextChunks } from "../../../extensions/signal/src/format.js";
import { signalOutbound } from "../../channels/plugins/outbound/signal.js";
import { telegramOutbound } from "../../channels/plugins/outbound/telegram.js";
import { whatsappOutbound } from "../../channels/plugins/outbound/whatsapp.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { STATE_DIR } from "../../config/paths.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../../test-utils/channel-plugins.js";
import { withEnvAsync } from "../../test-utils/env.js";
import { createIMessageTestPlugin } from "../../test-utils/imessage-test-plugin.js";
import { createInternalHookEventPayload } from "../../test-utils/internal-hook-event-payload.js";
import { resolvePreferredRemoteClawTmpDir } from "../tmp-remoteclaw-dir.js";
import {
  readDeliveredBeforeFailure,
  readPlatformSendAttempted,
} from "./delivered-before-failure.js";

const mocks = vi.hoisted(() => ({
  appendAssistantMessageToSessionTranscript: vi.fn(async () => ({ ok: true, sessionFile: "x" })),
}));
const hookMocks = vi.hoisted(() => ({
  runner: {
    hasHooks: vi.fn(() => false),
    runMessageSent: vi.fn(async () => {}),
  },
}));
const internalHookMocks = vi.hoisted(() => ({
  createInternalHookEvent: vi.fn(),
  triggerInternalHook: vi.fn(async () => {}),
}));
const queueMocks = vi.hoisted(() => ({
  enqueueDelivery: vi.fn(async () => "mock-queue-id"),
  ackDelivery: vi.fn(async () => {}),
  failDelivery: vi.fn(async () => {}),
  failPartialDelivery: vi.fn(async () => {}),
  failUnknownDelivery: vi.fn(async () => {}),
  markDeliveryAttemptStarted: vi.fn(async () => {}),
  withActiveDeliveryClaim: vi.fn<
    (
      entryId: string,
      fn: () => Promise<unknown>,
    ) => Promise<{ status: "claimed"; value: unknown } | { status: "claimed-by-other-owner" }>
  >(async (_entryId, fn) => ({ status: "claimed", value: await fn() })),
}));
const logMocks = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock("../../config/sessions.js", async () => {
  const actual = await vi.importActual<typeof import("../../config/sessions.js")>(
    "../../config/sessions.js",
  );
  return {
    ...actual,
    appendAssistantMessageToSessionTranscript: mocks.appendAssistantMessageToSessionTranscript,
  };
});
vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => hookMocks.runner,
}));
vi.mock("../../hooks/internal-hooks.js", () => ({
  createInternalHookEvent: internalHookMocks.createInternalHookEvent,
  triggerInternalHook: internalHookMocks.triggerInternalHook,
}));
vi.mock("./delivery-queue.js", () => ({
  enqueueDelivery: queueMocks.enqueueDelivery,
  ackDelivery: queueMocks.ackDelivery,
  failDelivery: queueMocks.failDelivery,
  failPartialDelivery: queueMocks.failPartialDelivery,
  failUnknownDelivery: queueMocks.failUnknownDelivery,
  markDeliveryAttemptStarted: queueMocks.markDeliveryAttemptStarted,
  withActiveDeliveryClaim: queueMocks.withActiveDeliveryClaim,
}));
vi.mock("../../logging/subsystem.js", () => ({
  createSubsystemLogger: () => {
    const makeLogger = () => ({
      warn: logMocks.warn,
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(() => makeLogger()),
    });
    return makeLogger();
  },
}));

const { deliverOutboundPayloads, normalizeOutboundPayloads } = await import("./deliver.js");

const telegramChunkConfig: RemoteClawConfig = {
  channels: { telegram: { botToken: "tok-1", textChunkLimit: 2 } },
};

const whatsappChunkConfig: RemoteClawConfig = {
  channels: { whatsapp: { textChunkLimit: 4000 } },
};

/**
 * A 4-character text payload under this config splits into exactly two platform
 * sends, so the first can land and the second fail. That is the mechanism the
 * partial-delivery queue tests depend on — spelled out here once instead of
 * being re-derived from `textChunkLimit: 2` at every use.
 */
const whatsappSplitsIntoTwoChunksConfig: RemoteClawConfig = {
  channels: { whatsapp: { textChunkLimit: 2 } },
};
const TWO_CHUNK_TEXT = "abcd";

type DeliverOutboundArgs = Parameters<typeof deliverOutboundPayloads>[0];
type DeliverOutboundPayload = DeliverOutboundArgs["payloads"][number];
type DeliverSession = DeliverOutboundArgs["session"];

async function deliverWhatsAppPayload(params: {
  sendWhatsApp: NonNullable<
    NonNullable<Parameters<typeof deliverOutboundPayloads>[0]["deps"]>["sendWhatsApp"]
  >;
  payload: { text: string; mediaUrl?: string };
  cfg?: RemoteClawConfig;
}) {
  return deliverOutboundPayloads({
    cfg: params.cfg ?? whatsappChunkConfig,
    channel: "whatsapp",
    to: "+1555",
    payloads: [params.payload],
    deps: { sendWhatsApp: params.sendWhatsApp },
  });
}

async function deliverTelegramPayload(params: {
  sendTelegram: NonNullable<NonNullable<DeliverOutboundArgs["deps"]>["sendTelegram"]>;
  payload: DeliverOutboundPayload;
  cfg?: RemoteClawConfig;
  accountId?: string;
  session?: DeliverSession;
}) {
  return deliverOutboundPayloads({
    cfg: params.cfg ?? telegramChunkConfig,
    channel: "telegram",
    to: "123",
    payloads: [params.payload],
    deps: { sendTelegram: params.sendTelegram },
    ...(params.accountId ? { accountId: params.accountId } : {}),
    ...(params.session ? { session: params.session } : {}),
  });
}

async function runChunkedWhatsAppDelivery(params?: {
  mirror?: Parameters<typeof deliverOutboundPayloads>[0]["mirror"];
}) {
  const sendWhatsApp = vi
    .fn()
    .mockResolvedValueOnce({ messageId: "w1", toJid: "jid" })
    .mockResolvedValueOnce({ messageId: "w2", toJid: "jid" });
  const cfg: RemoteClawConfig = {
    channels: { whatsapp: { textChunkLimit: 2 } },
  };
  const results = await deliverOutboundPayloads({
    cfg,
    channel: "whatsapp",
    to: "+1555",
    payloads: [{ text: "abcd" }],
    deps: { sendWhatsApp },
    ...(params?.mirror ? { mirror: params.mirror } : {}),
  });
  return { sendWhatsApp, results };
}

async function deliverSingleWhatsAppForHookTest(params?: { sessionKey?: string }) {
  const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
  await deliverOutboundPayloads({
    cfg: whatsappChunkConfig,
    channel: "whatsapp",
    to: "+1555",
    payloads: [{ text: "hello" }],
    deps: { sendWhatsApp },
    ...(params?.sessionKey ? { session: { key: params.sessionKey } } : {}),
  });
}

async function runBestEffortPartialFailureDelivery() {
  const sendWhatsApp = vi
    .fn()
    .mockRejectedValueOnce(new Error("fail"))
    .mockResolvedValueOnce({ messageId: "w2", toJid: "jid" });
  const onError = vi.fn();
  const cfg: RemoteClawConfig = {};
  const results = await deliverOutboundPayloads({
    cfg,
    channel: "whatsapp",
    to: "+1555",
    payloads: [{ text: "a" }, { text: "b" }],
    deps: { sendWhatsApp },
    bestEffort: true,
    onError,
  });
  return { sendWhatsApp, onError, results };
}

function expectSuccessfulWhatsAppInternalHookPayload(
  expected: Partial<{
    content: string;
    messageId: string;
    isGroup: boolean;
    groupId: string;
  }>,
) {
  return expect.objectContaining({
    to: "+1555",
    success: true,
    channelId: "whatsapp",
    conversationId: "+1555",
    ...expected,
  });
}

describe("deliverOutboundPayloads", () => {
  beforeEach(() => {
    setActivePluginRegistry(defaultRegistry);
    hookMocks.runner.hasHooks.mockClear();
    hookMocks.runner.hasHooks.mockReturnValue(false);
    hookMocks.runner.runMessageSent.mockClear();
    hookMocks.runner.runMessageSent.mockResolvedValue(undefined);
    internalHookMocks.createInternalHookEvent.mockClear();
    internalHookMocks.createInternalHookEvent.mockImplementation(createInternalHookEventPayload);
    internalHookMocks.triggerInternalHook.mockClear();
    queueMocks.enqueueDelivery.mockClear();
    queueMocks.enqueueDelivery.mockResolvedValue("mock-queue-id");
    queueMocks.ackDelivery.mockClear();
    queueMocks.ackDelivery.mockResolvedValue(undefined);
    queueMocks.failDelivery.mockClear();
    queueMocks.failDelivery.mockResolvedValue(undefined);
    queueMocks.failPartialDelivery.mockClear();
    queueMocks.failPartialDelivery.mockResolvedValue(undefined);
    queueMocks.failUnknownDelivery.mockClear();
    queueMocks.failUnknownDelivery.mockResolvedValue(undefined);
    queueMocks.markDeliveryAttemptStarted.mockClear();
    queueMocks.markDeliveryAttemptStarted.mockResolvedValue(undefined);
    queueMocks.withActiveDeliveryClaim.mockClear();
    queueMocks.withActiveDeliveryClaim.mockImplementation(async (_entryId, fn) => ({
      status: "claimed",
      value: await fn(),
    }));
    logMocks.warn.mockClear();
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });
  it("chunks telegram markdown and passes through accountId", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    await withEnvAsync({ TELEGRAM_BOT_TOKEN: "" }, async () => {
      const results = await deliverOutboundPayloads({
        cfg: telegramChunkConfig,
        channel: "telegram",
        to: "123",
        payloads: [{ text: "abcd" }],
        deps: { sendTelegram },
      });

      expect(sendTelegram).toHaveBeenCalledTimes(2);
      for (const call of sendTelegram.mock.calls) {
        expect(call[2]).toEqual(
          expect.objectContaining({ accountId: undefined, verbose: false, textMode: "html" }),
        );
      }
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ channel: "telegram", chatId: "c1" });
    });
  });

  it("clamps telegram text chunk size to protocol max even with higher config", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    const cfg: RemoteClawConfig = {
      channels: { telegram: { botToken: "tok-1", textChunkLimit: 10_000 } },
    };
    const text = "<".repeat(3_000);
    await withEnvAsync({ TELEGRAM_BOT_TOKEN: "" }, async () => {
      await deliverOutboundPayloads({
        cfg,
        channel: "telegram",
        to: "123",
        payloads: [{ text }],
        deps: { sendTelegram },
      });
    });

    expect(sendTelegram.mock.calls.length).toBeGreaterThan(1);
    const sentHtmlChunks = sendTelegram.mock.calls
      .map((call) => call[1])
      .filter((message): message is string => typeof message === "string");
    expect(sentHtmlChunks.length).toBeGreaterThan(1);
    expect(sentHtmlChunks.every((message) => message.length <= 4096)).toBe(true);
  });

  it("keeps payload replyToId across all chunked telegram sends", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    await withEnvAsync({ TELEGRAM_BOT_TOKEN: "" }, async () => {
      await deliverOutboundPayloads({
        cfg: telegramChunkConfig,
        channel: "telegram",
        to: "123",
        payloads: [{ text: "abcd", replyToId: "777" }],
        deps: { sendTelegram },
      });

      expect(sendTelegram).toHaveBeenCalledTimes(2);
      for (const call of sendTelegram.mock.calls) {
        expect(call[2]).toEqual(expect.objectContaining({ replyToMessageId: 777 }));
      }
    });
  });

  it("passes explicit accountId to sendTelegram", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });

    await deliverTelegramPayload({
      sendTelegram,
      accountId: "default",
      payload: { text: "hi" },
    });

    expect(sendTelegram).toHaveBeenCalledWith(
      "123",
      "hi",
      expect.objectContaining({ accountId: "default", verbose: false, textMode: "html" }),
    );
  });

  it("preserves HTML text for telegram sendPayload channelData path", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });

    await deliverTelegramPayload({
      sendTelegram,
      payload: {
        text: "<b>hello</b>",
        channelData: { telegram: { buttons: [] } },
      },
    });

    expect(sendTelegram).toHaveBeenCalledTimes(1);
    expect(sendTelegram).toHaveBeenCalledWith(
      "123",
      "<b>hello</b>",
      expect.objectContaining({ textMode: "html" }),
    );
  });

  it("does not inject telegram approval buttons from plain approval text", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });

    await deliverTelegramPayload({
      sendTelegram,
      cfg: {
        channels: {
          telegram: {
            botToken: "tok-1",
          },
        },
      },
      payload: {
        text: "Mode: foreground\nRun: /approve 117ba06d allow-once (or allow-always / deny).",
      },
    });

    const sendOpts = sendTelegram.mock.calls[0]?.[2] as { buttons?: unknown } | undefined;
    expect(sendOpts?.buttons).toBeUndefined();
  });

  it("preserves explicit telegram buttons when sender path provides them", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    const cfg: RemoteClawConfig = {
      channels: {
        telegram: {},
      },
    };

    await deliverTelegramPayload({
      sendTelegram,
      cfg,
      payload: {
        text: "Approval required",
        channelData: {
          telegram: {
            buttons: [
              [
                { text: "Allow Once", callback_data: "/approve 117ba06d allow-once" },
                { text: "Allow Always", callback_data: "/approve 117ba06d allow-always" },
              ],
              [{ text: "Deny", callback_data: "/approve 117ba06d deny" }],
            ],
          },
        },
      },
    });

    const sendOpts = sendTelegram.mock.calls[0]?.[2] as { buttons?: unknown } | undefined;
    expect(sendOpts?.buttons).toEqual([
      [
        { text: "Allow Once", callback_data: "/approve 117ba06d allow-once" },
        { text: "Allow Always", callback_data: "/approve 117ba06d allow-always" },
      ],
      [{ text: "Deny", callback_data: "/approve 117ba06d deny" }],
    ]);
  });

  it("scopes media local roots to the active agent workspace when agentId is provided", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });

    await deliverTelegramPayload({
      sendTelegram,
      session: { agentId: "work" },
      payload: { text: "hi", mediaUrl: "file:///tmp/f.png" },
    });

    // RemoteClaw fork: per-agent workspace is only included when explicitly configured
    // (agents.list[].workspace). Without config, only default roots are present.
    expect(sendTelegram).toHaveBeenCalledWith(
      "123",
      "hi",
      expect.objectContaining({
        mediaUrl: "file:///tmp/f.png",
        mediaLocalRoots: expect.arrayContaining([path.join(STATE_DIR, "workspace")]),
      }),
    );
  });

  it("includes RemoteClaw tmp root in telegram mediaLocalRoots", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });

    await deliverTelegramPayload({
      sendTelegram,
      payload: { text: "hi", mediaUrl: "https://example.com/x.png" },
    });

    expect(sendTelegram).toHaveBeenCalledWith(
      "123",
      "hi",
      expect.objectContaining({
        mediaLocalRoots: expect.arrayContaining([resolvePreferredRemoteClawTmpDir()]),
      }),
    );
  });

  it("includes RemoteClaw tmp root in signal mediaLocalRoots", async () => {
    const sendSignal = vi.fn().mockResolvedValue({ messageId: "s1", timestamp: 123 });

    await deliverOutboundPayloads({
      cfg: { channels: { signal: {} } },
      channel: "signal",
      to: "+1555",
      payloads: [{ text: "hi", mediaUrl: "https://example.com/x.png" }],
      deps: { sendSignal },
    });

    expect(sendSignal).toHaveBeenCalledWith(
      "+1555",
      "hi",
      expect.objectContaining({
        mediaLocalRoots: expect.arrayContaining([resolvePreferredRemoteClawTmpDir()]),
      }),
    );
  });

  it("includes RemoteClaw tmp root in whatsapp mediaLocalRoots", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });

    await deliverOutboundPayloads({
      cfg: whatsappChunkConfig,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "hi", mediaUrl: "https://example.com/x.png" }],
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledWith(
      "+1555",
      "hi",
      expect.objectContaining({
        mediaLocalRoots: expect.arrayContaining([resolvePreferredRemoteClawTmpDir()]),
      }),
    );
  });

  it("includes RemoteClaw tmp root in imessage mediaLocalRoots", async () => {
    const sendIMessage = vi.fn().mockResolvedValue({ messageId: "i1", chatId: "chat-1" });

    await deliverOutboundPayloads({
      cfg: {},
      channel: "imessage",
      to: "imessage:+15551234567",
      payloads: [{ text: "hi", mediaUrl: "https://example.com/x.png" }],
      deps: { sendIMessage },
    });

    expect(sendIMessage).toHaveBeenCalledWith(
      "imessage:+15551234567",
      "hi",
      expect.objectContaining({
        mediaLocalRoots: expect.arrayContaining([resolvePreferredRemoteClawTmpDir()]),
      }),
    );
  });

  it("uses signal media maxBytes from config", async () => {
    const sendSignal = vi.fn().mockResolvedValue({ messageId: "s1", timestamp: 123 });
    const cfg: RemoteClawConfig = { channels: { signal: { mediaMaxMb: 2 } } };

    const results = await deliverOutboundPayloads({
      cfg,
      channel: "signal",
      to: "+1555",
      payloads: [{ text: "hi", mediaUrl: "https://x.test/a.jpg" }],
      deps: { sendSignal },
    });

    expect(sendSignal).toHaveBeenCalledWith(
      "+1555",
      "hi",
      expect.objectContaining({
        mediaUrl: "https://x.test/a.jpg",
        maxBytes: 2 * 1024 * 1024,
        textMode: "plain",
        textStyles: [],
      }),
    );
    expect(results[0]).toMatchObject({ channel: "signal", messageId: "s1" });
  });

  it("chunks Signal markdown using the format-first chunker", async () => {
    const sendSignal = vi.fn().mockResolvedValue({ messageId: "s1", timestamp: 123 });
    const cfg: RemoteClawConfig = {
      channels: { signal: { textChunkLimit: 20 } },
    };
    const text = `Intro\\n\\n\`\`\`\`md\\n${"y".repeat(60)}\\n\`\`\`\\n\\nOutro`;
    const expectedChunks = markdownToSignalTextChunks(text, 20);

    await deliverOutboundPayloads({
      cfg,
      channel: "signal",
      to: "+1555",
      payloads: [{ text }],
      deps: { sendSignal },
    });

    expect(sendSignal).toHaveBeenCalledTimes(expectedChunks.length);
    expectedChunks.forEach((chunk, index) => {
      expect(sendSignal).toHaveBeenNthCalledWith(
        index + 1,
        "+1555",
        chunk.text,
        expect.objectContaining({
          accountId: undefined,
          textMode: "plain",
          textStyles: chunk.styles,
        }),
      );
    });
  });

  it("chunks WhatsApp text and returns all results", async () => {
    const { sendWhatsApp, results } = await runChunkedWhatsAppDelivery();

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.messageId)).toEqual(["w1", "w2"]);
  });

  it("respects newline chunk mode for WhatsApp", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    const cfg: RemoteClawConfig = {
      channels: { whatsapp: { textChunkLimit: 4000, chunkMode: "newline" } },
    };

    await deliverOutboundPayloads({
      cfg,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "Line one\n\nLine two" }],
      deps: { sendWhatsApp },
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      1,
      "+1555",
      "Line one",
      expect.objectContaining({ verbose: false }),
    );
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      2,
      "+1555",
      "Line two",
      expect.objectContaining({ verbose: false }),
    );
  });

  it("strips leading blank lines for WhatsApp text payloads", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    await deliverWhatsAppPayload({
      sendWhatsApp,
      payload: { text: "\n\nHello from WhatsApp" },
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      1,
      "+1555",
      "Hello from WhatsApp",
      expect.objectContaining({ verbose: false }),
    );
  });

  it("drops whitespace-only WhatsApp text payloads when no media is attached", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    const results = await deliverWhatsAppPayload({
      sendWhatsApp,
      payload: { text: "   \n\t   " },
    });

    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("drops HTML-only WhatsApp text payloads after sanitization", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    const results = await deliverWhatsAppPayload({
      sendWhatsApp,
      payload: { text: "<br><br>" },
    });

    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("keeps WhatsApp media payloads but clears whitespace-only captions", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    await deliverWhatsAppPayload({
      sendWhatsApp,
      payload: { text: " \n\t ", mediaUrl: "https://example.com/photo.png" },
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(sendWhatsApp).toHaveBeenNthCalledWith(
      1,
      "+1555",
      "",
      expect.objectContaining({
        mediaUrl: "https://example.com/photo.png",
        verbose: false,
      }),
    );
  });

  it("drops non-WhatsApp HTML-only text payloads after sanitization", async () => {
    const sendSignal = vi.fn().mockResolvedValue({ messageId: "s1", toJid: "jid" });
    const results = await deliverOutboundPayloads({
      cfg: {},
      channel: "signal",
      to: "+1555",
      payloads: [{ text: "<br>" }],
      deps: { sendSignal },
    });

    expect(sendSignal).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("preserves fenced blocks for markdown chunkers in newline mode", async () => {
    const chunker = vi.fn((text: string) => (text ? [text] : []));
    const sendText = vi.fn().mockImplementation(async ({ text }: { text: string }) => ({
      channel: "matrix" as const,
      messageId: text,
      roomId: "r1",
    }));
    const sendMedia = vi.fn().mockImplementation(async ({ text }: { text: string }) => ({
      channel: "matrix" as const,
      messageId: text,
      roomId: "r1",
    }));
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: {
              deliveryMode: "direct",
              chunker,
              chunkerMode: "markdown",
              textChunkLimit: 4000,
              sendText,
              sendMedia,
            },
          }),
        },
      ]),
    );

    const cfg: RemoteClawConfig = {
      channels: { matrix: { textChunkLimit: 4000, chunkMode: "newline" } },
    };
    const text = "```js\nconst a = 1;\nconst b = 2;\n```\nAfter";

    await deliverOutboundPayloads({
      cfg,
      channel: "matrix",
      to: "!room",
      payloads: [{ text }],
    });

    expect(chunker).toHaveBeenCalledTimes(1);
    expect(chunker).toHaveBeenNthCalledWith(1, text, 4000);
  });

  it("uses iMessage media maxBytes from agent fallback", async () => {
    const sendIMessage = vi.fn().mockResolvedValue({ messageId: "i1" });
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "imessage",
          source: "test",
          plugin: createIMessageTestPlugin(),
        },
      ]),
    );
    const cfg: RemoteClawConfig = {
      agents: { defaults: { mediaMaxMb: 3 } },
    };

    await deliverOutboundPayloads({
      cfg,
      channel: "imessage",
      to: "chat_id:42",
      payloads: [{ text: "hello" }],
      deps: { sendIMessage },
    });

    expect(sendIMessage).toHaveBeenCalledWith(
      "chat_id:42",
      "hello",
      expect.objectContaining({ maxBytes: 3 * 1024 * 1024 }),
    );
  });

  it("normalizes payloads and drops empty entries", () => {
    const normalized = normalizeOutboundPayloads([
      { text: "hi" },
      { text: "MEDIA:https://x.test/a.jpg" },
      { text: " ", mediaUrls: [] },
    ]);
    expect(normalized).toEqual([
      { text: "hi", mediaUrls: [] },
      { text: "", mediaUrls: ["https://x.test/a.jpg"] },
    ]);
  });

  it("continues on errors when bestEffort is enabled", async () => {
    const { sendWhatsApp, onError, results } = await runBestEffortPartialFailureDelivery();

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ channel: "whatsapp", messageId: "w2", toJid: "jid" }]);
  });

  it("emits internal message:sent hook with success=true for chunked payload delivery", async () => {
    const { sendWhatsApp } = await runChunkedWhatsAppDelivery({
      mirror: {
        sessionKey: "agent:main:main",
        isGroup: true,
        groupId: "whatsapp:group:123",
      },
    });
    expect(sendWhatsApp).toHaveBeenCalledTimes(2);

    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledTimes(1);
    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledWith(
      "message",
      "sent",
      "agent:main:main",
      expectSuccessfulWhatsAppInternalHookPayload({
        content: "abcd",
        messageId: "w2",
        isGroup: true,
        groupId: "whatsapp:group:123",
      }),
    );
    expect(internalHookMocks.triggerInternalHook).toHaveBeenCalledTimes(1);
  });

  it("does not emit internal message:sent hook when neither mirror nor sessionKey is provided", async () => {
    await deliverSingleWhatsAppForHookTest();

    expect(internalHookMocks.createInternalHookEvent).not.toHaveBeenCalled();
    expect(internalHookMocks.triggerInternalHook).not.toHaveBeenCalled();
  });

  it("emits internal message:sent hook when sessionKey is provided without mirror", async () => {
    await deliverSingleWhatsAppForHookTest({ sessionKey: "agent:main:main" });

    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledTimes(1);
    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledWith(
      "message",
      "sent",
      "agent:main:main",
      expectSuccessfulWhatsAppInternalHookPayload({ content: "hello", messageId: "w1" }),
    );
    expect(internalHookMocks.triggerInternalHook).toHaveBeenCalledTimes(1);
  });

  it("warns when session.agentId is set without a session key", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    hookMocks.runner.hasHooks.mockReturnValue(true);

    await deliverOutboundPayloads({
      cfg: whatsappChunkConfig,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "hello" }],
      deps: { sendWhatsApp },
      session: { agentId: "agent-main" },
    });

    expect(logMocks.warn).toHaveBeenCalledWith(
      "deliverOutboundPayloads: session.agentId present without session key; internal message:sent hook will be skipped",
      expect.objectContaining({ channel: "whatsapp", to: "+1555", agentId: "agent-main" }),
    );
  });

  it("records a bestEffort partial failure as an unknown outcome, not a plain failure", async () => {
    const { onError } = await runBestEffortPartialFailureDelivery();

    // onError was called for the first payload's failure.
    expect(onError).toHaveBeenCalledTimes(1);

    // Some payloads landed, so the entry must be neither acked nor marked
    // plainly-failed: a plain failure is replayed whole, re-sending what
    // already arrived. failPartialDelivery keeps it for reconciliation.
    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    // The landed count is passed through: it is the only record of how far the
    // send got, and the operator opening the quarantined entry has no other way
    // to tell which part arrived. The cause travels with it — "partial delivery
    // failure" alone says nothing about why.
    expect(queueMocks.failPartialDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("partial delivery failure (bestEffort):"),
      undefined,
      1,
    );
  });

  it("records a bestEffort failure where NOTHING landed as an unknown outcome", async () => {
    // "onError fired" is not "nothing landed" either: `network blip` reached the
    // transport and told us nothing about what the platform did with it. It is
    // recorded as an unknown outcome — NOT as a partial delivery (no landed
    // count is known) and NOT as a plain replayable failure (#3051 item 1).
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("network blip"));
    const onError = vi.fn();

    const results = await deliverOutboundPayloads({
      cfg: {},
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "a" }],
      deps: { sendWhatsApp },
      bestEffort: true,
      onError,
    });

    expect(results).toEqual([]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(queueMocks.failPartialDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("network blip"),
    );
    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
  });

  it("classifies a bestEffort failure from the error OBJECT, not just its message", async () => {
    // The bestEffort path only kept `describeDeliveryError(err)` — a string, with
    // the errno already thrown away. A refused connection reported through
    // onError has to stay replayable, so the raw error has to survive to the
    // classifier.
    const refused = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const sendWhatsApp = vi.fn().mockRejectedValue(refused);

    await deliverOutboundPayloads({
      cfg: {},
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "a" }],
      deps: { sendWhatsApp },
      bestEffort: true,
    });

    expect(queueMocks.failUnknownDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).toHaveBeenCalledWith("mock-queue-id", expect.any(String));
  });

  it("records a bestEffort failure even when the caller supplies no onError", async () => {
    // Whether a send failed is a property of the send, not of the caller's
    // callback wiring. Gating partial-failure detection on `params.onError`
    // acked an entry whose payloads all failed, silently dropping the message —
    // and several bestEffort callers pass no onError at all
    // (server-node-events, server-restart-sentinel, the message command).
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("network blip"));

    const results = await deliverOutboundPayloads({
      cfg: {},
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "a" }],
      deps: { sendWhatsApp },
      bestEffort: true,
    });

    expect(results).toEqual([]);
    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.any(String),
    );
  });

  it("still forwards to a caller-supplied onError while tracking the failure itself", async () => {
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("network blip"));
    const onError = vi.fn();

    await deliverOutboundPayloads({
      cfg: {},
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "a" }],
      deps: { sendWhatsApp },
      bestEffort: true,
      onError,
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(Error), expect.anything());
  });

  it("tells a bestEffort onError caller whether the payload reached the transport (#3063)", async () => {
    // bestEffort resolves, so the annotated throw below never fires and a caller
    // that re-classifies the failure — the queue's recovery pass does, to choose
    // between replaying and quarantining — has only this channel. Without it
    // every reported failure reads as "no send was ever made" and gets replayed.
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("socket hang up"));
    const onError = vi.fn();

    await deliverOutboundPayloads({
      cfg: {},
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "a" }],
      deps: { sendWhatsApp },
      bestEffort: true,
      onError,
    });

    expect(readPlatformSendAttempted(onError.mock.calls[0]?.[0])).toBe(true);
  });

  it("annotates the rethrown error with how many payloads landed", async () => {
    // Crash recovery calls this function with skipQueue set, so it does its own
    // queue bookkeeping and the error is its only channel for "how far did the
    // send get" — the difference between replaying whole and quarantining.
    const sendWhatsApp = vi
      .fn()
      .mockResolvedValueOnce({ messageId: "w1", toJid: "jid" })
      .mockRejectedValueOnce(new Error("rate limited"));

    const err = await deliverOutboundPayloads({
      cfg: whatsappSplitsIntoTwoChunksConfig,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: TWO_CHUNK_TEXT }],
      deps: { sendWhatsApp },
      skipQueue: true,
    }).catch((e: unknown) => e);

    expect(readDeliveredBeforeFailure(err)).toBe(1);
  });

  it("annotates a total failure with a landed count of zero", async () => {
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("rate limited"));

    const err = await deliverOutboundPayloads({
      cfg: whatsappSplitsIntoTwoChunksConfig,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: TWO_CHUNK_TEXT }],
      deps: { sendWhatsApp },
      skipQueue: true,
    }).catch((e: unknown) => e);

    expect(readDeliveredBeforeFailure(err)).toBe(0);
  });

  it("annotates the rethrown error with whether a platform send was attempted", async () => {
    // The landed count alone is not enough for the catcher: a zero count is what
    // BOTH a pre-send throw and a post-transmission timeout look like, and those
    // have opposite dispositions. Recovery re-runs `didSendDefinitelyNotLand`
    // over this flag, so an unannotated throw makes it replay an ambiguous send
    // (#3061).
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("socket hang up"));

    const err = await deliverOutboundPayloads({
      cfg: {},
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "a" }],
      deps: { sendWhatsApp },
      skipQueue: true,
    }).catch((e: unknown) => e);

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(readDeliveredBeforeFailure(err)).toBe(0);
    expect(readPlatformSendAttempted(err)).toBe(true);
  });

  it("annotates a failure raised before any send as send-not-attempted", async () => {
    // The other half of the same contract, and the reason the recovery path can
    // keep retrying: a media payload on an adapter with no sendMedia and no text
    // fallback throws before the transport is touched. Reported as `true`, every
    // pre-send validation error would become manual reconciliation work.
    const sendText = vi.fn();
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendText },
          }),
        },
      ]),
    );

    const err = await deliverOutboundPayloads({
      cfg: {},
      channel: "matrix",
      to: "!room:1",
      payloads: [{ text: "   ", mediaUrl: "https://example.com/file.png" }],
      skipQueue: true,
    }).catch((e: unknown) => e);

    expect(sendText).not.toHaveBeenCalled();
    expect(readDeliveredBeforeFailure(err)).toBe(0);
    expect(readPlatformSendAttempted(err)).toBe(false);
  });

  it("records a mid-chunk failure as an unknown outcome — earlier chunks already landed", async () => {
    // The default (non-bestEffort) path: chunk 1 reaches the wire, chunk 2
    // throws. Replaying the whole entry re-sends chunk 1 to the recipient.
    const sendWhatsApp = vi
      .fn()
      .mockResolvedValueOnce({ messageId: "w1", toJid: "jid" })
      .mockRejectedValueOnce(new Error("rate limited"));

    await expect(
      deliverOutboundPayloads({
        cfg: whatsappSplitsIntoTwoChunksConfig,
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: TWO_CHUNK_TEXT }],
        deps: { sendWhatsApp },
      }),
    ).rejects.toThrow("rate limited");

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failPartialDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("rate limited"),
      undefined,
      1,
    );
  });

  it("records a first-chunk failure as an unknown outcome, not a replayable one", async () => {
    // Nothing was OBSERVED to land, which is weaker than "nothing landed": the
    // request reached the transport and the platform's answer never came back.
    // Replaying it is how the recipient gets the message twice, so it is
    // surfaced for review instead (#3051 item 1).
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("rate limited"));

    await expect(
      deliverOutboundPayloads({
        cfg: whatsappSplitsIntoTwoChunksConfig,
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: TWO_CHUNK_TEXT }],
        deps: { sendWhatsApp },
      }),
    ).rejects.toThrow("rate limited");

    expect(queueMocks.failPartialDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("rate limited"),
    );
  });

  it("keeps a refused connection on the normal retry path", async () => {
    // The connection was never established, so no byte of the request was
    // written and a replay cannot duplicate. Quarantining this would put routine
    // transient outages into the operator's manual-reconciliation queue.
    const sendWhatsApp = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:443"), { code: "ECONNREFUSED" }),
      );

    await expect(
      deliverOutboundPayloads({
        cfg: whatsappSplitsIntoTwoChunksConfig,
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: TWO_CHUNK_TEXT }],
        deps: { sendWhatsApp },
      }),
    ).rejects.toThrow("ECONNREFUSED");

    expect(queueMocks.failUnknownDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("ECONNREFUSED"),
    );
  });

  it("keeps a platform rejection on the normal retry path", async () => {
    // "chat not found" is the platform telling us it did not accept the message.
    // That is a guaranteed non-delivery, not an ambiguity — routing it to
    // needs-review would bury it among the genuinely undetermined entries and
    // skip the failed/ disposition recovery already gives it.
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("Bad Request: chat not found"));

    await expect(
      deliverOutboundPayloads({
        cfg: whatsappSplitsIntoTwoChunksConfig,
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: TWO_CHUNK_TEXT }],
        deps: { sendWhatsApp },
      }),
    ).rejects.toThrow("chat not found");

    expect(queueMocks.failUnknownDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("chat not found"),
    );
  });

  // The send-attempt flag is what separates "never left the process" (replay) from
  // "may have landed" (quarantine), and it is recorded in ONE helper that every
  // platform send must go through. Only asserting it for handler.sendText leaves
  // the other three families protected by a comment: they can each be unwrapped
  // with the suite fully green, and the failure mode is silent duplicate
  // delivery. One test per family, so a dropped wrapper is caught by CI.
  it("quarantines an ambiguous handler.sendMedia failure", async () => {
    const sendText = vi.fn();
    const sendMedia = vi.fn().mockRejectedValue(new Error("upload stalled"));
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendText, sendMedia },
          }),
        },
      ]),
    );

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "matrix",
        to: "!room:1",
        payloads: [{ text: "caption", mediaUrl: "https://example.com/a.png" }],
      }),
    ).rejects.toThrow("upload stalled");

    expect(sendMedia).toHaveBeenCalledTimes(1);
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("upload stalled"),
    );
  });

  it("quarantines an ambiguous handler.sendPayload failure", async () => {
    const sendText = vi.fn();
    const sendPayload = vi.fn().mockRejectedValue(new Error("gateway timeout"));
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendText, sendPayload },
          }),
        },
      ]),
    );

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "matrix",
        to: "!room:1",
        payloads: [{ text: "hi", channelData: { matrix: { kind: "custom" } } }],
      }),
    ).rejects.toThrow("gateway timeout");

    expect(sendPayload).toHaveBeenCalledTimes(1);
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("gateway timeout"),
    );
  });

  it("quarantines an ambiguous signal text-send failure", async () => {
    const sendSignal = vi.fn().mockRejectedValue(new Error("socket hang up"));

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "signal",
        to: "+1555",
        payloads: [{ text: "hi" }],
        deps: { sendSignal },
      }),
    ).rejects.toThrow("socket hang up");

    expect(sendSignal).toHaveBeenCalledTimes(1);
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("socket hang up"),
    );
  });

  it("quarantines an ambiguous signal media-send failure", async () => {
    const sendSignal = vi.fn().mockRejectedValue(new Error("socket hang up"));

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "signal",
        to: "+1555",
        payloads: [{ text: "caption", mediaUrl: "https://example.com/a.png" }],
        deps: { sendSignal },
      }),
    ).rejects.toThrow("socket hang up");

    expect(sendSignal).toHaveBeenCalledTimes(1);
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.stringContaining("socket hang up"),
    );
  });

  it("quarantines when ANY bestEffort payload failed ambiguously", async () => {
    // Classifying from the first error alone lets a clean ECONNREFUSED on
    // payload 1 mask an ambiguous post-transmission failure on payload 2 —
    // clearing the marker and replaying the payload that may have arrived.
    const sendWhatsApp = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
      )
      .mockRejectedValueOnce(new Error("socket hang up"));

    await deliverOutboundPayloads({
      cfg: {},
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "a" }, { text: "b" }],
      deps: { sendWhatsApp },
      bestEffort: true,
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.any(String),
    );
  });

  it("keeps a failure raised before any send on the normal retry path", async () => {
    // A media payload on an adapter with no sendMedia and no text fallback
    // throws before the transport is touched. Nothing was attempted, so nothing
    // can have landed — this must stay replayable, or every pre-send validation
    // error would land in the operator's reconciliation queue.
    const sendText = vi.fn();
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendText },
          }),
        },
      ]),
    );

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "matrix",
        to: "!room:1",
        payloads: [{ text: "   ", mediaUrl: "https://example.com/file.png" }],
      }),
    ).rejects.toThrow("no text fallback is available");

    expect(sendText).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).toHaveBeenCalledWith("mock-queue-id", expect.any(String));
  });

  it("reports a pre-send failure to a bestEffort onError caller as not attempted (#3063)", async () => {
    // The other half of the annotation the recovery pass reads. The same
    // pre-send failure as the test above, reported instead of thrown: the flag
    // has to say false rather than simply be absent, or a caller cannot tell
    // "the send never started" (replayable) from "the sender said nothing".
    const sendText = vi.fn();
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendText },
          }),
        },
      ]),
    );
    const onError = vi.fn();

    await deliverOutboundPayloads({
      cfg: {},
      channel: "matrix",
      to: "!room:1",
      payloads: [{ text: "   ", mediaUrl: "https://example.com/file.png" }],
      bestEffort: true,
      onError,
    });

    expect(sendText).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(readPlatformSendAttempted(onError.mock.calls[0]?.[0])).toBe(false);
  });

  it("acks the queue entry when delivery is aborted", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    const abortController = new AbortController();
    abortController.abort();
    const cfg: RemoteClawConfig = {};

    await expect(
      deliverOutboundPayloads({
        cfg,
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: "a" }],
        deps: { sendWhatsApp },
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow("Operation aborted");

    expect(queueMocks.ackDelivery).toHaveBeenCalledWith("mock-queue-id");
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
  });

  it("does NOT ack an abort that landed part of the message", async () => {
    // Acking discards the entry outright — no retry, no failed/, no
    // needs-review. A cancellation that already put chunk 1 on the recipient's
    // device is not a clean discard: erasing it loses the only record that a
    // partial message went out.
    const abortController = new AbortController();
    const sendWhatsApp = vi.fn(async () => {
      abortController.abort();
      return { messageId: "w1", toJid: "jid" };
    });

    await expect(
      deliverOutboundPayloads({
        cfg: whatsappSplitsIntoTwoChunksConfig,
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: TWO_CHUNK_TEXT }],
        deps: { sendWhatsApp },
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow("Operation aborted");

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failPartialDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.any(String),
      undefined,
      1,
    );
  });

  it("quarantines a transport error that merely calls itself AbortError", async () => {
    // `isAbortError` is name-based. A client-side request timeout that aborts
    // its own controller surfaces a DOMException named "AbortError" without the
    // CALLER ever cancelling — BlueBubbles' fetch timeout does exactly this.
    // That is an unknown send outcome (the server may have delivered it), not a
    // cancellation: acking it would silently drop the message, and recording it
    // as a plain failure would clear the marker and replay a message that may
    // already be on the recipient's device (#3051 item 1).
    const sendWhatsApp = vi
      .fn()
      .mockRejectedValue(new DOMException("This operation was aborted", "AbortError"));

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: "a" }],
        deps: { sendWhatsApp },
      }),
    ).rejects.toThrow("aborted");

    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failUnknownDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.any(String),
    );
  });

  it("still acks a caller-cancelled abort raised before any send", async () => {
    // The one clean discard: the CALLER's own signal is aborted and no send was
    // ever entered. Widening the ambiguity rule must not swallow this case —
    // acking here is what keeps a cancelled reply out of needs-review.
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });
    const abortController = new AbortController();
    abortController.abort();

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: "a" }],
        deps: { sendWhatsApp },
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow("Operation aborted");

    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(queueMocks.ackDelivery).toHaveBeenCalledWith("mock-queue-id");
    expect(queueMocks.failUnknownDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
  });

  it("marks the queue entry as send-in-flight before the platform send", async () => {
    const order: string[] = [];
    queueMocks.markDeliveryAttemptStarted.mockImplementation(async () => {
      order.push("mark");
    });
    const sendWhatsApp = vi.fn(async () => {
      order.push("send");
      return { messageId: "w1", toJid: "jid" };
    });

    await deliverWhatsAppPayload({ sendWhatsApp, payload: { text: "hi" } });

    // Ordering is the whole point: a marker written after the send would leave
    // the crash window open for a duplicate replay.
    expect(order).toEqual(["mark", "send"]);
    expect(queueMocks.markDeliveryAttemptStarted).toHaveBeenCalledWith("mock-queue-id");
    expect(queueMocks.withActiveDeliveryClaim).toHaveBeenCalledWith(
      "mock-queue-id",
      expect.any(Function),
    );
  });

  it("delivers anyway when the send-in-flight marker cannot be written, but warns", async () => {
    queueMocks.markDeliveryAttemptStarted.mockRejectedValue(new Error("disk full"));
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });

    const results = await deliverWhatsAppPayload({ sendWhatsApp, payload: { text: "hi" } });

    expect(results).toHaveLength(1);
    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(queueMocks.ackDelivery).toHaveBeenCalledWith("mock-queue-id");
    // Silently disarming duplicate suppression is worse than the duplicate:
    // the operator has to be able to see that the guard is off.
    expect(logMocks.warn).toHaveBeenCalledWith(
      expect.stringContaining("could not record the send-in-flight marker"),
      expect.objectContaining({ channel: "whatsapp", queueId: "mock-queue-id" }),
    );
  });

  it("fails loudly rather than reporting success when the entry is claimed elsewhere", async () => {
    queueMocks.withActiveDeliveryClaim.mockResolvedValue({ status: "claimed-by-other-owner" });
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });

    // Returning [] here would read as a successful send to the several call sites
    // that ignore the result array.
    await expect(deliverWhatsAppPayload({ sendWhatsApp, payload: { text: "hi" } })).rejects.toThrow(
      "already owned by another delivery worker",
    );

    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
  });

  it("does not enqueue, claim, or mark when skipQueue is set (recovery replay)", async () => {
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });

    const results = await deliverOutboundPayloads({
      cfg: whatsappChunkConfig,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "hi" }],
      deps: { sendWhatsApp },
      skipQueue: true,
    });

    expect(results).toHaveLength(1);
    expect(queueMocks.enqueueDelivery).not.toHaveBeenCalled();
    expect(queueMocks.withActiveDeliveryClaim).not.toHaveBeenCalled();
    expect(queueMocks.markDeliveryAttemptStarted).not.toHaveBeenCalled();
    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
  });

  it("passes normalized payload to onError", async () => {
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    const cfg: RemoteClawConfig = {};

    await deliverOutboundPayloads({
      cfg,
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "hi", mediaUrl: "https://x.test/a.jpg" }],
      deps: { sendWhatsApp },
      bestEffort: true,
      onError,
    });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ text: "hi", mediaUrls: ["https://x.test/a.jpg"] }),
    );
  });

  it("mirrors delivered output when mirror options are provided", async () => {
    const sendTelegram = vi.fn().mockResolvedValue({ messageId: "m1", chatId: "c1" });
    mocks.appendAssistantMessageToSessionTranscript.mockClear();

    await deliverOutboundPayloads({
      cfg: telegramChunkConfig,
      channel: "telegram",
      to: "123",
      payloads: [{ text: "caption", mediaUrl: "https://example.com/files/report.pdf?sig=1" }],
      deps: { sendTelegram },
      mirror: {
        sessionKey: "agent:main:main",
        text: "caption",
        mediaUrls: ["https://example.com/files/report.pdf?sig=1"],
      },
    });

    expect(mocks.appendAssistantMessageToSessionTranscript).toHaveBeenCalledWith(
      expect.objectContaining({ text: "report.pdf" }),
    );
  });

  it("emits message_sent success for text-only deliveries", async () => {
    hookMocks.runner.hasHooks.mockReturnValue(true);
    const sendWhatsApp = vi.fn().mockResolvedValue({ messageId: "w1", toJid: "jid" });

    await deliverOutboundPayloads({
      cfg: {},
      channel: "whatsapp",
      to: "+1555",
      payloads: [{ text: "hello" }],
      deps: { sendWhatsApp },
    });

    expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
      expect.objectContaining({ to: "+1555", content: "hello", success: true }),
      expect.objectContaining({ channelId: "whatsapp" }),
    );
  });

  it("emits message_sent success for sendPayload deliveries", async () => {
    hookMocks.runner.hasHooks.mockReturnValue(true);
    const sendPayload = vi.fn().mockResolvedValue({ channel: "matrix", messageId: "mx-1" });
    const sendText = vi.fn();
    const sendMedia = vi.fn();
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendPayload, sendText, sendMedia },
          }),
        },
      ]),
    );

    await deliverOutboundPayloads({
      cfg: {},
      channel: "matrix",
      to: "!room:1",
      payloads: [{ text: "payload text", channelData: { mode: "custom" } }],
    });

    expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
      expect.objectContaining({ to: "!room:1", content: "payload text", success: true }),
      expect.objectContaining({ channelId: "matrix" }),
    );
  });

  it("preserves channelData-only payloads with empty text for non-WhatsApp sendPayload channels", async () => {
    const sendPayload = vi.fn().mockResolvedValue({ channel: "line", messageId: "ln-1" });
    const sendText = vi.fn();
    const sendMedia = vi.fn();
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "line",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "line",
            outbound: { deliveryMode: "direct", sendPayload, sendText, sendMedia },
          }),
        },
      ]),
    );

    const results = await deliverOutboundPayloads({
      cfg: {},
      channel: "line",
      to: "U123",
      payloads: [{ text: " \n\t ", channelData: { mode: "flex" } }],
    });

    expect(sendPayload).toHaveBeenCalledTimes(1);
    expect(sendPayload).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ text: "", channelData: { mode: "flex" } }),
      }),
    );
    expect(results).toEqual([{ channel: "line", messageId: "ln-1" }]);
  });

  it("falls back to sendText when plugin outbound omits sendMedia", async () => {
    const sendText = vi.fn().mockResolvedValue({ channel: "matrix", messageId: "mx-1" });
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendText },
          }),
        },
      ]),
    );

    const results = await deliverOutboundPayloads({
      cfg: {},
      channel: "matrix",
      to: "!room:1",
      payloads: [{ text: "caption", mediaUrl: "https://example.com/file.png" }],
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "caption",
      }),
    );
    expect(logMocks.warn).toHaveBeenCalledWith(
      "Plugin outbound adapter does not implement sendMedia; media URLs will be dropped and text fallback will be used",
      expect.objectContaining({
        channel: "matrix",
        mediaCount: 1,
      }),
    );
    expect(results).toEqual([{ channel: "matrix", messageId: "mx-1" }]);
  });

  it("falls back to one sendText call for multi-media payloads when sendMedia is omitted", async () => {
    const sendText = vi.fn().mockResolvedValue({ channel: "matrix", messageId: "mx-2" });
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendText },
          }),
        },
      ]),
    );

    const results = await deliverOutboundPayloads({
      cfg: {},
      channel: "matrix",
      to: "!room:1",
      payloads: [
        {
          text: "caption",
          mediaUrls: ["https://example.com/a.png", "https://example.com/b.png"],
        },
      ],
    });

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "caption",
      }),
    );
    expect(logMocks.warn).toHaveBeenCalledWith(
      "Plugin outbound adapter does not implement sendMedia; media URLs will be dropped and text fallback will be used",
      expect.objectContaining({
        channel: "matrix",
        mediaCount: 2,
      }),
    );
    expect(results).toEqual([{ channel: "matrix", messageId: "mx-2" }]);
  });

  it("fails media-only payloads when plugin outbound omits sendMedia", async () => {
    hookMocks.runner.hasHooks.mockReturnValue(true);
    const sendText = vi.fn().mockResolvedValue({ channel: "matrix", messageId: "mx-3" });
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({
            id: "matrix",
            outbound: { deliveryMode: "direct", sendText },
          }),
        },
      ]),
    );

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "matrix",
        to: "!room:1",
        payloads: [{ text: "   ", mediaUrl: "https://example.com/file.png" }],
      }),
    ).rejects.toThrow(
      "Plugin outbound adapter does not implement sendMedia and no text fallback is available for media payload",
    );

    expect(sendText).not.toHaveBeenCalled();
    expect(logMocks.warn).toHaveBeenCalledWith(
      "Plugin outbound adapter does not implement sendMedia; media URLs will be dropped and text fallback will be used",
      expect.objectContaining({
        channel: "matrix",
        mediaCount: 1,
      }),
    );
    expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "!room:1",
        content: "",
        success: false,
        error:
          "Plugin outbound adapter does not implement sendMedia and no text fallback is available for media payload",
      }),
      expect.objectContaining({ channelId: "matrix" }),
    );
  });

  it("emits message_sent failure when delivery errors", async () => {
    hookMocks.runner.hasHooks.mockReturnValue(true);
    const sendWhatsApp = vi.fn().mockRejectedValue(new Error("downstream failed"));

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "whatsapp",
        to: "+1555",
        payloads: [{ text: "hi" }],
        deps: { sendWhatsApp },
      }),
    ).rejects.toThrow("downstream failed");

    expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "+1555",
        content: "hi",
        success: false,
        error: "downstream failed",
      }),
      expect.objectContaining({ channelId: "whatsapp" }),
    );
  });
});

const emptyRegistry = createTestRegistry([]);
const defaultRegistry = createTestRegistry([
  {
    pluginId: "telegram",
    plugin: createOutboundTestPlugin({ id: "telegram", outbound: telegramOutbound }),
    source: "test",
  },
  {
    pluginId: "signal",
    plugin: createOutboundTestPlugin({ id: "signal", outbound: signalOutbound }),
    source: "test",
  },
  {
    pluginId: "whatsapp",
    plugin: createOutboundTestPlugin({ id: "whatsapp", outbound: whatsappOutbound }),
    source: "test",
  },
  {
    pluginId: "imessage",
    plugin: createIMessageTestPlugin(),
    source: "test",
  },
]);
