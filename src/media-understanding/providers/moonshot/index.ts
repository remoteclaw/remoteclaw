import type { MediaUnderstandingProvider } from "../../types.js";
import { describeMoonshotVideo } from "./video.js";

export const moonshotProvider: MediaUnderstandingProvider = {
  id: "moonshot",
  capabilities: ["video"],
  describeVideo: describeMoonshotVideo,
};
