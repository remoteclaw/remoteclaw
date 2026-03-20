import { openaiTTS } from "../tts-core.js";
import type { TtsProviderImpl } from "../types.js";

export const openaiTtsProvider: TtsProviderImpl = {
  id: "openai",
  requiresApiKey: true,
  synthesize: async (req) => {
    const format = (req.outputFormat ?? "mp3") as "mp3" | "opus" | "pcm";
    const buffer = await openaiTTS({
      text: req.text,
      apiKey: req.apiKey!,
      baseUrl: req.baseUrl ?? "https://api.openai.com/v1",
      model: req.model ?? "gpt-4o-mini-tts",
      voice: req.voice ?? "alloy",
      responseFormat: format,
      timeoutMs: req.timeoutMs,
    });
    const sampleRate = format === "pcm" ? 24000 : undefined;
    return { audioBuffer: buffer, format, sampleRate };
  },
};
