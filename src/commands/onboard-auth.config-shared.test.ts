import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import type { AgentModelEntryConfig } from "../config/types.agent-defaults.js";
import type { ModelDefinitionConfig } from "../config/types.models.js";
import {
  applyProviderConfigWithDefaultModelPreset,
  applyProviderConfigWithModelCatalogPreset,
  applyProviderConfigWithDefaultModel,
  applyProviderConfigWithDefaultModels,
  applyProviderConfigWithModelCatalog,
  withAgentModelAliases,
} from "../plugins/provider-onboarding-config.js";

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

  it("preserves explicit aliases when adding provider alias presets", () => {
    expect(
      withAgentModelAliases(
        {
          "custom/model-a": { alias: "Pinned" },
        },
        [{ modelRef: "custom/model-a", alias: "Preset" }, "custom/model-b"],
      ),
    ).toEqual({
      "custom/model-a": { alias: "Pinned" },
      "custom/model-b": {},
    });
  });

  it("applies default-model presets with alias and primary model", () => {
    const next = applyProviderConfigWithDefaultModelPreset(
      {
        agents: {
          defaults: {
            models: {
              "custom/model-z": { alias: "Pinned" },
            },
          },
        },
      },
      {
        providerId: "custom",
        api: "openai-completions",
        baseUrl: "https://example.com/v1",
        defaultModel: makeModel("model-z"),
        aliases: [{ modelRef: "custom/model-z", alias: "Preset" }],
        primaryModelRef: "custom/model-z",
      },
    );

    expect(next.agents?.defaults?.models?.["custom/model-z"]).toEqual({ alias: "Pinned" });
    expect(next.agents?.defaults?.model).toEqual({ primary: "custom/model-z" });
  });

  it("applies catalog presets with alias and merged catalog models", () => {
    const next = applyProviderConfigWithModelCatalogPreset(
      {
        models: {
          providers: {
            custom: {
              api: "openai-completions",
              baseUrl: "https://example.com/v1",
              models: [makeModel("model-a")],
            },
          },
        },
      },
      {
        providerId: "custom",
        api: "openai-completions",
        baseUrl: "https://example.com/v1",
        catalogModels: [makeModel("model-a"), makeModel("model-b")],
        aliases: [{ modelRef: "custom/model-b", alias: "Catalog Alias" }],
        primaryModelRef: "custom/model-b",
      },
    );

    expect(next.models?.providers?.custom?.models?.map((model) => model.id)).toEqual([
      "model-a",
      "model-b",
    ]);
    expect(next.agents?.defaults?.models?.["custom/model-b"]).toEqual({
      alias: "Catalog Alias",
    });
    expect(next.agents?.defaults?.model).toEqual({ primary: "custom/model-b" });
  });
});
