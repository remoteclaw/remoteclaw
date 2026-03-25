import { describe, expect, it } from "vitest";
import {
  normalizePluginsConfig,
  resolveEffectiveEnableState,
  resolveEnableState,
} from "./config-state.js";

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

describe("resolveEnableState", () => {
  it("keeps the selected memory slot plugin enabled even when omitted from plugins.allow", () => {
    const state = resolveEnableState(
      "memory-core",
      "bundled",
      normalizePluginsConfig({
        allow: ["telegram"],
        slots: { memory: "memory-core" },
      }),
    );
    expect(state).toEqual({ enabled: true });
  });

  it("keeps explicit disable authoritative for the selected memory slot plugin", () => {
    const state = resolveEnableState(
      "memory-core",
      "bundled",
      normalizePluginsConfig({
        allow: ["telegram"],
        slots: { memory: "memory-core" },
        entries: {
          "memory-core": {
            enabled: false,
          },
        },
      }),
    );
    expect(state).toEqual({ enabled: false, reason: "disabled in config" });
  });
});
