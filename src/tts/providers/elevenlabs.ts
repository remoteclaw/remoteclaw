import { elevenLabsTTS } from "../tts-core.js";
import type { TtsProviderImpl } from "../types.js";

const DEFAULT_BASE_URL = "https://api.elevenlabs.io";
const DEFAULT_VOICE_ID = "pMsXgVXv3BLzUgSXRplE";
const DEFAULT_MODEL_ID = "eleven_multilingual_v2";

const DEFAULT_VOICE_SETTINGS = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.0,
  useSpeakerBoost: true,
  speed: 1.0,
};

type ElevenLabsExtras = {
  baseUrl?: string;
  voiceId?: string;
  seed?: number;
  applyTextNormalization?: "auto" | "on" | "off";
  languageCode?: string;
  voiceSettings?: {
    stability: number;
    similarityBoost: number;
    style: number;
    useSpeakerBoost: boolean;
    speed: number;
  };
};

export const elevenLabsTtsProvider: TtsProviderImpl = {
  id: "elevenlabs",
  requiresApiKey: true,
  synthesize: async (req) => {
    const extras = (req.extras ?? {}) as ElevenLabsExtras;
    const outputFormat = req.outputFormat ?? "mp3_44100_128";
    const buffer = await elevenLabsTTS({
      text: req.text,
      apiKey: req.apiKey!,
      baseUrl: extras.baseUrl ?? DEFAULT_BASE_URL,
      voiceId: extras.voiceId ?? DEFAULT_VOICE_ID,
      modelId: req.model ?? DEFAULT_MODEL_ID,
      outputFormat,
      seed: extras.seed,
      applyTextNormalization: extras.applyTextNormalization,
      languageCode: extras.languageCode,
      voiceSettings: extras.voiceSettings ?? DEFAULT_VOICE_SETTINGS,
      timeoutMs: req.timeoutMs,
    });
    const sampleRate = outputFormat.startsWith("pcm_")
      ? Number.parseInt(outputFormat.split("_")[1], 10)
      : undefined;
    return { audioBuffer: buffer, format: outputFormat, sampleRate };
  },
};
