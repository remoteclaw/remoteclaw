import type { RemoteClawConfig } from "../../config/config.js";
import type { AuthProfileStore } from "./types.js";

export function formatAuthDoctorHint(_params: {
  cfg?: RemoteClawConfig;
  store: AuthProfileStore;
  provider: string;
  profileId?: string;
}): string {
  return "";
}
