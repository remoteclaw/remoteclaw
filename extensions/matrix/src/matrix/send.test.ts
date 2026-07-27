import type { PluginRuntime } from "remoteclaw/plugin-sdk/matrix";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setMatrixRuntime } from "../runtime.js";

vi.mock("music-metadata", () => ({
  // `resolveMediaDurationMs` lazily imports `music-metadata`; in tests we don't
  // need real duration parsing and the real module is expensive to load.
  parseBuffer: vi.fn().mockResolvedValue({ format: {} }),
}));

vi.mock("@vector-im/matrix-bot-sdk", () => ({
  ConsoleLogger: class {
    trace = vi.fn();
    debug = vi.fn();
    info = vi.fn();
    warn = vi.fn();
    error = vi.fn();
  },
  LogService: {
    setLogger: vi.fn(),
  },
  MatrixClient: vi.fn(),
  SimpleFsStorageProvider: vi.fn(),
  RustSdkCryptoStorageProvider: vi.fn(),
}));

vi.mock("./send-queue.js", () => ({
  enqueueSend: async <T>(_roomId: string, fn: () => Promise<T>) => await fn(),
}));

const loadWebMediaMock = vi.fn().mockResolvedValue({
  buffer: Buffer.from("media"),
  fileName: "photo.png",
  contentType: "image/png",
  kind: "image",
});
const runtimeLoadConfigMock = vi.fn(() => ({}));
const mediaKindFromMimeMock = vi.fn(() => "image");
const isVoiceCompatibleAudioMock = vi.fn(() => false);
const getImageMetadataMock = vi.fn().mockResolvedValue(null);
const resizeToJpegMock = vi.fn();

const runtimeStub = {
  config: {
    loadConfig: runtimeLoadConfigMock,
  },
  media: {
    loadWebMedia: loadWebMediaMock as unknown as PluginRuntime["media"]["loadWebMedia"],
    mediaKindFromMime:
      mediaKindFromMimeMock as unknown as PluginRuntime["media"]["mediaKindFromMime"],
    isVoiceCompatibleAudio:
      isVoiceCompatibleAudioMock as unknown as PluginRuntime["media"]["isVoiceCompatibleAudio"],
    getImageMetadata: getImageMetadataMock as unknown as PluginRuntime["media"]["getImageMetadata"],
    resizeToJpeg: resizeToJpegMock as unknown as PluginRuntime["media"]["resizeToJpeg"],
  },
  channel: {
    text: {
      resolveTextChunkLimit: () => 4000,
      resolveChunkMode: () => "length",
      chunkMarkdownText: (text: string) => (text ? [text] : []),
      chunkMarkdownTextWithMode: (text: string) => (text ? [text] : []),
      resolveMarkdownTableMode: () => "code",
      convertMarkdownTables: (text: string) => text,
    },
  },
} as unknown as PluginRuntime;

let sendMessageMatrix: typeof import("./send.js").sendMessageMatrix;
let sendPollMatrix: typeof import("./send.js").sendPollMatrix;
let resolveMediaMaxBytes: typeof import("./send/client.js").resolveMediaMaxBytes;

const makeClient = () => {
  const sendMessage = vi.fn().mockResolvedValue("evt1");
  const uploadContent = vi.fn().mockResolvedValue("mxc://example/file");
  const sendEvent = vi.fn().mockResolvedValue("evt1");
  const client = {
    sendMessage,
    uploadContent,
    sendEvent,
    getUserId: vi.fn().mockResolvedValue("@bot:example.org"),
  } as unknown as import("@vector-im/matrix-bot-sdk").MatrixClient;
  return { client, sendMessage, uploadContent, sendEvent };
};

beforeAll(async () => {
  setMatrixRuntime(runtimeStub);
  ({ sendMessageMatrix, sendPollMatrix } = await import("./send.js"));
  ({ resolveMediaMaxBytes } = await import("./send/client.js"));
});

describe("sendMessageMatrix media", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeLoadConfigMock.mockReset();
    runtimeLoadConfigMock.mockReturnValue({});
    mediaKindFromMimeMock.mockReturnValue("image");
    isVoiceCompatibleAudioMock.mockReturnValue(false);
    setMatrixRuntime(runtimeStub);
  });

  it("uploads media with url payloads", async () => {
    const { client, sendMessage, uploadContent } = makeClient();

    await sendMessageMatrix("room:!room:example", "caption", {
      client,
      mediaUrl: "file:///tmp/photo.png",
    });

    const uploadArg = uploadContent.mock.calls[0]?.[0];
    expect(Buffer.isBuffer(uploadArg)).toBe(true);

    const content = sendMessage.mock.calls[0]?.[1] as {
      url?: string;
      msgtype?: string;
      format?: string;
      formatted_body?: string;
    };
    expect(content.msgtype).toBe("m.image");
    expect(content.format).toBe("org.matrix.custom.html");
    expect(content.formatted_body).toContain("caption");
    expect(content.url).toBe("mxc://example/file");
  });

  it("uploads encrypted media with file payloads", async () => {
    const { client, sendMessage, uploadContent } = makeClient();
    (client as { crypto?: object }).crypto = {
      isRoomEncrypted: vi.fn().mockResolvedValue(true),
      encryptMedia: vi.fn().mockResolvedValue({
        buffer: Buffer.from("encrypted"),
        file: {
          key: {
            kty: "oct",
            key_ops: ["encrypt", "decrypt"],
            alg: "A256CTR",
            k: "secret",
            ext: true,
          },
          iv: "iv",
          hashes: { sha256: "hash" },
          v: "v2",
        },
      }),
    };

    await sendMessageMatrix("room:!room:example", "caption", {
      client,
      mediaUrl: "file:///tmp/photo.png",
    });

    const uploadArg = uploadContent.mock.calls[0]?.[0] as Buffer | undefined;
    expect(uploadArg?.toString()).toBe("encrypted");

    const content = sendMessage.mock.calls[0]?.[1] as {
      url?: string;
      file?: { url?: string };
    };
    expect(content.url).toBeUndefined();
    expect(content.file?.url).toBe("mxc://example/file");
  });

  it("marks voice metadata and sends caption follow-up when audioAsVoice is compatible", async () => {
    const { client, sendMessage } = makeClient();
    mediaKindFromMimeMock.mockReturnValue("audio");
    isVoiceCompatibleAudioMock.mockReturnValue(true);
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("audio"),
      fileName: "clip.mp3",
      contentType: "audio/mpeg",
      kind: "audio",
    });

    await sendMessageMatrix("room:!room:example", "voice caption", {
      client,
      mediaUrl: "file:///tmp/clip.mp3",
      audioAsVoice: true,
    });

    expect(isVoiceCompatibleAudioMock).toHaveBeenCalledWith({
      contentType: "audio/mpeg",
      fileName: "clip.mp3",
    });
    expect(sendMessage).toHaveBeenCalledTimes(2);
    const mediaContent = sendMessage.mock.calls[0]?.[1] as {
      msgtype?: string;
      body?: string;
      "org.matrix.msc3245.voice"?: Record<string, never>;
    };
    expect(mediaContent.msgtype).toBe("m.audio");
    expect(mediaContent.body).toBe("Voice message");
    expect(mediaContent["org.matrix.msc3245.voice"]).toEqual({});
  });

  it("keeps regular audio payload when audioAsVoice media is incompatible", async () => {
    const { client, sendMessage } = makeClient();
    mediaKindFromMimeMock.mockReturnValue("audio");
    isVoiceCompatibleAudioMock.mockReturnValue(false);
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("audio"),
      fileName: "clip.wav",
      contentType: "audio/wav",
      kind: "audio",
    });

    await sendMessageMatrix("room:!room:example", "voice caption", {
      client,
      mediaUrl: "file:///tmp/clip.wav",
      audioAsVoice: true,
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const mediaContent = sendMessage.mock.calls[0]?.[1] as {
      msgtype?: string;
      body?: string;
      "org.matrix.msc3245.voice"?: Record<string, never>;
    };
    expect(mediaContent.msgtype).toBe("m.audio");
    expect(mediaContent.body).toBe("voice caption");
    expect(mediaContent["org.matrix.msc3245.voice"]).toBeUndefined();
  });
});

// These assertions are the integration guard for the mention wiring in send.ts.
// Deleting any single `enrichMatrixFormattedContent` / `resolveMatrixMentionsForBody`
// call site must fail at least one of them (#3045).
describe("sendMessageMatrix mentions", () => {
  type MentionedContent = {
    format?: string;
    formatted_body?: string;
    "m.mentions"?: { room?: boolean; user_ids?: string[] };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    runtimeLoadConfigMock.mockReset();
    runtimeLoadConfigMock.mockReturnValue({});
    mediaKindFromMimeMock.mockReturnValue("image");
    isVoiceCompatibleAudioMock.mockReturnValue(false);
    setMatrixRuntime(runtimeStub);
  });

  it("attaches m.mentions and a matrix.to pill to a plain text message", async () => {
    const { client, sendMessage } = makeClient();

    await sendMessageMatrix("room:!room:example", "ping @alice:example.org", { client });

    const content = sendMessage.mock.calls[0]?.[1] as MentionedContent;
    expect(content["m.mentions"]).toEqual({ user_ids: ["@alice:example.org"] });
    expect(content.format).toBe("org.matrix.custom.html");
    expect(content.formatted_body).toBe(
      '<p>ping <a href="https://matrix.to/#/%40alice%3Aexample.org">@alice:example.org</a></p>',
    );
  });

  it("does not mention the sending account itself", async () => {
    const { client, sendMessage } = makeClient();

    await sendMessageMatrix("room:!room:example", "ping @bot:example.org", { client });

    const content = sendMessage.mock.calls[0]?.[1] as MentionedContent;
    expect(content["m.mentions"]).toStrictEqual({});
    expect(content.formatted_body).toBe("<p>ping @bot:example.org</p>");
  });

  it("attaches m.mentions to a media caption", async () => {
    const { client, sendMessage } = makeClient();

    await sendMessageMatrix("room:!room:example", "look @alice:example.org", {
      client,
      mediaUrl: "file:///tmp/photo.png",
    });

    const content = sendMessage.mock.calls[0]?.[1] as MentionedContent;
    expect(content["m.mentions"]).toEqual({ user_ids: ["@alice:example.org"] });
    expect(content.formatted_body).toContain(
      '<a href="https://matrix.to/#/%40alice%3Aexample.org">@alice:example.org</a>',
    );
  });

  it("attaches m.mentions to a media follow-up chunk", async () => {
    const { client, sendMessage } = makeClient();
    mediaKindFromMimeMock.mockReturnValue("audio");
    isVoiceCompatibleAudioMock.mockReturnValue(true);
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("audio"),
      fileName: "clip.mp3",
      contentType: "audio/mpeg",
      kind: "audio",
    });

    await sendMessageMatrix("room:!room:example", "transcript @alice:example.org", {
      client,
      mediaUrl: "file:///tmp/clip.mp3",
      audioAsVoice: true,
    });

    expect(sendMessage).toHaveBeenCalledTimes(2);
    const mediaContent = sendMessage.mock.calls[0]?.[1] as MentionedContent;
    // The voice event body is generic, so it carries no caption and no mentions.
    expect(mediaContent["m.mentions"]).toStrictEqual({});
    const followup = sendMessage.mock.calls[1]?.[1] as MentionedContent;
    expect(followup["m.mentions"]).toEqual({ user_ids: ["@alice:example.org"] });
    expect(followup.formatted_body).toContain(
      '<a href="https://matrix.to/#/%40alice%3Aexample.org">@alice:example.org</a>',
    );
  });

  it("attaches m.mentions to a poll payload", async () => {
    const { client, sendEvent } = makeClient();

    await sendPollMatrix(
      "room:!room:example",
      { question: "ping @alice:example.org?", options: ["yes", "no"] },
      { client },
    );

    const payload = sendEvent.mock.calls[0]?.[2] as MentionedContent;
    expect(payload["m.mentions"]).toEqual({ user_ids: ["@alice:example.org"] });
  });

  it("flags room mentions on a plain text message", async () => {
    const { client, sendMessage } = makeClient();

    await sendMessageMatrix("room:!room:example", "heads up @room", { client });

    const content = sendMessage.mock.calls[0]?.[1] as MentionedContent;
    expect(content["m.mentions"]).toEqual({ room: true });
  });
});

describe("sendMessageMatrix threads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeLoadConfigMock.mockReset();
    runtimeLoadConfigMock.mockReturnValue({});
    setMatrixRuntime(runtimeStub);
  });

  it("includes thread relation metadata when threadId is set", async () => {
    const { client, sendMessage } = makeClient();

    await sendMessageMatrix("room:!room:example", "hello thread", {
      client,
      threadId: "$thread",
    });

    const content = sendMessage.mock.calls[0]?.[1] as {
      "m.relates_to"?: {
        rel_type?: string;
        event_id?: string;
        "m.in_reply_to"?: { event_id?: string };
      };
    };

    expect(content["m.relates_to"]).toEqual({
      rel_type: "m.thread",
      event_id: "$thread",
      is_falling_back: true,
      "m.in_reply_to": { event_id: "$thread" },
    });
  });
});

describe("sendMessageMatrix cfg threading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeLoadConfigMock.mockReset();
    runtimeLoadConfigMock.mockReturnValue({
      channels: {
        matrix: {
          mediaMaxMb: 7,
        },
      },
    });
    setMatrixRuntime(runtimeStub);
  });

  it("does not call runtime loadConfig when cfg is provided", async () => {
    const { client } = makeClient();
    const providedCfg = {
      channels: {
        matrix: {
          mediaMaxMb: 4,
        },
      },
    };

    await sendMessageMatrix("room:!room:example", "hello cfg", {
      client,
      cfg: providedCfg as any,
    });

    expect(runtimeLoadConfigMock).not.toHaveBeenCalled();
  });

  it("falls back to runtime loadConfig when cfg is omitted", async () => {
    const { client } = makeClient();

    await sendMessageMatrix("room:!room:example", "hello runtime", { client });

    expect(runtimeLoadConfigMock).toHaveBeenCalledTimes(1);
  });
});

describe("resolveMediaMaxBytes cfg threading", () => {
  beforeEach(() => {
    runtimeLoadConfigMock.mockReset();
    runtimeLoadConfigMock.mockReturnValue({
      channels: {
        matrix: {
          mediaMaxMb: 9,
        },
      },
    });
    setMatrixRuntime(runtimeStub);
  });

  it("uses provided cfg and skips runtime loadConfig", () => {
    const providedCfg = {
      channels: {
        matrix: {
          mediaMaxMb: 3,
        },
      },
    };

    const maxBytes = resolveMediaMaxBytes(undefined, providedCfg as any);

    expect(maxBytes).toBe(3 * 1024 * 1024);
    expect(runtimeLoadConfigMock).not.toHaveBeenCalled();
  });

  it("falls back to runtime loadConfig when cfg is omitted", () => {
    const maxBytes = resolveMediaMaxBytes();

    expect(maxBytes).toBe(9 * 1024 * 1024);
    expect(runtimeLoadConfigMock).toHaveBeenCalledTimes(1);
  });
});
