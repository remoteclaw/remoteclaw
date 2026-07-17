import fs from "fs";
import path from "path";
import { Readable } from "stream";
import {
  mediaKindFromMime,
  normalizeLowercaseStringOrEmpty,
  normalizeMimeType,
  transcodeAudioBufferToOpus,
  withTempDownloadPath,
  type ClawdbotConfig,
} from "remoteclaw/plugin-sdk/feishu";
import { resolveFeishuAccount } from "./accounts.js";
import { createFeishuClient } from "./client.js";
import { normalizeFeishuExternalKey } from "./external-keys.js";
import { getFeishuRuntime } from "./runtime.js";
import { assertFeishuMessageApiSuccess, toFeishuSendResult } from "./send-result.js";
import { resolveFeishuSendTarget } from "./send-target.js";

const FEISHU_MEDIA_HTTP_TIMEOUT_MS = 120_000;
const FEISHU_VOICE_FILE_NAME = "voice.ogg";
const FEISHU_VOICE_SAMPLE_RATE_HZ = 48_000;
const FEISHU_VOICE_BITRATE = "64k";

const FEISHU_TRANSCODABLE_AUDIO_EXTS = new Set([
  ".aac",
  ".aiff",
  ".alac",
  ".amr",
  ".caf",
  ".flac",
  ".m4a",
  ".mp3",
  ".oga",
  ".wav",
  ".webm",
  ".wma",
]);

export type DownloadImageResult = {
  buffer: Buffer;
  contentType?: string;
};

export type DownloadMessageResourceResult = {
  buffer: Buffer;
  contentType?: string;
  fileName?: string;
};

function createConfiguredFeishuMediaClient(params: { cfg: ClawdbotConfig; accountId?: string }): {
  account: ReturnType<typeof resolveFeishuAccount>;
  client: ReturnType<typeof createFeishuClient>;
} {
  const account = resolveFeishuAccount({ cfg: params.cfg, accountId: params.accountId });
  if (!account.configured) {
    throw new Error(`Feishu account "${account.accountId}" not configured`);
  }

  return {
    account,
    client: createFeishuClient({
      ...account,
      httpTimeoutMs: FEISHU_MEDIA_HTTP_TIMEOUT_MS,
    }),
  };
}

function extractFeishuUploadKey(
  response: unknown,
  params: {
    key: "image_key" | "file_key";
    errorPrefix: string;
  },
): string {
  // SDK v1.30+ returns data directly without code wrapper on success.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK response type
  const responseAny = response as any;
  if (responseAny.code !== undefined && responseAny.code !== 0) {
    throw new Error(`${params.errorPrefix}: ${responseAny.msg || `code ${responseAny.code}`}`);
  }

  const key = responseAny[params.key] ?? responseAny.data?.[params.key];
  if (!key) {
    throw new Error(`${params.errorPrefix}: no ${params.key} returned`);
  }
  return key;
}

type FeishuHeaderMap = Record<string, string | string[]>;

/** Narrow an unknown `headers`/`header` bag to a string-valued map, or reject it. */
function asHeaderMap(value: unknown): FeishuHeaderMap | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return undefined;
  }
  if (entries.every(([, entry]) => typeof entry === "string" || Array.isArray(entry))) {
    return Object.fromEntries(entries) as FeishuHeaderMap;
  }
  return undefined;
}

function readHeaderValue(headers: FeishuHeaderMap | undefined, name: string): string | undefined {
  if (!headers) {
    return undefined;
  }
  const target = normalizeLowercaseStringOrEmpty(name);
  for (const [key, value] of Object.entries(headers)) {
    if (normalizeLowercaseStringOrEmpty(key) !== target) {
      continue;
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const first = value.find((entry) => typeof entry === "string" && entry.trim());
      if (typeof first === "string") {
        return first.trim();
      }
    }
  }
  return undefined;
}

function containsEastAsianScript(value: string): boolean {
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(value);
}

/**
 * Feishu serves `content-disposition` filenames as raw UTF-8 bytes, which Node
 * surfaces as latin1. Recover the original CJK display name when the round-trip
 * is unambiguous; otherwise keep the header verbatim.
 */
function recoverUtf8FileNameFromLatin1Header(value: string): string {
  const recovered = Buffer.from(value, "latin1").toString("utf8");
  if (recovered !== value && !recovered.includes("�") && containsEastAsianScript(recovered)) {
    return recovered;
  }
  return value;
}

function decodeDispositionFileName(value: string): string | undefined {
  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    const raw = utf8Match[1].trim().replace(/^"(.*)"$/, "$1");
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }

  const plainMatch = value.match(/filename="?([^";]+)"?/i);
  const plainFileName = plainMatch?.[1]?.trim();
  return plainFileName ? recoverUtf8FileNameFromLatin1Header(plainFileName) : undefined;
}

/**
 * Recover the content-type / filename the SDK exposes alongside a download so
 * callers can classify media that carries no usable filename extension.
 */
function extractFeishuDownloadMetadata(response: unknown): {
  contentType?: string;
  fileName?: string;
} {
  if (!response || typeof response !== "object") {
    return {};
  }
  const responseWithOptionalFields = response as {
    headers?: unknown;
    header?: unknown;
    contentType?: string;
    mime_type?: string;
    file_name?: string;
    fileName?: string;
    data?: {
      contentType?: string;
      mime_type?: string;
      file_name?: string;
      fileName?: string;
    };
  };
  const headers =
    asHeaderMap(responseWithOptionalFields.headers) ??
    asHeaderMap(responseWithOptionalFields.header);
  const data = Buffer.isBuffer(responseWithOptionalFields.data)
    ? undefined
    : responseWithOptionalFields.data;

  const contentType = normalizeMimeType(
    readHeaderValue(headers, "content-type") ??
      responseWithOptionalFields.contentType ??
      responseWithOptionalFields.mime_type ??
      data?.contentType ??
      data?.mime_type,
  );

  const disposition = readHeaderValue(headers, "content-disposition");
  const fileName =
    (disposition ? decodeDispositionFileName(disposition) : undefined) ??
    responseWithOptionalFields.file_name ??
    responseWithOptionalFields.fileName ??
    data?.file_name ??
    data?.fileName;

  return { contentType, fileName };
}

async function readFeishuResponseBytes(params: {
  response: unknown;
  tmpDirPrefix: string;
  errorPrefix: string;
}): Promise<Buffer> {
  const { response } = params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK response type
  const responseAny = response as any;
  if (responseAny.code !== undefined && responseAny.code !== 0) {
    throw new Error(`${params.errorPrefix}: ${responseAny.msg || `code ${responseAny.code}`}`);
  }

  if (Buffer.isBuffer(response)) {
    return response;
  }
  if (response instanceof ArrayBuffer) {
    return Buffer.from(response);
  }
  if (responseAny.data && Buffer.isBuffer(responseAny.data)) {
    return responseAny.data;
  }
  if (responseAny.data instanceof ArrayBuffer) {
    return Buffer.from(responseAny.data);
  }
  if (typeof responseAny.getReadableStream === "function") {
    const stream = responseAny.getReadableStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof responseAny.writeFile === "function") {
    return await withTempDownloadPath({ prefix: params.tmpDirPrefix }, async (tmpPath) => {
      await responseAny.writeFile(tmpPath);
      return await fs.promises.readFile(tmpPath);
    });
  }
  if (typeof responseAny[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of responseAny) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  if (typeof responseAny.read === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of responseAny as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  const keys = Object.keys(responseAny);
  const types = keys.map((k) => `${k}: ${typeof responseAny[k]}`).join(", ");
  throw new Error(`${params.errorPrefix}: unexpected response format. Keys: [${types}]`);
}

async function readFeishuResponsePayload(params: {
  response: unknown;
  tmpDirPrefix: string;
  errorPrefix: string;
}): Promise<{ buffer: Buffer; contentType?: string; fileName?: string }> {
  const buffer = await readFeishuResponseBytes(params);
  return { buffer, ...extractFeishuDownloadMetadata(params.response) };
}

/**
 * Download an image from Feishu using image_key.
 * Used for downloading images sent in messages.
 */
export async function downloadImageFeishu(params: {
  cfg: ClawdbotConfig;
  imageKey: string;
  accountId?: string;
}): Promise<DownloadImageResult> {
  const { cfg, imageKey, accountId } = params;
  const normalizedImageKey = normalizeFeishuExternalKey(imageKey);
  if (!normalizedImageKey) {
    throw new Error("Feishu image download failed: invalid image_key");
  }
  const { client } = createConfiguredFeishuMediaClient({ cfg, accountId });

  const response = await client.im.image.get({
    path: { image_key: normalizedImageKey },
  });

  const { buffer, contentType } = await readFeishuResponsePayload({
    response,
    tmpDirPrefix: "remoteclaw-feishu-img-",
    errorPrefix: "Feishu image download failed",
  });
  return { buffer, contentType };
}

/**
 * Download a message resource (file/image/audio/video) from Feishu.
 * Used for downloading files, audio, and video from messages.
 */
export async function downloadMessageResourceFeishu(params: {
  cfg: ClawdbotConfig;
  messageId: string;
  fileKey: string;
  type: "image" | "file";
  accountId?: string;
}): Promise<DownloadMessageResourceResult> {
  const { cfg, messageId, fileKey, type, accountId } = params;
  const normalizedFileKey = normalizeFeishuExternalKey(fileKey);
  if (!normalizedFileKey) {
    throw new Error("Feishu message resource download failed: invalid file_key");
  }
  const { client } = createConfiguredFeishuMediaClient({ cfg, accountId });

  const response = await client.im.messageResource.get({
    path: { message_id: messageId, file_key: normalizedFileKey },
    params: { type },
  });

  const { buffer, contentType, fileName } = await readFeishuResponsePayload({
    response,
    tmpDirPrefix: "remoteclaw-feishu-resource-",
    errorPrefix: "Feishu message resource download failed",
  });
  return { buffer, contentType, fileName };
}

export type UploadImageResult = {
  imageKey: string;
};

export type UploadFileResult = {
  fileKey: string;
};

export type SendMediaResult = {
  messageId: string;
  chatId: string;
};

/**
 * Upload an image to Feishu and get an image_key for sending.
 * Supports: JPEG, PNG, WEBP, GIF, TIFF, BMP, ICO
 */
export async function uploadImageFeishu(params: {
  cfg: ClawdbotConfig;
  image: Buffer | string; // Buffer or file path
  imageType?: "message" | "avatar";
  accountId?: string;
}): Promise<UploadImageResult> {
  const { cfg, image, imageType = "message", accountId } = params;
  const { client } = createConfiguredFeishuMediaClient({ cfg, accountId });

  // SDK accepts Buffer directly or fs.ReadStream for file paths
  // Using Readable.from(buffer) causes issues with form-data library
  // See: https://github.com/larksuite/node-sdk/issues/121
  const imageData = typeof image === "string" ? fs.createReadStream(image) : image;

  const response = await client.im.image.create({
    data: {
      image_type: imageType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK accepts Buffer or ReadStream
      image: imageData as any,
    },
  });

  return {
    imageKey: extractFeishuUploadKey(response, {
      key: "image_key",
      errorPrefix: "Feishu image upload failed",
    }),
  };
}

/**
 * Sanitize a filename for safe use in Feishu multipart/form-data uploads.
 * Strips control characters and multipart-injection vectors (CWE-93) while
 * preserving the original UTF-8 display name (Chinese, emoji, etc.).
 *
 * Previous versions percent-encoded non-ASCII characters, but the Feishu
 * `im.file.create` API uses `file_name` as a literal display name — it does
 * NOT decode percent-encoding — so encoded filenames appeared as garbled text
 * in chat (regression in v2026.3.2).
 */
export function sanitizeFileNameForUpload(fileName: string): string {
  return fileName.replace(/[\x00-\x1F\x7F\r\n"\\]/g, "_");
}

/**
 * Upload a file to Feishu and get a file_key for sending.
 * Max file size: 30MB
 */
export async function uploadFileFeishu(params: {
  cfg: ClawdbotConfig;
  file: Buffer | string; // Buffer or file path
  fileName: string;
  fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
  duration?: number; // Required for audio/video files, in milliseconds
  accountId?: string;
}): Promise<UploadFileResult> {
  const { cfg, file, fileName, fileType, duration, accountId } = params;
  const { client } = createConfiguredFeishuMediaClient({ cfg, accountId });

  // SDK accepts Buffer directly or fs.ReadStream for file paths
  // Using Readable.from(buffer) causes issues with form-data library
  // See: https://github.com/larksuite/node-sdk/issues/121
  const fileData = typeof file === "string" ? fs.createReadStream(file) : file;

  const safeFileName = sanitizeFileNameForUpload(fileName);

  const response = await client.im.file.create({
    data: {
      file_type: fileType,
      file_name: safeFileName,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK accepts Buffer or ReadStream
      file: fileData as any,
      ...(duration !== undefined && { duration }),
    },
  });

  return {
    fileKey: extractFeishuUploadKey(response, {
      key: "file_key",
      errorPrefix: "Feishu file upload failed",
    }),
  };
}

/**
 * Send an image message using an image_key
 */
export async function sendImageFeishu(params: {
  cfg: ClawdbotConfig;
  to: string;
  imageKey: string;
  replyToMessageId?: string;
  replyInThread?: boolean;
  accountId?: string;
}): Promise<SendMediaResult> {
  const { cfg, to, imageKey, replyToMessageId, replyInThread, accountId } = params;
  const { client, receiveId, receiveIdType } = resolveFeishuSendTarget({
    cfg,
    to,
    accountId,
  });
  const content = JSON.stringify({ image_key: imageKey });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "image",
        ...(replyInThread ? { reply_in_thread: true } : {}),
      },
    });
    assertFeishuMessageApiSuccess(response, "Feishu image reply failed");
    return toFeishuSendResult(response, receiveId);
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: "image",
    },
  });
  assertFeishuMessageApiSuccess(response, "Feishu image send failed");
  return toFeishuSendResult(response, receiveId);
}

/**
 * Send a file message using a file_key
 */
export async function sendFileFeishu(params: {
  cfg: ClawdbotConfig;
  to: string;
  fileKey: string;
  /** Use "audio" for audio, "media" for video (mp4), "file" for documents */
  msgType?: "file" | "audio" | "media";
  replyToMessageId?: string;
  replyInThread?: boolean;
  accountId?: string;
}): Promise<SendMediaResult> {
  const { cfg, to, fileKey, replyToMessageId, replyInThread, accountId } = params;
  const msgType = params.msgType ?? "file";
  const { client, receiveId, receiveIdType } = resolveFeishuSendTarget({
    cfg,
    to,
    accountId,
  });
  const content = JSON.stringify({ file_key: fileKey });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: msgType,
        ...(replyInThread ? { reply_in_thread: true } : {}),
      },
    });
    assertFeishuMessageApiSuccess(response, "Feishu file reply failed");
    return toFeishuSendResult(response, receiveId);
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: msgType,
    },
  });
  assertFeishuMessageApiSuccess(response, "Feishu file send failed");
  return toFeishuSendResult(response, receiveId);
}

/**
 * Helper to detect file type from extension
 */
export function detectFileType(
  fileName: string,
): "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream" {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".opus":
    case ".ogg":
      return "opus";
    case ".mp4":
    case ".mov":
    case ".avi":
      return "mp4";
    case ".pdf":
      return "pdf";
    case ".doc":
    case ".docx":
      return "doc";
    case ".xls":
    case ".xlsx":
      return "xls";
    case ".ppt":
    case ".pptx":
      return "ppt";
    default:
      return "stream";
  }
}

const FEISHU_IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".ico", ".tiff"];

/**
 * Pick the Feishu upload `file_type` and message `msg_type` for outbound media.
 *
 * Classification prefers the resolved MIME type and falls back to the filename
 * extension, because callers frequently supply media with a valid content-type
 * but no usable extension (the name degrades to the literal "file").
 */
function resolveFeishuOutboundMediaKind(params: { fileName: string; contentType?: string }): {
  fileType?: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
  msgType: "image" | "file" | "audio" | "media";
} {
  const { fileName } = params;
  const contentType = normalizeMimeType(params.contentType);
  const ext = normalizeLowercaseStringOrEmpty(path.extname(fileName));
  const mimeKind = mediaKindFromMime(contentType);

  if (FEISHU_IMAGE_EXTS.includes(ext) || mimeKind === "image") {
    return { msgType: "image" };
  }

  if (
    ext === ".opus" ||
    ext === ".ogg" ||
    contentType === "audio/ogg" ||
    contentType === "audio/opus"
  ) {
    return { fileType: "opus", msgType: "audio" };
  }

  if (
    [".mp4", ".mov", ".avi"].includes(ext) ||
    contentType === "video/mp4" ||
    contentType === "video/quicktime" ||
    contentType === "video/x-msvideo"
  ) {
    return { fileType: "mp4", msgType: "media" };
  }

  // Feishu has no native file_type for other audio/video codecs (mp3, wav, ...),
  // so they intentionally degrade to a generic "stream" file attachment.
  const fileType = detectFileType(fileName);
  return {
    fileType,
    msgType: fileType === "opus" ? "audio" : fileType === "mp4" ? "media" : "file",
  };
}

/** Ogg/Opus is the only container Feishu renders as a native voice bubble. */
function isFeishuNativeVoiceAudio(params: { fileName: string; contentType?: string }): boolean {
  const ext = normalizeLowercaseStringOrEmpty(path.extname(params.fileName));
  const contentType = normalizeMimeType(params.contentType);
  return (
    ext === ".opus" || ext === ".ogg" || contentType === "audio/ogg" || contentType === "audio/opus"
  );
}

function isLikelyTranscodableAudio(params: { fileName: string; contentType?: string }): boolean {
  const ext = normalizeLowercaseStringOrEmpty(path.extname(params.fileName));
  return (
    FEISHU_TRANSCODABLE_AUDIO_EXTS.has(ext) ||
    mediaKindFromMime(normalizeMimeType(params.contentType)) === "audio"
  );
}

async function transcodeToFeishuVoiceOpus(params: {
  buffer: Buffer;
  fileName: string;
}): Promise<{ buffer: Buffer; fileName: string; contentType: string }> {
  const buffer = await transcodeAudioBufferToOpus({
    audioBuffer: params.buffer,
    inputFileName: params.fileName,
    tempPrefix: "feishu-voice-",
    outputFileName: FEISHU_VOICE_FILE_NAME,
    sampleRateHz: FEISHU_VOICE_SAMPLE_RATE_HZ,
    bitrate: FEISHU_VOICE_BITRATE,
  });
  return { buffer, fileName: FEISHU_VOICE_FILE_NAME, contentType: "audio/ogg" };
}

/**
 * Transcode compatible audio to Ogg/Opus when the caller asked for a voice
 * bubble. Media that is already Ogg/Opus needs no work, and anything that is
 * not transcodable audio (or that ffmpeg cannot convert) falls through to its
 * normal attachment routing rather than failing the send.
 */
async function prepareFeishuVoiceMedia(params: {
  buffer: Buffer;
  fileName: string;
  contentType?: string;
  audioAsVoice?: boolean;
}): Promise<{ buffer: Buffer; fileName: string; contentType?: string }> {
  const { buffer, fileName, contentType, audioAsVoice } = params;
  const unchanged = { buffer, fileName, contentType };

  if (isFeishuNativeVoiceAudio({ fileName, contentType })) {
    return unchanged;
  }
  if (audioAsVoice !== true || !isLikelyTranscodableAudio({ fileName, contentType })) {
    return unchanged;
  }
  try {
    return await transcodeToFeishuVoiceOpus({ buffer, fileName });
  } catch (err) {
    console.warn(
      `[feishu] audioAsVoice transcode failed; sending ${fileName} as a file attachment:`,
      err,
    );
    return unchanged;
  }
}

/**
 * Upload and send media (image or file) from URL, local path, or buffer.
 * When mediaUrl is a local path, mediaLocalRoots (from core outbound context)
 * must be passed so loadWebMedia allows the path (post CVE-2026-26321).
 */
export async function sendMediaFeishu(params: {
  cfg: ClawdbotConfig;
  to: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  fileName?: string;
  replyToMessageId?: string;
  replyInThread?: boolean;
  accountId?: string;
  /** Allowed roots for local path reads; required for local filePath to work. */
  mediaLocalRoots?: readonly string[];
  /** When true, transcode compatible audio to Feishu native Ogg/Opus voice bubbles. */
  audioAsVoice?: boolean;
}): Promise<SendMediaResult> {
  const {
    cfg,
    to,
    mediaUrl,
    mediaBuffer,
    fileName,
    replyToMessageId,
    replyInThread,
    accountId,
    mediaLocalRoots,
    audioAsVoice,
  } = params;
  const account = resolveFeishuAccount({ cfg, accountId });
  if (!account.configured) {
    throw new Error(`Feishu account "${account.accountId}" not configured`);
  }
  const mediaMaxBytes = (account.config?.mediaMaxMb ?? 30) * 1024 * 1024;

  let buffer: Buffer;
  let name: string;
  let contentType: string | undefined;

  if (mediaBuffer) {
    buffer = mediaBuffer;
    name = fileName ?? "file";
  } else if (mediaUrl) {
    const loaded = await getFeishuRuntime().media.loadWebMedia(mediaUrl, {
      maxBytes: mediaMaxBytes,
      optimizeImages: false,
      localRoots: mediaLocalRoots?.length ? mediaLocalRoots : undefined,
    });
    buffer = loaded.buffer;
    name = fileName ?? loaded.fileName ?? "file";
    contentType = loaded.contentType;
  } else {
    throw new Error("Either mediaUrl or mediaBuffer must be provided");
  }

  const prepared = await prepareFeishuVoiceMedia({
    buffer,
    fileName: name,
    contentType,
    audioAsVoice,
  });

  const routing = resolveFeishuOutboundMediaKind({
    fileName: prepared.fileName,
    contentType: prepared.contentType,
  });

  if (routing.msgType === "image") {
    const { imageKey } = await uploadImageFeishu({ cfg, image: prepared.buffer, accountId });
    return sendImageFeishu({ cfg, to, imageKey, replyToMessageId, replyInThread, accountId });
  }

  const { fileKey } = await uploadFileFeishu({
    cfg,
    file: prepared.buffer,
    fileName: prepared.fileName,
    fileType: routing.fileType ?? "stream",
    accountId,
  });
  return sendFileFeishu({
    cfg,
    to,
    fileKey,
    msgType: routing.msgType,
    replyToMessageId,
    replyInThread,
    accountId,
  });
}
