import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  applyOnboardingLocalWorkspaceConfig,
  ONBOARDING_DEFAULT_DM_SCOPE,
  ONBOARDING_DEFAULT_TOOLS_PROFILE,
} from "./onboard-config.js";

describe("applyOnboardingLocalWorkspaceConfig", () => {
  it("defaults local onboarding tool profile to coding", () => {
    expect(ONBOARDING_DEFAULT_TOOLS_PROFILE).toBe("coding");
  });

  it("sets secure dmScope default when unset", () => {
    const baseConfig: RemoteClawConfig = {};
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe(ONBOARDING_DEFAULT_DM_SCOPE);
    expect(result.gateway?.mode).toBe("local");
    expect(result.agents?.defaults?.workspace).toBe("/tmp/workspace");
    expect(result.tools?.profile).toBe(ONBOARDING_DEFAULT_TOOLS_PROFILE);
  });

  it("preserves existing dmScope when already configured", () => {
    const baseConfig: RemoteClawConfig = {
      session: {
        dmScope: "main",
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe("main");
  });

  it("preserves explicit non-main dmScope values", () => {
    const baseConfig: RemoteClawConfig = {
      session: {
        dmScope: "per-account-channel-peer",
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe("per-account-channel-peer");
  });

  it("preserves an explicit tools.profile when already configured", () => {
    const baseConfig: RemoteClawConfig = {
      tools: {
        profile: "full",
      },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.tools?.profile).toBe("full");
  });

  it("preserves agents.list and bindings on onboard rerun (remoteclaw#84692)", () => {
    const baseConfig: RemoteClawConfig = {
      agents: {
        list: [
          { id: "alpha", model: "anthropic/claude-3-5-sonnet" },
          { id: "beta", model: "openai/gpt-4o" },
        ],
      },
      bindings: [
        {
          type: "route",
          agentId: "alpha",
          match: { channel: "discord", peer: { kind: "direct", id: "user-1" } },
        },
      ],
    } as RemoteClawConfig;

    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.agents?.list).toHaveLength(2);
    expect(result.agents?.list?.map((a) => a.id)).toEqual(["alpha", "beta"]);
    expect(result.bindings).toEqual(baseConfig.bindings);
  });
});
