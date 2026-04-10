import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  applyOnboardingLocalWorkspaceConfig,
  ONBOARDING_DEFAULT_DM_SCOPE,
} from "./onboard-config.js";

describe("applyOnboardingLocalWorkspaceConfig", () => {
  it("sets secure dmScope default when unset", () => {
    const baseConfig: RemoteClawConfig = {};
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.session?.dmScope).toBe(ONBOARDING_DEFAULT_DM_SCOPE);
    expect(result.gateway?.mode).toBe("local");
    // Workspace is set per-agent in the agents.list, not in agents.defaults
    const agentList = result.agents?.list;
    expect(Array.isArray(agentList)).toBe(true);
    expect(agentList).toEqual(
      expect.arrayContaining([expect.objectContaining({ workspace: "/tmp/workspace" })]),
    );
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

  it("preserves other config sections when applying onboarding", () => {
    const baseConfig: RemoteClawConfig = {
      gateway: { mode: "local" },
    };
    const result = applyOnboardingLocalWorkspaceConfig(baseConfig, "/tmp/workspace");

    expect(result.gateway?.mode).toBe("local");
  });
});
