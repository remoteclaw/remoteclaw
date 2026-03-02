import { describe, expect, it } from "vitest";
import { normalizePluginsConfig, resolveEffectiveEnableState } from "./config-state.js";

describe("resolveEffectiveEnableState", () => {
  it("enables bundled channels when channels.<id>.enabled=true", () => {
    const normalized = normalizePluginsConfig({
      enabled: true,
    });
    const state = resolveEffectiveEnableState({
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
    expect(state).toEqual({ enabled: true });
  });

  it("keeps explicit plugin-level disable authoritative", () => {
    const normalized = normalizePluginsConfig({
      enabled: true,
      entries: {
        telegram: {
          enabled: false,
        },
      },
    });
    const state = resolveEffectiveEnableState({
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
    expect(state).toEqual({ enabled: false, reason: "disabled in config" });
  });
});
