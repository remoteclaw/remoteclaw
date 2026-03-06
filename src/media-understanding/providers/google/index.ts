import type { MediaUnderstandingProvider } from "../../types.js";
import { transcribeGeminiAudio } from "./audio.js";
import { describeGeminiVideo } from "./video.js";

export const googleProvider: MediaUnderstandingProvider = {
  id: "google",
  capabilities: ["audio", "video"],
  transcribeAudio: transcribeGeminiAudio,
  describeVideo: describeGeminiVideo,
};
