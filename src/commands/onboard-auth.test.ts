import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveAgentModelPrimaryValue } from "../config/model-input.js";
import type { ModelApi } from "../config/types.models.js";
import {
  applyAuthProfileConfig,
  applyMinimaxApiConfig,
  applyMinimaxApiProviderConfig,
  applyOpencodeZenProviderConfig,
  applyOpenrouterProviderConfig,
  applyZaiProviderConfig,
  OPENROUTER_DEFAULT_MODEL_REF,
} from "./onboard-auth.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getProvider(cfg: RemoteClawConfig, id: string): any {
  return cfg.models?.providers?.[id];
}

function createLegacyProviderConfig(params: {
  providerId: string;
  api: ModelApi;
  modelId?: string;
  modelName?: string;
  baseUrl?: string;
  apiKey?: string;
}): RemoteClawConfig {
  return {
    models: {
      providers: {
        [params.providerId]: {
          baseUrl: params.baseUrl ?? "https://old.example.com",
          apiKey: params.apiKey ?? "old-key",
          api: params.api,
          models: [
            {
              id: params.modelId ?? "old-model",
              name: params.modelName ?? "Old",
              reasoning: false,
              input: ["text"],
              cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 1000,
              maxTokens: 100,
            },
          ],
        },
      },
    },
  } as RemoteClawConfig;
}

function expectPrimaryModelPreserved(cfg: ReturnType<typeof applyMinimaxApiProviderConfig>) {
  expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBe(
    "anthropic/claude-opus-4-5",
  );
}

function expectAllowlistContains(
  cfg: ReturnType<typeof applyOpenrouterProviderConfig>,
  key: string,
) {
  const models = cfg.agents?.defaults?.models ?? {};
  expect(Object.keys(models)).toContain(key);
}

function expectAliasPreserved(
  cfg: ReturnType<typeof applyOpenrouterProviderConfig>,
  key: string,
  alias: string,
) {
  expect(cfg.agents?.defaults?.models?.[key]?.alias).toBe(alias);
}

describe("applyAuthProfileConfig", () => {
  it("promotes the newly selected profile to the front of auth.order", () => {
    const next = applyAuthProfileConfig(
      {
        auth: {
          profiles: {
            "anthropic:default": { provider: "anthropic", mode: "api_key" },
          },
          order: { anthropic: ["anthropic:default"] },
        },
      },
      {
        profileId: "anthropic:work",
        provider: "anthropic",
        mode: "oauth",
      },
    );

    expect(next.auth?.order?.anthropic).toEqual(["anthropic:work", "anthropic:default"]);
  });

  it("creates provider order when switching from legacy oauth to api_key without explicit order", () => {
    const next = applyAuthProfileConfig(
      {
        auth: {
          profiles: {
            "kilocode:legacy": { provider: "kilocode", mode: "oauth" },
          },
        },
      },
      {
        profileId: "kilocode:default",
        provider: "kilocode",
        mode: "api_key",
      },
    );

    expect(next.auth?.order?.kilocode).toEqual(["kilocode:default", "kilocode:legacy"]);
  });

  it("keeps implicit round-robin when no mixed provider modes are present", () => {
    const next = applyAuthProfileConfig(
      {
        auth: {
          profiles: {
            "kilocode:legacy": { provider: "kilocode", mode: "api_key" },
          },
        },
      },
      {
        profileId: "kilocode:default",
        provider: "kilocode",
        mode: "api_key",
      },
    );

    expect(next.auth?.order).toBeUndefined();
  });
});

describe("applyMinimaxApiConfig", () => {
  it("adds minimax provider with correct settings", () => {
    const cfg = applyMinimaxApiConfig({});
    expect(cfg.models?.providers?.minimax).toMatchObject({
      baseUrl: "https://api.minimax.io/anthropic",
      api: "anthropic-messages",
      authHeader: true,
    });
  });

  it("keeps reasoning enabled for MiniMax-M2.5", () => {
    const cfg = applyMinimaxApiConfig({}, "MiniMax-M2.5");
    expect(getProvider(cfg, "minimax")?.models[0]?.reasoning).toBe(true);
  });

  it("preserves existing model params when adding alias", () => {
    const cfg = applyMinimaxApiConfig(
      {
        agents: {
          defaults: {
            models: {
              "minimax/MiniMax-M2.5": {
                alias: "MiniMax",
                params: { custom: "value" },
              },
            },
          },
        },
      },
      "MiniMax-M2.5",
    );
    expect(cfg.agents?.defaults?.models?.["minimax/MiniMax-M2.5"]).toMatchObject({
      alias: "Minimax",
      params: { custom: "value" },
    });
  });

  it("merges existing minimax provider models", () => {
    const cfg = applyMinimaxApiConfig(
      createLegacyProviderConfig({
        providerId: "minimax",
        api: "openai-completions",
      }),
    );
    expect(getProvider(cfg, "minimax")?.baseUrl).toBe("https://api.minimax.io/anthropic");
    expect(getProvider(cfg, "minimax")?.api).toBe("anthropic-messages");
    expect(getProvider(cfg, "minimax")?.authHeader).toBe(true);
    expect(getProvider(cfg, "minimax")?.apiKey).toBe("old-key");
    expect(getProvider(cfg, "minimax")?.models.map((m: Record<string, unknown>) => m.id)).toEqual([
      "old-model",
      "MiniMax-M2.5",
    ]);
  });

  it("preserves other providers when adding minimax", () => {
    const cfg = applyMinimaxApiConfig({
      models: {
        providers: {
          anthropic: {
            baseUrl: "https://api.anthropic.com",
            apiKey: "anthropic-key",
            api: "anthropic-messages",
            models: [
              {
                id: "claude-opus-4-5",
                name: "Claude Opus 4.5",
                reasoning: false,
                input: ["text"],
                cost: { input: 15, output: 75, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 200000,
                maxTokens: 8192,
              },
            ],
          },
        },
      },
    });
    expect(cfg.models?.providers?.anthropic).toBeDefined();
    expect(cfg.models?.providers?.minimax).toBeDefined();
  });

  it("preserves existing models mode", () => {
    const cfg = applyMinimaxApiConfig({
      models: { mode: "replace", providers: {} },
    });
    expect(cfg.models?.mode).toBe("replace");
  });
});

describe("provider config helpers", () => {
  it("does not overwrite existing primary model", () => {
    const providerConfigAppliers = [applyMinimaxApiProviderConfig, applyZaiProviderConfig];
    for (const applyConfig of providerConfigAppliers) {
      const cfg = applyConfig({
        agents: { defaults: { model: { primary: "anthropic/claude-opus-4-5" } } },
      });
      expectPrimaryModelPreserved(cfg);
    }
  });
});

describe("primary model defaults", () => {
  it("sets correct primary model", () => {
    const configCases = [
      {
        getConfig: () => applyMinimaxApiConfig({}, "MiniMax-M2.5-highspeed"),
        primaryModel: "minimax/MiniMax-M2.5-highspeed",
      },
      // providers, so applyZaiConfig/applySyntheticConfig primary model path is broken
    ] as const;
    for (const { getConfig, primaryModel } of configCases) {
      const cfg = getConfig();
      expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBe(primaryModel);
    }
  });
});

describe("provider alias defaults", () => {
  it("adds expected alias for provider defaults", () => {
    const aliasCases = [
      {
        applyConfig: () => applyMinimaxApiConfig({}, "MiniMax-M2.5"),
        modelRef: "minimax/MiniMax-M2.5",
        alias: "Minimax",
      },
      // so applyXaiProviderConfig and applyMistralProviderConfig do not populate agents.defaults.models
    ] as const;
    for (const testCase of aliasCases) {
      const cfg = testCase.applyConfig();
      expect(cfg.agents?.defaults?.models?.[testCase.modelRef]?.alias).toBe(testCase.alias);
    }
  });
});

describe("allowlist provider helpers", () => {
  it("adds allowlist entry and preserves alias", () => {
    const providerCases = [
      {
        applyConfig: applyOpencodeZenProviderConfig,
        modelRef: "opencode/claude-opus-4-6",
        alias: "My Opus",
      },
      {
        applyConfig: applyOpenrouterProviderConfig,
        modelRef: OPENROUTER_DEFAULT_MODEL_REF,
        alias: "Router",
      },
    ] as const;
    for (const { applyConfig, modelRef, alias } of providerCases) {
      const withDefault = applyConfig({});
      expectAllowlistContains(withDefault, modelRef);

      const withAlias = applyConfig({
        agents: {
          defaults: {
            models: {
              [modelRef]: { alias },
            },
          },
        },
      });
      expectAliasPreserved(withAlias, modelRef, alias);
    }
  });
});
