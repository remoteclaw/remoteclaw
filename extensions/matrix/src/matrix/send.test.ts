import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginRuntime } from "../../runtime-api.js";

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
let sendTypingMatrix: typeof import("./send.js").sendTypingMatrix;
let voteMatrixPoll: typeof import("./actions/polls.js").voteMatrixPoll;

async function loadMatrixSendModules() {
  vi.resetModules();
  const runtimeModule = await import("../runtime.js");
  runtimeModule.setMatrixRuntime(runtimeStub);
  ({ sendMessageMatrix } = await import("./send.js"));
  ({ sendTypingMatrix } = await import("./send.js"));
  ({ voteMatrixPoll } = await import("./actions/polls.js"));
}
const makeClient = () => {
  const sendMessage = vi.fn().mockResolvedValue("evt1");
  const uploadContent = vi.fn().mockResolvedValue("mxc://example/file");
  const client = {
    sendMessage,
    uploadContent,
    getUserId: vi.fn().mockResolvedValue("@bot:example.org"),
  } as unknown as import("@vector-im/matrix-bot-sdk").MatrixClient;
  return { client, sendMessage, uploadContent };
};

beforeAll(async () => {
  setMatrixRuntime(runtimeStub);
  ({ sendMessageMatrix } = await import("./send.js"));
  ({ resolveMediaMaxBytes } = await import("./send/client.js"));
});

describe("sendMessageMatrix media", () => {
  beforeAll(async () => {
    await loadMatrixSendModules();
  });

  beforeEach(async () => {
    loadWebMediaMock.mockReset().mockResolvedValue({
      buffer: Buffer.from("media"),
      fileName: "photo.png",
      contentType: "image/png",
      kind: "image",
    });
    loadConfigMock.mockReset().mockReturnValue({});
    getImageMetadataMock.mockReset().mockResolvedValue(null);
    resizeToJpegMock.mockReset();
    mediaKindFromMimeMock.mockReset().mockReturnValue("image");
    isVoiceCompatibleAudioMock.mockReset().mockReturnValue(false);
    resolveTextChunkLimitMock.mockReset().mockReturnValue(4000);
    await loadMatrixSendModules();
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

describe("sendMessageMatrix threads", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    loadConfigMock.mockReset().mockReturnValue({});
    mediaKindFromMimeMock.mockReset().mockReturnValue("image");
    isVoiceCompatibleAudioMock.mockReset().mockReturnValue(false);
    await loadMatrixSendModules();
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

    expect(content["m.relates_to"]).toMatchObject({
      rel_type: "m.thread",
      event_id: "$thread",
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

describe("voteMatrixPoll", () => {
  beforeAll(async () => {
    await loadMatrixSendModules();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    loadConfigMock.mockReset().mockReturnValue({});
    mediaKindFromMimeMock.mockReset().mockReturnValue("image");
    isVoiceCompatibleAudioMock.mockReset().mockReturnValue(false);
    await loadMatrixSendModules();
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

    await expect(
      voteMatrixPoll("room:!room:example", "$poll", {
        client,
        optionIndex: 2,
      }),
    ).rejects.toThrow("out of range");
  });

  it("rejects votes that exceed the poll selection cap", async () => {
    const { client, getEvent } = makeClient();
    getEvent.mockResolvedValue({
      type: "m.poll.start",
      content: {
        "m.poll.start": {
          question: { "m.text": "Lunch?" },
          max_selections: 1,
          answers: [
            { id: "a1", "m.text": "Pizza" },
            { id: "a2", "m.text": "Sushi" },
          ],
        },
      },
    });

    await expect(
      voteMatrixPoll("room:!room:example", "$poll", {
        client,
        optionIndexes: [1, 2],
      }),
    ).rejects.toThrow("at most 1 selection");
  });

  it("rejects non-poll events before sending a response", async () => {
    const { client, getEvent, sendEvent } = makeClient();
    getEvent.mockResolvedValue({
      type: "m.room.message",
      content: { body: "hello" },
    });

    await expect(
      voteMatrixPoll("room:!room:example", "$poll", {
        client,
        optionIndex: 1,
      }),
    ).rejects.toThrow("is not a Matrix poll start event");
    expect(sendEvent).not.toHaveBeenCalled();
  });

  it("accepts decrypted poll start events returned from encrypted rooms", async () => {
    const { client, getEvent, sendEvent } = makeClient();
    getEvent.mockResolvedValue({
      type: "m.poll.start",
      content: {
        "m.poll.start": {
          question: { "m.text": "Lunch?" },
          max_selections: 1,
          answers: [{ id: "a1", "m.text": "Pizza" }],
        },
      },
    });

    await expect(
      voteMatrixPoll("room:!room:example", "$poll", {
        client,
        optionIndex: 1,
      }),
    ).resolves.toMatchObject({
      pollId: "$poll",
      answerIds: ["a1"],
    });
    expect(sendEvent).toHaveBeenCalledWith("!room:example", "m.poll.response", {
      "m.poll.response": { answers: ["a1"] },
      "org.matrix.msc3381.poll.response": { answers: ["a1"] },
      "m.relates_to": {
        rel_type: "m.reference",
        event_id: "$poll",
      },
    });
  });
});

describe("sendTypingMatrix", () => {
  beforeAll(async () => {
    await loadMatrixSendModules();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    loadConfigMock.mockReset().mockReturnValue({});
    mediaKindFromMimeMock.mockReset().mockReturnValue("image");
    isVoiceCompatibleAudioMock.mockReset().mockReturnValue(false);
    await loadMatrixSendModules();
  });

  it("normalizes room-prefixed targets before sending typing state", async () => {
    const setTyping = vi.fn().mockResolvedValue(undefined);
    const client = {
      setTyping,
      prepareForOneOff: vi.fn(async () => undefined),
      start: vi.fn(async () => undefined),
      stop: vi.fn(() => undefined),
      stopAndPersist: vi.fn(async () => undefined),
    } as unknown as import("./sdk.js").MatrixClient;

    await sendTypingMatrix("room:!room:example", true, undefined, client);

    expect(setTyping).toHaveBeenCalledWith("!room:example", true, 30_000);
  });
});
