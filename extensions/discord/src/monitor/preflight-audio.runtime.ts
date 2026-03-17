import { transcribeFirstAudio as transcribeFirstAudioImpl } from "remoteclaw/plugin-sdk/media-runtime";

type TranscribeFirstAudio = typeof import("remoteclaw/plugin-sdk/media-runtime").transcribeFirstAudio;

export async function transcribeFirstAudio(
  ...args: Parameters<TranscribeFirstAudio>
): ReturnType<TranscribeFirstAudio> {
  return await transcribeFirstAudioImpl(...args);
}
