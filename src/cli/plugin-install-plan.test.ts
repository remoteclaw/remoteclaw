import { describe, expect, it, vi } from "vitest";
import { resolveBundledInstallPlanForCatalogEntry } from "./plugin-install-plan.js";

describe("plugin install plan helpers", () => {
  it("prefers bundled catalog plugin by id before npm spec", () => {
    const findBundledSource = vi
      .fn()
      .mockImplementation(({ kind, value }: { kind: "pluginId" | "npmSpec"; value: string }) => {
        if (kind === "pluginId" && value === "voice-call") {
          return {
            pluginId: "voice-call",
            localPath: "/tmp/extensions/voice-call",
            npmSpec: "@remoteclaw/voice-call",
          };
        }
        return undefined;
      });

    const result = resolveBundledInstallPlanForCatalogEntry({
      pluginId: "voice-call",
      npmSpec: "@remoteclaw/voice-call",
      findBundledSource,
    });

    expect(findBundledSource).toHaveBeenCalledWith({ kind: "pluginId", value: "voice-call" });
    expect(result?.bundledSource.localPath).toBe("/tmp/extensions/voice-call");
  });

  it("rejects npm-spec matches that resolve to a different plugin id", () => {
    const findBundledSource = vi
      .fn()
      .mockImplementation(({ kind }: { kind: "pluginId" | "npmSpec"; value: string }) => {
        if (kind === "npmSpec") {
          return {
            pluginId: "not-voice-call",
            localPath: "/tmp/extensions/not-voice-call",
            npmSpec: "@remoteclaw/voice-call",
          };
        }
        return undefined;
      });

    const result = resolveBundledInstallPlanForCatalogEntry({
      pluginId: "voice-call",
      npmSpec: "@remoteclaw/voice-call",
      findBundledSource,
    });

    expect(result).toBeNull();
  });
});
