import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { isCliProvider, normalizeProviderId } from "./provider-utils.js";

describe("normalizeProviderId", () => {
  it("maps *-cli suffixed names to bare runtime names", () => {
    expect(normalizeProviderId("claude-cli")).toBe("claude");
    expect(normalizeProviderId("codex-cli")).toBe("codex");
  });

  it("passes through bare runtime names unchanged", () => {
    expect(normalizeProviderId("claude")).toBe("claude");
    expect(normalizeProviderId("codex")).toBe("codex");
    expect(normalizeProviderId("gemini")).toBe("gemini");
    expect(normalizeProviderId("opencode")).toBe("opencode");
  });
});

describe("isCliProvider", () => {
  it("recognizes agent runtime names as CLI providers", () => {
    expect(isCliProvider("claude")).toBe(true);
    expect(isCliProvider("gemini")).toBe(true);
    expect(isCliProvider("codex")).toBe(true);
    expect(isCliProvider("opencode")).toBe(true);
  });

  it("normalizes -cli suffixed names to bare runtime names", () => {
    expect(isCliProvider("claude-cli")).toBe(true);
    expect(isCliProvider("codex-cli")).toBe(true);
  });

  it("recognizes cliBackends entries", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: {
          cliBackends: {
            "custom-cli": { command: "custom" },
          },
        },
      },
    };
    expect(isCliProvider("custom-cli", cfg)).toBe(true);
  });

  it("returns false for unknown providers", () => {
    expect(isCliProvider("unknown")).toBe(false);
    expect(isCliProvider("some-api")).toBe(false);
  });
});
