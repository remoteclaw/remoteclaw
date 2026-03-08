import type { SttProvider } from "../../types.js";
import { transcribeOpenAiCompatibleAudio } from "../openai/audio.js";

const DEFAULT_GROQ_AUDIO_BASE_URL = "https://api.groq.com/openai/v1";

export const groqSttProvider: SttProvider = {
  id: "groq",
  transcribeAudio: (req) =>
    transcribeOpenAiCompatibleAudio({
      ...req,
      baseUrl: req.baseUrl ?? DEFAULT_GROQ_AUDIO_BASE_URL,
    }),
};
