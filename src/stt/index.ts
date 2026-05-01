export {
  buildSttProviderRegistry,
  resolveProviderQuery,
  transcribeAudioWithProvider,
} from "./stt.js";
export type { SttProviderRegistry, TranscribeAudioParams } from "./stt.js";
export type { AudioTranscriptionRequest, AudioTranscriptionResult, SttProvider } from "./types.js";
export { AUTO_AUDIO_KEY_PROVIDERS, DEFAULT_AUDIO_MODELS } from "./defaults.js";
