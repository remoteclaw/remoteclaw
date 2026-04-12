import type { RemoteClawConfig } from "../config/config.js";
import { applyAgentDefaultPrimaryModel } from "./model-default.js";

export const GOOGLE_GEMINI_DEFAULT_MODEL = "google/gemini-3.1-pro-preview";

export async function applyGoogleGeminiModelDefault(cfg: RemoteClawConfig): Promise<{
  next: RemoteClawConfig;
  changed: boolean;
}> {
  return applyAgentDefaultPrimaryModel({ cfg, model: GOOGLE_GEMINI_DEFAULT_MODEL });
}
