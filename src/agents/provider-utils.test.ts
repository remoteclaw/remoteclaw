import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { isCliProvider } from "./provider-utils.js";

describe("isCliProvider", () => {
  it("recognizes legacy CLI provider names", () => {
    expect(isCliProvider("claude-cli")).toBe(true);
    expect(isCliProvider("codex-cli")).toBe(true);
  });

  it("recognizes agent runtime names as CLI providers", () => {
    expect(isCliProvider("claude")).toBe(true);
    expect(isCliProvider("gemini")).toBe(true);
    expect(isCliProvider("codex")).toBe(true);
    expect(isCliProvider("opencode")).toBe(true);
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
