import { describe, expect, it } from "vitest";
import { normalizePluginsConfig, resolveEffectiveEnableState } from "./config-state.js";

describe("normalizePluginsConfig", () => {
  it("returns empty slots record", () => {
    const result = normalizePluginsConfig({});
    expect(result.slots).toEqual({});
  });
});

describe("resolveEffectiveEnableState", () => {
  function resolveBundledTelegramState(config: Parameters<typeof normalizePluginsConfig>[0]) {
    const normalized = normalizePluginsConfig(config);
    return resolveEffectiveEnableState({
      id: "telegram",
      origin: "bundled",
      config: normalized,
      rootConfig: {
        channels: {
          telegram: {
            enabled: true,
          },
        },
      },
    });
  }

  it("enables bundled channels when channels.<id>.enabled=true", () => {
    const state = resolveBundledTelegramState({
      enabled: true,
    });
    expect(state).toEqual({ enabled: true });
  });

  it("keeps explicit plugin-level disable authoritative", () => {
    const state = resolveBundledTelegramState({
      enabled: true,
      entries: {
        telegram: {
          enabled: false,
        },
      },
    });
    expect(state).toEqual({ enabled: false, reason: "disabled in config" });
  });
});
