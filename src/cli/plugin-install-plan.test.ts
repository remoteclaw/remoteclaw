import { describe, expect, it, vi } from "vitest";
import { PLUGIN_INSTALL_ERROR_CODE } from "../plugins/install.js";
import {
  resolveBundledInstallPlanBeforeNpm,
  resolveBundledInstallPlanForNpmFailure,
} from "./plugin-install-plan.js";

describe("plugin install plan helpers", () => {
  it("prefers bundled plugin for bare plugin-id specs", () => {
    const findBundledSource = vi.fn().mockReturnValue({
      pluginId: "voice-call",
      localPath: "/tmp/extensions/voice-call",
      npmSpec: "@remoteclaw/voice-call",
    });

    const result = resolveBundledInstallPlanBeforeNpm({
      rawSpec: "voice-call",
      findBundledSource,
    });

    expect(findBundledSource).toHaveBeenCalledWith({ kind: "pluginId", value: "voice-call" });
    expect(result?.bundledSource.pluginId).toBe("voice-call");
    expect(result?.warning).toContain('bare install spec "voice-call"');
  });

  it("skips bundled pre-plan for scoped npm specs", () => {
    const findBundledSource = vi.fn();
    const result = resolveBundledInstallPlanBeforeNpm({
      rawSpec: "@remoteclaw/voice-call",
      findBundledSource,
    });

    expect(findBundledSource).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("uses npm-spec bundled fallback only for package-not-found", () => {
    const findBundledSource = vi.fn().mockReturnValue({
      pluginId: "voice-call",
      localPath: "/tmp/extensions/voice-call",
      npmSpec: "@remoteclaw/voice-call",
    });
    const result = resolveBundledInstallPlanForNpmFailure({
      rawSpec: "@remoteclaw/voice-call",
      code: PLUGIN_INSTALL_ERROR_CODE.NPM_PACKAGE_NOT_FOUND,
      findBundledSource,
    });

    expect(findBundledSource).toHaveBeenCalledWith({
      kind: "npmSpec",
      value: "@remoteclaw/voice-call",
    });
    expect(result?.warning).toContain("npm package unavailable");
  });

  it("skips fallback for non-not-found npm failures", () => {
    const findBundledSource = vi.fn();
    const result = resolveBundledInstallPlanForNpmFailure({
      rawSpec: "@remoteclaw/voice-call",
      code: "INSTALL_FAILED",
      findBundledSource,
    });

    expect(findBundledSource).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });
});
