import type { SttProvider } from "../../types.js";
import { transcribeDeepgramAudio } from "./audio.js";

export const deepgramSttProvider: SttProvider = {
  id: "deepgram",
  transcribeAudio: transcribeDeepgramAudio,
};
