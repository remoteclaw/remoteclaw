import type { RemoteClawConfig } from "../../config/config.js";

export function createPerSenderSessionConfig(
  overrides: Partial<NonNullable<RemoteClawConfig["session"]>> = {},
): NonNullable<RemoteClawConfig["session"]> {
  return {
    mainKey: "main",
    scope: "per-sender",
    ...overrides,
  };
}
