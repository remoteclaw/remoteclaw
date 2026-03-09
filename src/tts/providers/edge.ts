import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { resolvePreferredRemoteClawTmpDir } from "../../infra/tmp-remoteclaw-dir.js";
import { edgeTTS, inferEdgeExtension } from "../tts-core.js";
import type { TtsProviderImpl } from "../types.js";

type EdgeExtras = {
  voice?: string;
  lang?: string;
  outputFormat?: string;
  pitch?: string;
  rate?: string;
  volume?: string;
  saveSubtitles?: boolean;
  proxy?: string;
};

export const edgeTtsProvider: TtsProviderImpl = {
  id: "edge",
  requiresApiKey: false,
  synthesize: async (req) => {
    const extras = (req.extras ?? {}) as EdgeExtras;
    const outputFormat = extras.outputFormat ?? "audio-24khz-48kbitrate-mono-mp3";
    const tempRoot = resolvePreferredRemoteClawTmpDir();
    mkdirSync(tempRoot, { recursive: true, mode: 0o700 });
    const tempDir = mkdtempSync(path.join(tempRoot, "tts-"));
    const extension = inferEdgeExtension(outputFormat);
    const audioPath = path.join(tempDir, `voice-${Date.now()}${extension}`);

    try {
      await edgeTTS({
        text: req.text,
        outputPath: audioPath,
        config: {
          voice: extras.voice ?? "en-US-MichelleNeural",
          lang: extras.lang ?? "en-US",
          outputFormat,
          outputFormatConfigured: false,
          saveSubtitles: extras.saveSubtitles ?? false,
          proxy: extras.proxy,
          pitch: extras.pitch,
          rate: extras.rate,
          volume: extras.volume,
          enabled: true,
        },
        timeoutMs: req.timeoutMs,
      });
      const audioBuffer = readFileSync(audioPath);
      return { audioBuffer, format: outputFormat };
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  },
};
