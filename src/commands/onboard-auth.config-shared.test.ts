import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { applyOnboardAuthAgentModelsAndProviders } from "./onboard-auth.config-shared.js";

describe("applyOnboardAuthAgentModelsAndProviders", () => {
  it("sets agent default models from provided map", () => {
    const cfg: RemoteClawConfig = {};
    const agentModels = {
      "custom/model-a": {},
    };
    const result = applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels });
    expect(result.agents?.defaults?.models).toEqual(agentModels);
  });

  it("preserves existing config fields while setting agent models", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: {
          runtime: "claude",
        },
      },
    };
    const agentModels = {
      "custom/model-b": { alias: "Custom" },
    };
    const result = applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels });
    expect(result.agents?.defaults?.models).toEqual(agentModels);
    expect(result.agents?.defaults?.runtime).toBe("claude");
  });
});
