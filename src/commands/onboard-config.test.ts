import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  applyOnboardingLocalWorkspaceConfig,
  ONBOARDING_DEFAULT_DM_SCOPE,
  ONBOARDING_DEFAULT_TOOLS_PROFILE,
} from "./onboard-config.js";

describe("applyOnboardingLocalWorkspaceConfig", () => {
  it("sets secure dmScope default when unset", () => {
    const baseConfig: RemoteClawConfig = {};
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig);

    expect(result.session?.dmScope).toBe(ONBOARDING_DEFAULT_DM_SCOPE);
    expect(result.gateway?.mode).toBe("local");
    expect(result.tools?.profile).toBe(ONBOARDING_DEFAULT_TOOLS_PROFILE);
  });

  it("preserves existing dmScope when already configured", () => {
    const baseConfig: RemoteClawConfig = {
      session: {
        dmScope: "main",
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig);

    expect(result.session?.dmScope).toBe("main");
  });

  it("preserves explicit non-main dmScope values", () => {
    const baseConfig: RemoteClawConfig = {
      session: {
        dmScope: "per-account-channel-peer",
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig);

    expect(result.session?.dmScope).toBe("per-account-channel-peer");
  });

  it("preserves an explicit tools.profile when already configured", () => {
    const baseConfig: OpenClawConfig = {
      tools: {
        profile: "full",
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.tools?.profile).toBe("full");
  });
});
