import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { applyOnboardAuthAgentModelsAndProviders } from "./onboard-auth.config-shared.js";

// Model management defaults gutted in RemoteClaw — CLI runtimes own model selection.
function resolveAgentModelPrimaryValue(model: unknown): string | undefined {
  if (typeof model === "string") {
    const trimmed = model.trim();
    return trimmed || undefined;
  }
  if (!model || typeof model !== "object") {
    return undefined;
  }
  const primary = (model as { primary?: unknown }).primary;
  if (typeof primary !== "string") {
    return undefined;
  }
  const trimmed = primary.trim();
  return trimmed || undefined;
}

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
          model: { primary: "some/model" },
        },
      },
    };
    const agentModels = {
      "custom/model-b": { alias: "Custom" },
    };
    const result = applyOnboardAuthAgentModelsAndProviders(cfg, { agentModels });
    expect(result.agents?.defaults?.models).toEqual(agentModels);
    expect(resolveAgentModelPrimaryValue(result.agents?.defaults?.model)).toBe("some/model");
  });
});
