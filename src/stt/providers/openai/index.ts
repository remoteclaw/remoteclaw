import type { SttProvider } from "../../types.js";
import { transcribeOpenAiCompatibleAudio } from "./audio.js";

export const openaiSttProvider: SttProvider = {
  id: "openai",
  transcribeAudio: transcribeOpenAiCompatibleAudio,
};
