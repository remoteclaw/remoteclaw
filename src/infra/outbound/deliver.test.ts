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

const matrixChunkConfig: RemoteClawConfig = {
  channels: { matrix: { textChunkLimit: 4000 } } as RemoteClawConfig["channels"],
};

type DeliverOutboundArgs = Parameters<typeof deliverOutboundPayloads>[0];
type DeliverOutboundPayload = DeliverOutboundArgs["payloads"][number];
type DeliverSession = DeliverOutboundArgs["session"];
type MatrixSendFn = (
  to: string,
  text: string,
  options?: Record<string, unknown>,
) => Promise<{ messageId: string } & Record<string, unknown>>;

function resolveMatrixSender(deps: DeliverOutboundArgs["deps"]): MatrixSendFn {
  const sender = deps?.matrix;
  if (typeof sender !== "function") {
    throw new Error("missing matrix sender");
  }
  return sender as MatrixSendFn;
}

function withMatrixChannel(result: Awaited<ReturnType<MatrixSendFn>>) {
  return {
    channel: "matrix" as const,
    ...result,
  };
}

const matrixOutboundForTest: ChannelOutboundAdapter = {
  deliveryMode: "direct",
  chunker: chunkText,
  chunkerMode: "text",
  textChunkLimit: 4000,
  sanitizeText: ({ text }) => (text === "<br>" || text === "<br><br>" ? "" : text),
  sendText: async ({ cfg, to, text, accountId, deps, gifPlayback }) =>
    withMatrixChannel(
      await resolveMatrixSender(deps)(to, text, {
        cfg,
        accountId: accountId ?? undefined,
        gifPlayback,
      }),
    ),
  sendMedia: async ({
    cfg,
    to,
    text,
    mediaUrl,
    mediaLocalRoots,
    mediaReadFile,
    accountId,
    deps,
    gifPlayback,
  }) =>
    withMatrixChannel(
      await resolveMatrixSender(deps)(to, text, {
        cfg,
        mediaUrl,
        mediaLocalRoots,
        mediaReadFile,
        accountId: accountId ?? undefined,
        gifPlayback,
      }),
    ),
};

async function deliverWhatsAppPayload(params: {
  sendWhatsApp: NonNullable<
    NonNullable<Parameters<typeof deliverOutboundPayloads>[0]["deps"]>["sendWhatsApp"]
  >;
  payload: { text: string; mediaUrl?: string };
  cfg?: RemoteClawConfig;
}) {
  return deliverOutboundPayloads({
    cfg: params.cfg ?? matrixChunkConfig,
    channel: "matrix",
    to: "!room:example",
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

async function runChunkedMatrixDelivery(params?: {
  mirror?: Parameters<typeof deliverOutboundPayloads>[0]["mirror"];
}) {
  const sendMatrix = vi
    .fn()
    .mockResolvedValueOnce({ messageId: "m1", roomId: "!room:example" })
    .mockResolvedValueOnce({ messageId: "m2", roomId: "!room:example" });
  const cfg: RemoteClawConfig = {
    channels: { matrix: { textChunkLimit: 2 } } as RemoteClawConfig["channels"],
  };
  const results = await deliverOutboundPayloads({
    cfg,
    channel: "matrix",
    to: "!room:example",
    payloads: [{ text: "abcd" }],
    deps: { sendWhatsApp },
    ...(params?.mirror ? { mirror: params.mirror } : {}),
  });
  return { sendMatrix, results };
}

async function deliverSingleMatrixForHookTest(params?: { sessionKey?: string }) {
  const sendMatrix = vi.fn().mockResolvedValue({ messageId: "m1", roomId: "!room:example" });
  await deliverOutboundPayloads({
    cfg: matrixChunkConfig,
    channel: "matrix",
    to: "!room:example",
    payloads: [{ text: "hello" }],
    deps: { sendWhatsApp },
    ...(params?.sessionKey ? { session: { key: params.sessionKey } } : {}),
  });
}

async function runBestEffortPartialFailureDelivery() {
  const sendMatrix = vi
    .fn()
    .mockRejectedValueOnce(new Error("fail"))
    .mockResolvedValueOnce({ messageId: "m2", roomId: "!room:example" });
  const onError = vi.fn();
  const cfg: RemoteClawConfig = {};
  const results = await deliverOutboundPayloads({
    cfg,
    channel: "matrix",
    to: "!room:example",
    payloads: [{ text: "a" }, { text: "b" }],
    deps: { sendWhatsApp },
    bestEffort: true,
    onError,
  });
  return { sendMatrix, onError, results };
}

function expectSuccessfulMatrixInternalHookPayload(
  expected: Partial<{
    content: string;
    messageId: string;
    isGroup: boolean;
    groupId: string;
  }>,
) {
  return expect.objectContaining({
    to: "!room:example",
    success: true,
    channelId: "matrix",
    conversationId: "!room:example",
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

  it("includes RemoteClaw tmp root in plugin mediaLocalRoots", async () => {
    const sendMatrix = vi.fn().mockResolvedValue({ messageId: "m-media", roomId: "!room" });

    await deliverOutboundPayloads({
      cfg: { channels: { matrix: {} } } as RemoteClawConfig,
      channel: "matrix",
      to: "!room:example",
      payloads: [{ text: "hi", mediaUrl: "https://example.com/x.png" }],
      deps: { matrix: sendMatrix },
    });

    expect(sendMatrix).toHaveBeenCalledWith(
      "!room:example",
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

    expect(sendMatrix).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.messageId)).toEqual(["m1", "m2"]);
  });

  it("respects newline chunk mode for plugin text", async () => {
    const sendMatrix = vi.fn().mockResolvedValue({ messageId: "m1", roomId: "!room:example" });
    const cfg: RemoteClawConfig = {
      channels: {
        matrix: { textChunkLimit: 4000, chunkMode: "newline" },
      } as RemoteClawConfig["channels"],
    };

    await deliverOutboundPayloads({
      cfg,
      channel: "matrix",
      to: "!room:example",
      payloads: [{ text: "Line one\n\nLine two" }],
      deps: { sendWhatsApp },
    });

    expect(sendMatrix).toHaveBeenCalledTimes(2);
    expect(sendMatrix).toHaveBeenNthCalledWith(
      1,
      "!room:example",
      "Line one",
      expect.objectContaining({ cfg }),
    );
    expect(sendMatrix).toHaveBeenNthCalledWith(
      2,
      "!room:example",
      "Line two",
      expect.objectContaining({ cfg }),
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

    expect(sendMatrix).not.toHaveBeenCalled();
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
      channel: "matrix",
      to: "!room:example",
      payloads: [{ text: "<br>" }],
      deps: { matrix: sendMatrix },
    });

    expect(sendMatrix).not.toHaveBeenCalled();
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
          pluginId: "matrix",
          source: "test",
          plugin: createOutboundTestPlugin({ id: "matrix", outbound: matrixOutboundForTest }),
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

    expect(sendMatrix).toHaveBeenCalledWith(
      "!room:example",
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
    const { sendMatrix, onError, results } = await runBestEffortPartialFailureDelivery();

    expect(sendMatrix).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ channel: "matrix", messageId: "m2", roomId: "!room:example" }]);
  });

  it("emits internal message:sent hook with success=true for chunked payload delivery", async () => {
    const { sendMatrix } = await runChunkedMatrixDelivery({
      mirror: {
        sessionKey: "agent:main:main",
        isGroup: true,
        groupId: "matrix:room:123",
      },
    });
    expect(sendMatrix).toHaveBeenCalledTimes(2);

    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledTimes(1);
    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledWith(
      "message",
      "sent",
      "agent:main:main",
      expectSuccessfulMatrixInternalHookPayload({
        content: "abcd",
        messageId: "m2",
        isGroup: true,
        groupId: "matrix:room:123",
      }),
    );
    expect(internalHookMocks.triggerInternalHook).toHaveBeenCalledTimes(1);
  });

  it("does not emit internal message:sent hook when neither mirror nor sessionKey is provided", async () => {
    await deliverSingleMatrixForHookTest();

    expect(internalHookMocks.createInternalHookEvent).not.toHaveBeenCalled();
    expect(internalHookMocks.triggerInternalHook).not.toHaveBeenCalled();
  });

  it("emits internal message:sent hook when sessionKey is provided without mirror", async () => {
    await deliverSingleMatrixForHookTest({ sessionKey: "agent:main:main" });

    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledTimes(1);
    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledWith(
      "message",
      "sent",
      "agent:main:main",
      expectSuccessfulMatrixInternalHookPayload({ content: "hello", messageId: "m1" }),
    );
    expect(internalHookMocks.triggerInternalHook).toHaveBeenCalledTimes(1);
  });

  it("warns when session.agentId is set without a session key", async () => {
    const sendMatrix = vi.fn().mockResolvedValue({ messageId: "m1", roomId: "!room:example" });
    hookMocks.runner.hasHooks.mockReturnValue(true);

    await deliverOutboundPayloads({
      cfg: matrixChunkConfig,
      channel: "matrix",
      to: "!room:example",
      payloads: [{ text: "hello" }],
      deps: { sendWhatsApp },
      session: { agentId: "agent-main" },
    });

    expect(logMocks.warn).toHaveBeenCalledWith(
      "deliverOutboundPayloads: session.agentId present without session key; internal message:sent hook will be skipped",
      expect.objectContaining({ channel: "matrix", to: "!room:example", agentId: "agent-main" }),
    );
  });

  it("calls failDelivery instead of ackDelivery on bestEffort partial failure", async () => {
    const { onError } = await runBestEffortPartialFailureDelivery();

    // onError was called for the first payload's failure.
    expect(onError).toHaveBeenCalledTimes(1);

    // Queue entry should NOT be acked — failDelivery should be called instead.
    expect(queueMocks.ackDelivery).not.toHaveBeenCalled();
    expect(queueMocks.failDelivery).toHaveBeenCalledWith(
      "mock-queue-id",
      "partial delivery failure (bestEffort)",
    );
  });

  it("acks the queue entry when delivery is aborted", async () => {
    const sendMatrix = vi.fn().mockResolvedValue({ messageId: "m1", roomId: "!room:example" });
    const abortController = new AbortController();
    abortController.abort();
    const cfg: RemoteClawConfig = {};

    await expect(
      deliverOutboundPayloads({
        cfg,
        channel: "matrix",
        to: "!room:example",
        payloads: [{ text: "a" }],
        deps: { sendWhatsApp },
        abortSignal: abortController.signal,
      }),
    ).rejects.toThrow("Operation aborted");

    expect(queueMocks.ackDelivery).toHaveBeenCalledWith("mock-queue-id");
    expect(queueMocks.failDelivery).not.toHaveBeenCalled();
    expect(sendMatrix).not.toHaveBeenCalled();
  });

  it("passes normalized payload to onError", async () => {
    const sendMatrix = vi.fn().mockRejectedValue(new Error("boom"));
    const onError = vi.fn();
    const cfg: RemoteClawConfig = {};

    await deliverOutboundPayloads({
      cfg,
      channel: "matrix",
      to: "!room:example",
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
    const sendMatrix = vi.fn().mockResolvedValue({ messageId: "m1", roomId: "!room:example" });

    await deliverOutboundPayloads({
      cfg: {},
      channel: "matrix",
      to: "!room:example",
      payloads: [{ text: "hello" }],
      deps: { sendWhatsApp },
    });

    expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
      expect.objectContaining({ to: "!room:example", content: "hello", success: true }),
      expect.objectContaining({ channelId: "matrix" }),
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

  it("preserves channelData-only payloads with empty text for sendPayload channels", async () => {
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
    const sendMatrix = vi.fn().mockRejectedValue(new Error("downstream failed"));

    await expect(
      deliverOutboundPayloads({
        cfg: {},
        channel: "matrix",
        to: "!room:example",
        payloads: [{ text: "hi" }],
        deps: { sendWhatsApp },
      }),
    ).rejects.toThrow("downstream failed");

    expect(hookMocks.runner.runMessageSent).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "!room:example",
        content: "hi",
        success: false,
        error: "downstream failed",
      }),
      expect.objectContaining({ channelId: "matrix" }),
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
