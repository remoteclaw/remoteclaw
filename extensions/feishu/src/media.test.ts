import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePreferredRemoteClawTmpDir } from "../../../src/infra/tmp-remoteclaw-dir.js";

const createFeishuClientMock = vi.hoisted(() => vi.fn());
const resolveFeishuAccountMock = vi.hoisted(() => vi.fn());
const normalizeFeishuTargetMock = vi.hoisted(() => vi.fn());
const resolveReceiveIdTypeMock = vi.hoisted(() => vi.fn());
const loadWebMediaMock = vi.hoisted(() => vi.fn());
const transcodeAudioBufferToOpusMock = vi.hoisted(() => vi.fn());

const fileCreateMock = vi.hoisted(() => vi.fn());
const imageCreateMock = vi.hoisted(() => vi.fn());
const imageGetMock = vi.hoisted(() => vi.fn());
const messageCreateMock = vi.hoisted(() => vi.fn());
const messageResourceGetMock = vi.hoisted(() => vi.fn());
const messageReplyMock = vi.hoisted(() => vi.fn());

const FEISHU_MEDIA_HTTP_TIMEOUT_MS = 120_000;

// Keep the real plugin-sdk surface (withTempDownloadPath, MIME helpers) and stub
// only the ffmpeg-backed transcode so voice tests stay hermetic.
vi.mock("remoteclaw/plugin-sdk/feishu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("remoteclaw/plugin-sdk/feishu")>()),
  transcodeAudioBufferToOpus: transcodeAudioBufferToOpusMock,
}));

vi.mock("./client.js", () => ({
  createFeishuClient: createFeishuClientMock,
}));

vi.mock("./accounts.js", () => ({
  resolveFeishuAccount: resolveFeishuAccountMock,
  resolveFeishuRuntimeAccount: resolveFeishuAccountMock,
}));

vi.mock("./targets.js", () => ({
  normalizeFeishuTarget: normalizeFeishuTargetMock,
  resolveReceiveIdType: resolveReceiveIdTypeMock,
}));

vi.mock("./runtime.js", () => ({
  getFeishuRuntime: () => ({
    media: {
      loadWebMedia: loadWebMediaMock,
    },
  }),
}));

import {
  downloadImageFeishu,
  downloadMessageResourceFeishu,
  sanitizeFileNameForUpload,
  sendMediaFeishu,
} from "./media.js";

function expectPathIsolatedToTmpRoot(pathValue: string, key: string): void {
  expect(pathValue).not.toContain(key);
  expect(pathValue).not.toContain("..");

  // Accept the path under either spelling of the tmp root: on macOS the preferred
  // root (/tmp/remoteclaw) is reached through a symlink (/tmp -> /private/tmp), so
  // realpath-ing only the root reports a false escape. Escaping paths still fail
  // both comparisons.
  const rawRoot = resolvePreferredRemoteClawTmpDir();
  const resolved = path.resolve(pathValue);
  const isWithinRoot = (root: string): boolean => {
    const rel = path.relative(root, resolved);
    return rel !== ".." && !rel.startsWith(`..${path.sep}`);
  };
  expect(isWithinRoot(rawRoot) || isWithinRoot(realpathSync(rawRoot))).toBe(true);
}

function expectMediaTimeoutClientConfigured(): void {
  const options = mockCallArg<{ httpTimeoutMs?: number }>(createFeishuClientMock, 0, 0);
  expect(options.httpTimeoutMs).toBe(FEISHU_MEDIA_HTTP_TIMEOUT_MS);
}

function mockResolvedFeishuAccount() {
  resolveFeishuAccountMock.mockReturnValue({
    configured: true,
    accountId: "main",
    config: {},
    appId: "app_id",
    appSecret: "app_secret",
    domain: "feishu",
  });
}

function mockCallArg<T>(
  mock: { mock: { calls: unknown[][] } },
  callIndex: number,
  argIndex: number,
  _type?: (value: unknown) => value is T,
): T {
  const call = mock.mock.calls[callIndex];
  if (!call) {
    throw new Error(`Expected mock call at index ${callIndex}`);
  }
  return call[argIndex] as T;
}

function callData<T>(
  mock: { mock: { calls: unknown[][] } },
  callIndex = 0,
  _type?: (value: unknown) => value is T,
): T {
  const arg = mockCallArg<{ data?: unknown }>(mock, callIndex, 0);
  if (arg.data === undefined) {
    throw new Error(`Expected mock call data at index ${callIndex}`);
  }
  return arg.data as T;
}

describe("sendMediaFeishu msg_type routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvedFeishuAccount();

    normalizeFeishuTargetMock.mockReturnValue("ou_target");
    resolveReceiveIdTypeMock.mockReturnValue("open_id");

    createFeishuClientMock.mockReturnValue({
      im: {
        file: {
          create: fileCreateMock,
        },
        image: {
          create: imageCreateMock,
          get: imageGetMock,
        },
        message: {
          create: messageCreateMock,
          reply: messageReplyMock,
        },
        messageResource: {
          get: messageResourceGetMock,
        },
      },
    });

    fileCreateMock.mockResolvedValue({
      code: 0,
      data: { file_key: "file_key_1" },
    });
    imageCreateMock.mockResolvedValue({
      code: 0,
      data: { image_key: "image_key_1" },
    });

    messageCreateMock.mockResolvedValue({
      code: 0,
      data: { message_id: "msg_1" },
    });

    messageReplyMock.mockResolvedValue({
      code: 0,
      data: { message_id: "reply_1" },
    });

    loadWebMediaMock.mockResolvedValue({
      buffer: Buffer.from("remote-audio"),
      fileName: "remote.opus",
      kind: "audio",
      contentType: "audio/ogg",
    });

    transcodeAudioBufferToOpusMock.mockResolvedValue(Buffer.from("ogg-opus-bytes"));

    imageGetMock.mockResolvedValue(Buffer.from("image-bytes"));
    messageResourceGetMock.mockResolvedValue(Buffer.from("resource-bytes"));
  });

  it("uses msg_type=media for mp4 video", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("video"),
      fileName: "clip.mp4",
    });

    expect(callData<{ file_type?: string }>(fileCreateMock).file_type).toBe("mp4");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("media");
  });

  it("uses msg_type=audio for opus", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("audio"),
      fileName: "voice.opus",
    });

    expect(callData<{ file_type?: string }>(fileCreateMock).file_type).toBe("opus");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("audio");
  });

  it("uses msg_type=file for documents", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("doc"),
      fileName: "paper.pdf",
    });

    expect(callData<{ file_type?: string }>(fileCreateMock).file_type).toBe("pdf");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("file");
  });

  it("uses msg_type=media for remote mp4 content even when the filename is generic", async () => {
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("remote-video"),
      fileName: "download",
      kind: "video",
      contentType: "video/mp4",
    });

    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/video",
    });

    expect(callData<{ file_type?: string }>(fileCreateMock).file_type).toBe("mp4");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("media");
  });

  it("uses msg_type=image for image content-type when the filename has no extension (#2969)", async () => {
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("remote-image"),
      fileName: "download",
      kind: "image",
      contentType: "image/png",
    });

    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/image",
    });

    expect(imageCreateMock).toHaveBeenCalledTimes(1);
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("image");
    expect(fileCreateMock).not.toHaveBeenCalled();
  });

  it("uses msg_type=audio for ogg content-type when the filename has no extension (#2969)", async () => {
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("remote-voice"),
      fileName: "download",
      kind: "audio",
      contentType: "audio/ogg",
    });

    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/voice",
    });

    expect(callData<{ file_type?: string }>(fileCreateMock).file_type).toBe("opus");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("audio");
  });

  it("normalizes content-type parameters when classifying (#2969)", async () => {
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("remote-video"),
      fileName: "download",
      kind: "video",
      contentType: "video/mp4; charset=binary",
    });

    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/video",
    });

    expect(callData<{ file_type?: string }>(fileCreateMock).file_type).toBe("mp4");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("media");
  });

  it("transcodes transcodable audio to a native voice bubble when audioAsVoice is set (#2969)", async () => {
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("remote-mp3"),
      fileName: "song.mp3",
      kind: "audio",
      contentType: "audio/mpeg",
    });

    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/song.mp3",
      audioAsVoice: true,
    });

    expect(transcodeAudioBufferToOpusMock).toHaveBeenCalledTimes(1);
    const uploaded = callData<{ file_type?: string; file_name?: string }>(fileCreateMock);
    expect(uploaded.file_type).toBe("opus");
    expect(uploaded.file_name).toBe("voice.ogg");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("audio");
  });

  it("skips transcoding when audio is already ogg/opus and audioAsVoice is set (#2969)", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/remote.opus",
      audioAsVoice: true,
    });

    expect(transcodeAudioBufferToOpusMock).not.toHaveBeenCalled();
    expect(callData<{ file_type?: string }>(fileCreateMock).file_type).toBe("opus");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("audio");
  });

  it("leaves audio as a file attachment when audioAsVoice is not set (#2969)", async () => {
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("remote-mp3"),
      fileName: "song.mp3",
      kind: "audio",
      contentType: "audio/mpeg",
    });

    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/song.mp3",
    });

    expect(transcodeAudioBufferToOpusMock).not.toHaveBeenCalled();
    expect(callData<{ file_type?: string }>(fileCreateMock).file_type).toBe("stream");
  });

  it("falls back to a file attachment when the voice transcode fails (#2969)", async () => {
    transcodeAudioBufferToOpusMock.mockRejectedValueOnce(new Error("ffmpeg not found"));
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("remote-mp3"),
      fileName: "song.mp3",
      kind: "audio",
      contentType: "audio/mpeg",
    });

    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/song.mp3",
      audioAsVoice: true,
    });

    const uploaded = callData<{ file_type?: string; file_name?: string }>(fileCreateMock);
    expect(uploaded.file_type).toBe("stream");
    expect(uploaded.file_name).toBe("song.mp3");
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("file");
  });

  it("falls back to generic file for unsupported audio formats", async () => {
    loadWebMediaMock.mockResolvedValueOnce({
      buffer: Buffer.from("remote-mp3"),
      fileName: "song.mp3",
      kind: "audio",
      contentType: "audio/mpeg",
    });

    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "https://example.com/song.mp3",
    });

    expect(fileCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ file_type: "stream" }),
      }),
    );
    expect(messageCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ msg_type: "file" }),
      }),
    );
  });

  it("configures the media client timeout for image uploads", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("image"),
      fileName: "photo.png",
    });

    expectMediaTimeoutClientConfigured();
    expect(callData<{ msg_type?: string }>(messageCreateMock).msg_type).toBe("image");
  });

  it("uses msg_type=media when replying with mp4", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("video"),
      fileName: "reply.mp4",
      replyToMessageId: "om_parent",
    });

    const replyRequest = mockCallArg<{
      data?: { msg_type?: string };
      path?: { message_id?: string };
    }>(messageReplyMock, 0, 0);
    expect(replyRequest.path).toEqual({ message_id: "om_parent" });
    expect(replyRequest.data?.msg_type).toBe("media");

    expect(messageCreateMock).not.toHaveBeenCalled();
  });

  it("passes reply_in_thread when replyInThread is true", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("video"),
      fileName: "reply.mp4",
      replyToMessageId: "om_parent",
      replyInThread: true,
    });

    const replyRequest = mockCallArg<{
      data?: { msg_type?: string; reply_in_thread?: boolean };
      path?: { message_id?: string };
    }>(messageReplyMock, 0, 0);
    expect(replyRequest.path).toEqual({ message_id: "om_parent" });
    expect(replyRequest.data?.msg_type).toBe("media");
    expect(replyRequest.data?.reply_in_thread).toBe(true);
  });

  it("omits reply_in_thread when replyInThread is false", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("video"),
      fileName: "reply.mp4",
      replyToMessageId: "om_parent",
      replyInThread: false,
    });

    const callData = messageReplyMock.mock.calls[0][0].data;
    expect(callData).not.toHaveProperty("reply_in_thread");
  });

  it("passes mediaLocalRoots as localRoots to loadWebMedia for local paths (#27884)", async () => {
    loadWebMediaMock.mockResolvedValue({
      buffer: Buffer.from("local-file"),
      fileName: "doc.pdf",
      kind: "document",
      contentType: "application/pdf",
    });

    const roots = ["/allowed/workspace", "/tmp/remoteclaw"];
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaUrl: "/allowed/workspace/file.pdf",
      mediaLocalRoots: roots,
    });

    expect(mockCallArg(loadWebMediaMock, 0, 0)).toBe("/allowed/workspace/file.pdf");
    const options = mockCallArg<{
      localRoots?: string[];
      maxBytes?: number;
      optimizeImages?: boolean;
    }>(loadWebMediaMock, 0, 1);
    expect(typeof options.maxBytes).toBe("number");
    expect(options.optimizeImages).toBe(false);
    expect(options.localRoots).toBe(roots);
  });

  it("fails closed when media URL fetch is blocked", async () => {
    loadWebMediaMock.mockRejectedValueOnce(
      new Error("Blocked: resolves to private/internal IP address"),
    );

    await expect(
      sendMediaFeishu({
        cfg: {} as any,
        to: "user:ou_target",
        mediaUrl: "https://x/img",
        fileName: "voice.opus",
      }),
    ).rejects.toThrow(/private\/internal/i);

    expect(fileCreateMock).not.toHaveBeenCalled();
    expect(messageCreateMock).not.toHaveBeenCalled();
    expect(messageReplyMock).not.toHaveBeenCalled();
  });

  it("uses isolated temp paths for image downloads", async () => {
    const imageKey = "img_v3_01abc123";
    let capturedPath: string | undefined;

    imageGetMock.mockResolvedValueOnce({
      writeFile: async (tmpPath: string) => {
        capturedPath = tmpPath;
        await fs.writeFile(tmpPath, Buffer.from("image-data"));
      },
    });

    const result = await downloadImageFeishu({
      cfg: {} as any,
      imageKey,
    });

    const request = mockCallArg<{ path?: { image_key?: string } }>(imageGetMock, 0, 0);
    expect(request.path).toEqual({ image_key: imageKey });
    expectMediaTimeoutClientConfigured();
    expect(result.buffer).toEqual(Buffer.from("image-data"));
    if (!capturedPath) {
      throw new Error("expected Feishu image temp path");
    }
    expectPathIsolatedToTmpRoot(capturedPath, imageKey);
  });

  it("uses isolated temp paths for message resource downloads", async () => {
    const fileKey = "file_v3_01abc123";
    let capturedPath: string | undefined;

    messageResourceGetMock.mockResolvedValueOnce({
      writeFile: async (tmpPath: string) => {
        capturedPath = tmpPath;
        await fs.writeFile(tmpPath, Buffer.from("resource-data"));
      },
    });

    const result = await downloadMessageResourceFeishu({
      cfg: {} as any,
      messageId: "om_123",
      fileKey,
      type: "image",
    });

    expect(result.buffer).toEqual(Buffer.from("resource-data"));
    if (!capturedPath) {
      throw new Error("expected Feishu resource temp path");
    }
    expectPathIsolatedToTmpRoot(capturedPath, fileKey);
  });

  it("extracts content-type from image download headers (#2969)", async () => {
    imageGetMock.mockResolvedValueOnce({
      data: Buffer.from("png-bytes"),
      headers: { "Content-Type": "image/png" },
    });

    const result = await downloadImageFeishu({
      cfg: {} as any,
      imageKey: "img_v3_01abc123",
    });

    expect(result.buffer).toEqual(Buffer.from("png-bytes"));
    expect(result.contentType).toBe("image/png");
  });

  it("rejects invalid image keys before calling feishu api", async () => {
    await expect(
      downloadImageFeishu({
        cfg: {} as any,
        imageKey: "a/../../bad",
      }),
    ).rejects.toThrow("invalid image_key");

    expect(imageGetMock).not.toHaveBeenCalled();
  });

  it("rejects invalid file keys before calling feishu api", async () => {
    await expect(
      downloadMessageResourceFeishu({
        cfg: {} as any,
        messageId: "om_123",
        fileKey: "x/../../bad",
        type: "file",
      }),
    ).rejects.toThrow("invalid file_key");

    expect(messageResourceGetMock).not.toHaveBeenCalled();
  });

  it("preserves Chinese filenames for file uploads", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("doc"),
      fileName: "测试文档.pdf",
    });

    const createCall = fileCreateMock.mock.calls[0][0];
    expect(createCall.data.file_name).toBe("测试文档.pdf");
  });

  it("preserves ASCII filenames unchanged for file uploads", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("doc"),
      fileName: "report-2026.pdf",
    });

    const createCall = fileCreateMock.mock.calls[0][0];
    expect(createCall.data.file_name).toBe("report-2026.pdf");
  });

  it("preserves special Unicode characters (em-dash, full-width brackets) in filenames", async () => {
    await sendMediaFeishu({
      cfg: {} as any,
      to: "user:ou_target",
      mediaBuffer: Buffer.from("doc"),
      fileName: "报告—详情（2026）.md",
    });

    const createCall = fileCreateMock.mock.calls[0][0];
    expect(createCall.data.file_name).toBe("报告—详情（2026）.md");
  });
});

describe("sanitizeFileNameForUpload", () => {
  it("returns ASCII filenames unchanged", () => {
    expect(sanitizeFileNameForUpload("report.pdf")).toBe("report.pdf");
    expect(sanitizeFileNameForUpload("my-file_v2.txt")).toBe("my-file_v2.txt");
  });

  it("preserves Chinese characters", () => {
    expect(sanitizeFileNameForUpload("测试文件.md")).toBe("测试文件.md");
    expect(sanitizeFileNameForUpload("武汉15座山登山信息汇总.csv")).toBe(
      "武汉15座山登山信息汇总.csv",
    );
  });

  it("preserves em-dash and full-width brackets", () => {
    expect(sanitizeFileNameForUpload("文件—说明（v2）.pdf")).toBe("文件—说明（v2）.pdf");
  });

  it("preserves single quotes and parentheses", () => {
    expect(sanitizeFileNameForUpload("文件'(test).txt")).toBe("文件'(test).txt");
  });

  it("preserves filenames without extension", () => {
    expect(sanitizeFileNameForUpload("测试文件")).toBe("测试文件");
  });

  it("preserves mixed ASCII and non-ASCII", () => {
    expect(sanitizeFileNameForUpload("Report_报告_2026.xlsx")).toBe("Report_报告_2026.xlsx");
  });

  it("preserves emoji filenames", () => {
    expect(sanitizeFileNameForUpload("report_😀.txt")).toBe("report_😀.txt");
  });

  it("strips control characters", () => {
    expect(sanitizeFileNameForUpload("bad\x00file.txt")).toBe("bad_file.txt");
    expect(sanitizeFileNameForUpload("inject\r\nheader.txt")).toBe("inject__header.txt");
  });

  it("strips quotes and backslashes to prevent header injection", () => {
    expect(sanitizeFileNameForUpload('file"name.txt')).toBe("file_name.txt");
    expect(sanitizeFileNameForUpload("file\\name.txt")).toBe("file_name.txt");
  });
});

describe("downloadMessageResourceFeishu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolvedFeishuAccount();

    createFeishuClientMock.mockReturnValue({
      im: {
        messageResource: {
          get: messageResourceGetMock,
        },
      },
    });

    messageResourceGetMock.mockResolvedValue(Buffer.from("fake-audio-data"));
  });

  // Regression: Feishu API only supports type=image|file for messageResource.get.
  // Audio/video resources must use type=file, not type=audio (#8746).
  it("forwards provided type=file for non-image resources", async () => {
    const result = await downloadMessageResourceFeishu({
      cfg: {} as any,
      messageId: "om_audio_msg",
      fileKey: "file_key_audio",
      type: "file",
    });

    const request = mockCallArg<{
      params?: { type?: string };
      path?: { file_key?: string; message_id?: string };
    }>(messageResourceGetMock, 0, 0);
    expect(request.path).toEqual({ message_id: "om_audio_msg", file_key: "file_key_audio" });
    expect(request.params).toEqual({ type: "file" });
    expectMediaTimeoutClientConfigured();
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("image uses type=image", async () => {
    messageResourceGetMock.mockResolvedValue(Buffer.from("fake-image-data"));

    const result = await downloadMessageResourceFeishu({
      cfg: {} as any,
      messageId: "om_img_msg",
      fileKey: "img_key_1",
      type: "image",
    });

    const request = mockCallArg<{
      params?: { type?: string };
      path?: { file_key?: string; message_id?: string };
    }>(messageResourceGetMock, 0, 0);
    expect(request.path).toEqual({ message_id: "om_img_msg", file_key: "img_key_1" });
    expect(request.params).toEqual({ type: "image" });
    expectMediaTimeoutClientConfigured();
    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("extracts content-type and filename metadata from download headers", async () => {
    messageResourceGetMock.mockResolvedValueOnce({
      data: Buffer.from("fake-video-data"),
      headers: {
        "content-type": "video/mp4",
        "content-disposition": `attachment; filename="clip.mp4"`,
      },
    });

    const result = await downloadMessageResourceFeishu({
      cfg: {} as any,
      messageId: "om_video_msg",
      fileKey: "file_key_video",
      type: "file",
    });

    expect(result.buffer).toEqual(Buffer.from("fake-video-data"));
    expect(result.contentType).toBe("video/mp4");
    expect(result.fileName).toBe("clip.mp4");
  });
});
