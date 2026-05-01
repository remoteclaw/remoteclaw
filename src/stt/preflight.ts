import fs from "node:fs/promises";
import path from "node:path";
import { resolveApiKeyForProvider } from "../auth/provider-auth.js";
import type { MsgContext } from "../auto-reply/templating.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { MediaUnderstandingModelConfig } from "../config/types.tools.js";
import { logVerbose, shouldLogVerbose } from "../globals.js";
import { fetchRemoteMedia } from "../media/fetch.js";
import { isAudioFileName } from "../media/mime.js";
import { AUTO_AUDIO_KEY_PROVIDERS, DEFAULT_AUDIO_MODELS } from "./defaults.js";
import { buildSttProviderRegistry, getSttProvider } from "./providers/index.js";
import { transcribeAudioWithProvider } from "./stt.js";
import type { SttProvider } from "./types.js";

/**
 * Transcribes the first audio attachment BEFORE mention checking.
 * This allows voice notes to be processed in group chats with requireMention: true.
 * Returns the transcript or undefined if transcription fails or no audio is found.
 */
export async function transcribeFirstAudio(params: {
  ctx: MsgContext;
  cfg: RemoteClawConfig;
  agentDir?: string;
  providers?: Record<string, SttProvider>;
}): Promise<string | undefined> {
  const { ctx, cfg } = params;

  // Check if audio transcription is enabled in config
  const audioConfig = cfg.tools?.media?.audio;
  if (!audioConfig || audioConfig.enabled === false) {
    return undefined;
  }

  // Find the first audio attachment
  const audio = findFirstAudio(ctx);
  if (!audio) {
    return undefined;
  }

  if (shouldLogVerbose()) {
    logVerbose(`audio-preflight: transcribing attachment for mention check`);
  }

  try {
    // Read the audio data
    const { buffer, fileName } = await readAudioAttachment(audio);

    // Resolve provider from config or auto-detect
    const entry = await resolveAudioEntry({
      cfg,
      config: audioConfig,
      providers: params.providers,
    });
    if (!entry) {
      if (shouldLogVerbose()) {
        logVerbose("audio-preflight: no STT provider available");
      }
      return undefined;
    }

    const providerRegistry = buildSttProviderRegistry(params.providers);
    const providerId = entry.provider ?? "";
    const timeoutMs = (audioConfig.timeoutSeconds ?? entry.timeoutSeconds ?? 30) * 1000;

    const result = await transcribeAudioWithProvider({
      buffer,
      fileName,
      mime: audio.mime,
      providerId,
      cfg,
      entry,
      config: audioConfig,
      agentDir: params.agentDir,
      providerRegistry,
      timeoutMs,
    });

    const text = result.text?.trim();
    if (!text) {
      return undefined;
    }

    if (shouldLogVerbose()) {
      logVerbose(`audio-preflight: transcribed ${text.length} chars`);
    }

    return text;
  } catch (err) {
    // Log but don't throw - let the message proceed with text-only mention check
    if (shouldLogVerbose()) {
      logVerbose(`audio-preflight: transcription failed: ${String(err)}`);
    }
    return undefined;
  }
}

type AudioAttachmentInfo = {
  path?: string;
  url?: string;
  mime?: string;
};

function findFirstAudio(ctx: MsgContext): AudioAttachmentInfo | undefined {
  const paths = Array.isArray(ctx.MediaPaths) ? ctx.MediaPaths : [];
  const urls = Array.isArray(ctx.MediaUrls) ? ctx.MediaUrls : [];
  const types = Array.isArray(ctx.MediaTypes) ? ctx.MediaTypes : [];

  const count = Math.max(paths.length, urls.length);
  for (let i = 0; i < count; i++) {
    const p = paths[i]?.trim();
    const u = urls[i]?.trim();
    const mime = types[i] ?? (count === 1 ? ctx.MediaType : undefined);
    if (
      mime?.toLowerCase().startsWith("audio/") ||
      (p && isAudioFileName(p)) ||
      (u && isAudioFileName(u))
    ) {
      return { path: p || undefined, url: u || undefined, mime };
    }
  }

  // Fall back to single MediaPath/MediaUrl
  const singlePath = ctx.MediaPath?.trim();
  const singleUrl = ctx.MediaUrl?.trim();
  const singleMime = ctx.MediaType;
  if (singlePath || singleUrl) {
    if (
      singleMime?.toLowerCase().startsWith("audio/") ||
      (singlePath && isAudioFileName(singlePath)) ||
      (singleUrl && isAudioFileName(singleUrl))
    ) {
      return { path: singlePath || undefined, url: singleUrl || undefined, mime: singleMime };
    }
  }

  return undefined;
}

async function readAudioAttachment(
  audio: AudioAttachmentInfo,
): Promise<{ buffer: Buffer; fileName: string }> {
  if (audio.path) {
    const buffer = await fs.readFile(audio.path);
    return { buffer, fileName: path.basename(audio.path) };
  }
  if (audio.url) {
    const fetched = await fetchRemoteMedia({ url: audio.url });
    return {
      buffer: fetched.buffer,
      fileName: fetched.fileName ?? "audio",
    };
  }
  throw new Error("Audio attachment has no path or URL");
}

async function resolveAudioEntry(params: {
  cfg: RemoteClawConfig;
  config: NonNullable<NonNullable<RemoteClawConfig["tools"]>["media"]>["audio"];
  providers?: Record<string, SttProvider>;
}): Promise<MediaUnderstandingModelConfig | null> {
  const { cfg, config } = params;

  // Use configured models first
  const models = config?.models;
  if (models && models.length > 0) {
    for (const entry of models) {
      if (entry.type === "cli") {
        continue;
      }
      if (entry.provider) {
        return entry;
      }
    }
  }

  // Auto-detect: try API key providers in priority order
  const providerRegistry = buildSttProviderRegistry(params.providers);
  for (const providerId of AUTO_AUDIO_KEY_PROVIDERS) {
    const provider = getSttProvider(providerId, providerRegistry);
    if (!provider) {
      continue;
    }
    try {
      await resolveApiKeyForProvider({ provider: providerId, cfg });
      return {
        type: "provider",
        provider: providerId,
        model: DEFAULT_AUDIO_MODELS[providerId],
      };
    } catch {
      // No API key for this provider
    }
  }

  return null;
}
