import type { SttProvider } from "../../types.js";
import { transcribeGeminiAudio } from "./audio.js";

export const googleSttProvider: SttProvider = {
  id: "google",
  transcribeAudio: transcribeGeminiAudio,
};
