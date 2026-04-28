import { loadConfig, type RemoteClawConfig } from "../config/config.js";

type LoggingConfig = RemoteClawConfig["logging"];

export function readLoggingConfig(): LoggingConfig | undefined {
  try {
    const parsed = loadConfig();
    const logging = parsed?.logging;
    if (!logging || typeof logging !== "object" || Array.isArray(logging)) {
      return undefined;
    }
    return logging as LoggingConfig;
  } catch {
    return undefined;
  }
}
