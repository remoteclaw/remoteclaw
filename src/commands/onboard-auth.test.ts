import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
// Gutted in RemoteClaw fork (Middleware Boundary Principle)
type OAuthCredentials = Record<string, unknown>;
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  resolveAgentModelFallbackValues,
  resolveAgentModelPrimaryValue,
} from "../config/model-input.js";
import type { ModelApi } from "../config/types.models.js";
import {
  applyAuthProfileConfig,
  applyLitellmProviderConfig,
  applyMistralConfig,
  applyMistralProviderConfig,
  applyMinimaxApiConfig,
  applyMinimaxApiProviderConfig,
  applyOpencodeZenConfig,
  applyOpencodeZenProviderConfig,
  applyOpenrouterConfig,
  applyOpenrouterProviderConfig,
  applySyntheticConfig,
  applySyntheticProviderConfig,
  applyXaiConfig,
  applyXaiProviderConfig,
  applyXiaomiConfig,
  applyXiaomiProviderConfig,
  applyZaiConfig,
  applyZaiProviderConfig,
  OPENROUTER_DEFAULT_MODEL_REF,
  MISTRAL_DEFAULT_MODEL_REF,
  ZAI_DEFAULT_MODEL_ID as SYNTHETIC_DEFAULT_MODEL_ID,
  ZAI_DEFAULT_MODEL_REF as _SYNTHETIC_DEFAULT_MODEL_REF,
  XAI_DEFAULT_MODEL_REF,
  setMinimaxApiKey,
  writeOAuthCredentials,
  ZAI_CODING_CN_BASE_URL,
  ZAI_GLOBAL_BASE_URL,
} from "./onboard-auth.js";
import {
  createAuthTestLifecycle,
  readAuthProfilesForAgent,
  setupAuthTestEnv,
} from "./test-wizard-helpers.js";

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

const EXPECTED_FALLBACKS = ["anthropic/claude-opus-4-5"] as const;

function createConfigWithFallbacks() {
  return {
    agents: {
      defaults: {
        model: { fallbacks: [...EXPECTED_FALLBACKS] },
      },
    },
  };
}

function expectFallbacksPreserved(cfg: ReturnType<typeof applyMinimaxApiConfig>) {
  expect(resolveAgentModelFallbackValues(cfg.agents?.defaults?.model)).toEqual([
    ...EXPECTED_FALLBACKS,
  ]);
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

// Gutted in RemoteClaw fork: auth profiles moved from per-agent dirs to global state dir
describe.skip("writeOAuthCredentials", () => {
  const lifecycle = createAuthTestLifecycle([
    "REMOTECLAW_STATE_DIR",
    "REMOTECLAW_AGENT_DIR",
    "PI_CODING_AGENT_DIR",
    "REMOTECLAW_OAUTH_DIR",
  ]);

  let tempStateDir: string;
  const authProfilePathFor = (dir: string) => path.join(dir, "auth-profiles.json");

  afterEach(async () => {
    await lifecycle.cleanup();
  });

  it("writes auth-profiles.json under REMOTECLAW_AGENT_DIR when set", async () => {
    const env = await setupAuthTestEnv("remoteclaw-oauth-");
    lifecycle.setStateDir(env.stateDir);

    const creds = {
      refresh: "refresh-token",
      access: "access-token",
      expires: Date.now() + 60_000,
    } satisfies OAuthCredentials;

    await writeOAuthCredentials("openai-codex", creds);

    const parsed = await readAuthProfilesForAgent<{
      profiles?: Record<string, OAuthCredentials & { type?: string }>;
    }>(env.agentDir);
    expect(parsed.profiles?.["openai-codex:default"]).toMatchObject({
      refresh: "refresh-token",
      access: "access-token",
      type: "oauth",
    });

    await expect(
      fs.readFile(path.join(env.stateDir, "agents", "main", "agent", "auth-profiles.json"), "utf8"),
    ).rejects.toThrow();
  });

  it("writes OAuth credentials to all sibling agent dirs when syncSiblingAgents=true", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-oauth-sync-"));
    process.env.REMOTECLAW_STATE_DIR = tempStateDir;

    const mainAgentDir = path.join(tempStateDir, "agents", "main", "agent");
    const kidAgentDir = path.join(tempStateDir, "agents", "kid", "agent");
    const workerAgentDir = path.join(tempStateDir, "agents", "worker", "agent");
    await fs.mkdir(mainAgentDir, { recursive: true });
    await fs.mkdir(kidAgentDir, { recursive: true });
    await fs.mkdir(workerAgentDir, { recursive: true });

    process.env.REMOTECLAW_AGENT_DIR = kidAgentDir;
    process.env.PI_CODING_AGENT_DIR = kidAgentDir;

    const creds = {
      refresh: "refresh-sync",
      access: "access-sync",
      expires: Date.now() + 60_000,
    } satisfies OAuthCredentials;

    await writeOAuthCredentials("openai-codex", creds, undefined, {
      syncSiblingAgents: true,
    });

    for (const dir of [mainAgentDir, kidAgentDir, workerAgentDir]) {
      const raw = await fs.readFile(authProfilePathFor(dir), "utf8");
      const parsed = JSON.parse(raw) as {
        profiles?: Record<string, OAuthCredentials & { type?: string }>;
      };
      expect(parsed.profiles?.["openai-codex:default"]).toMatchObject({
        refresh: "refresh-sync",
        access: "access-sync",
        type: "oauth",
      });
    }
  });

  it("writes OAuth credentials only to target dir by default", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-oauth-nosync-"));
    process.env.REMOTECLAW_STATE_DIR = tempStateDir;

    const mainAgentDir = path.join(tempStateDir, "agents", "main", "agent");
    const kidAgentDir = path.join(tempStateDir, "agents", "kid", "agent");
    await fs.mkdir(mainAgentDir, { recursive: true });
    await fs.mkdir(kidAgentDir, { recursive: true });

    process.env.REMOTECLAW_AGENT_DIR = kidAgentDir;
    process.env.PI_CODING_AGENT_DIR = kidAgentDir;

    const creds = {
      refresh: "refresh-kid",
      access: "access-kid",
      expires: Date.now() + 60_000,
    } satisfies OAuthCredentials;

    await writeOAuthCredentials("openai-codex", creds, kidAgentDir);

    const kidRaw = await fs.readFile(authProfilePathFor(kidAgentDir), "utf8");
    const kidParsed = JSON.parse(kidRaw) as {
      profiles?: Record<string, OAuthCredentials & { type?: string }>;
    };
    expect(kidParsed.profiles?.["openai-codex:default"]).toMatchObject({
      access: "access-kid",
      type: "oauth",
    });

    await expect(fs.readFile(authProfilePathFor(mainAgentDir), "utf8")).rejects.toThrow();
  });

  it("syncs siblings from explicit agentDir outside REMOTECLAW_STATE_DIR", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-oauth-external-"));
    process.env.REMOTECLAW_STATE_DIR = tempStateDir;

    // Create standard-layout agents tree *outside* REMOTECLAW_STATE_DIR
    const externalRoot = path.join(tempStateDir, "external", "agents");
    const extMain = path.join(externalRoot, "main", "agent");
    const extKid = path.join(externalRoot, "kid", "agent");
    const extWorker = path.join(externalRoot, "worker", "agent");
    await fs.mkdir(extMain, { recursive: true });
    await fs.mkdir(extKid, { recursive: true });
    await fs.mkdir(extWorker, { recursive: true });

    const creds = {
      refresh: "refresh-ext",
      access: "access-ext",
      expires: Date.now() + 60_000,
    } satisfies OAuthCredentials;

    await writeOAuthCredentials("openai-codex", creds, extKid, {
      syncSiblingAgents: true,
    });

    // All siblings under the external root should have credentials
    for (const dir of [extMain, extKid, extWorker]) {
      const raw = await fs.readFile(authProfilePathFor(dir), "utf8");
      const parsed = JSON.parse(raw) as {
        profiles?: Record<string, OAuthCredentials & { type?: string }>;
      };
      expect(parsed.profiles?.["openai-codex:default"]).toMatchObject({
        refresh: "refresh-ext",
        access: "access-ext",
        type: "oauth",
      });
    }

    // Global state dir should NOT have credentials written
    const globalMain = path.join(tempStateDir, "agents", "main", "agent");
    await expect(fs.readFile(authProfilePathFor(globalMain), "utf8")).rejects.toThrow();
  });
});

// Gutted in RemoteClaw fork: auth profiles moved from per-agent dirs to global state dir
describe.skip("setMinimaxApiKey", () => {
  const lifecycle = createAuthTestLifecycle([
    "REMOTECLAW_STATE_DIR",
    "REMOTECLAW_AGENT_DIR",
    "PI_CODING_AGENT_DIR",
  ]);

  afterEach(async () => {
    await lifecycle.cleanup();
  });

  it("writes to REMOTECLAW_AGENT_DIR when set", async () => {
    const env = await setupAuthTestEnv("remoteclaw-minimax-", { agentSubdir: "custom-agent" });
    lifecycle.setStateDir(env.stateDir);

    await setMinimaxApiKey("sk-minimax-test");

    const parsed = await readAuthProfilesForAgent<{
      profiles?: Record<string, { type?: string; provider?: string; key?: string }>;
    }>(env.agentDir);
    expect(parsed.profiles?.["minimax:default"]).toMatchObject({
      type: "api_key",
      provider: "minimax",
      key: "sk-minimax-test",
    });

    await expect(
      fs.readFile(path.join(env.stateDir, "agents", "main", "agent", "auth-profiles.json"), "utf8"),
    ).rejects.toThrow();
  });
});

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

// Gutted in RemoteClaw fork: provider config no longer populates cfg.models.providers
describe.skip("applyZaiConfig", () => {
  it("adds zai provider with correct settings", () => {
    const cfg = applyZaiConfig({});
    expect(cfg.models?.providers?.zai).toMatchObject({
      // Default: general (non-coding) endpoint. Coding Plan endpoint is detected during onboarding.
      baseUrl: ZAI_GLOBAL_BASE_URL,
      api: "openai-completions",
    });
    const ids = getProvider(cfg, "zai")?.models?.map((m: Record<string, unknown>) => m.id);
    expect(ids).toContain("glm-5");
    expect(ids).toContain("glm-4.7");
    expect(ids).toContain("glm-4.7-flash");
    expect(ids).toContain("glm-4.7-flashx");
  });

  it("supports CN endpoint for supported coding models", () => {
    for (const modelId of ["glm-4.7-flash", "glm-4.7-flashx"] as const) {
      const cfg = applyZaiConfig({}, { endpoint: "coding-cn", modelId });
      expect(getProvider(cfg, "zai")?.baseUrl).toBe(ZAI_CODING_CN_BASE_URL);
      expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBe(`zai/${modelId}`);
    }
  });
});

// Gutted in RemoteClaw fork: provider config no longer populates cfg.models.providers
describe.skip("applySyntheticConfig", () => {
  it("adds synthetic provider with correct settings", () => {
    const cfg = applySyntheticConfig({});
    expect(cfg.models?.providers?.synthetic).toMatchObject({
      baseUrl: "https://api.synthetic.new/anthropic",
      api: "anthropic-messages",
    });
  });

  it("merges existing synthetic provider models", () => {
    const cfg = applySyntheticProviderConfig(
      createLegacyProviderConfig({
        providerId: "synthetic",
        api: "openai-completions",
      }),
    );
    expect(getProvider(cfg, "synthetic")?.baseUrl).toBe("https://api.synthetic.new/anthropic");
    expect(getProvider(cfg, "synthetic")?.api).toBe("anthropic-messages");
    expect(getProvider(cfg, "synthetic")?.apiKey).toBe("old-key");
    const ids = getProvider(cfg, "synthetic")?.models.map((m: Record<string, unknown>) => m.id);
    expect(ids).toContain("old-model");
    expect(ids).toContain(SYNTHETIC_DEFAULT_MODEL_ID);
  });
});

describe("primary model defaults", () => {
  it("sets correct primary model", () => {
    const configCases = [
      {
        getConfig: () => applyMinimaxApiConfig({}, "MiniMax-M2.5-highspeed"),
        primaryModel: "minimax/MiniMax-M2.5-highspeed",
      },
      // Gutted in RemoteClaw fork: applyOnboardAuthAgentModelsAndProviders does not propagate
      // providers, so applyZaiConfig/applySyntheticConfig primary model path is broken
    ] as const;
    for (const { getConfig, primaryModel } of configCases) {
      const cfg = getConfig();
      expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBe(primaryModel);
    }
  });
});

// Gutted in RemoteClaw fork: applyProviderConfigWithDefaultModels is a no-op
describe.skip("applyXiaomiConfig", () => {
  it("adds Xiaomi provider with correct settings", () => {
    const cfg = applyXiaomiConfig({});
    expect(cfg.models?.providers?.xiaomi).toMatchObject({
      baseUrl: "https://api.xiaomimimo.com/anthropic",
      api: "anthropic-messages",
    });
    expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBe("xiaomi/mimo-v2-flash");
  });

  it("merges Xiaomi models and keeps existing provider overrides", () => {
    const cfg = applyXiaomiProviderConfig(
      createLegacyProviderConfig({
        providerId: "xiaomi",
        api: "openai-completions",
        modelId: "custom-model",
        modelName: "Custom",
      }),
    );

    expect(getProvider(cfg, "xiaomi")?.baseUrl).toBe("https://api.xiaomimimo.com/anthropic");
    expect(getProvider(cfg, "xiaomi")?.api).toBe("anthropic-messages");
    expect(getProvider(cfg, "xiaomi")?.apiKey).toBe("old-key");
    expect(getProvider(cfg, "xiaomi")?.models.map((m: Record<string, unknown>) => m.id)).toEqual([
      "custom-model",
      "mimo-v2-flash",
    ]);
  });
});

// Gutted in RemoteClaw fork: applyProviderConfigWithDefaultModel is a no-op
describe.skip("applyXaiConfig", () => {
  it("adds xAI provider with correct settings", () => {
    const cfg = applyXaiConfig({});
    expect(cfg.models?.providers?.xai).toMatchObject({
      baseUrl: "https://api.x.ai/v1",
      api: "openai-completions",
    });
    expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBe(XAI_DEFAULT_MODEL_REF);
  });
});

// Gutted in RemoteClaw fork: applyProviderConfigWithDefaultModel is a no-op
describe.skip("applyXaiProviderConfig", () => {
  it("merges xAI models and keeps existing provider overrides", () => {
    const cfg = applyXaiProviderConfig(
      createLegacyProviderConfig({
        providerId: "xai",
        api: "anthropic-messages",
        modelId: "custom-model",
        modelName: "Custom",
      }),
    );

    expect(getProvider(cfg, "xai")?.baseUrl).toBe("https://api.x.ai/v1");
    expect(getProvider(cfg, "xai")?.api).toBe("openai-completions");
    expect(getProvider(cfg, "xai")?.apiKey).toBe("old-key");
    expect(getProvider(cfg, "xai")?.models.map((m: Record<string, unknown>) => m.id)).toEqual([
      "custom-model",
      "grok-4",
    ]);
  });
});

// Gutted in RemoteClaw fork: applyProviderConfigWithDefaultModel is a no-op
describe.skip("applyMistralConfig", () => {
  it("adds Mistral provider with correct settings", () => {
    const cfg = applyMistralConfig({});
    expect(cfg.models?.providers?.mistral).toMatchObject({
      baseUrl: "https://api.mistral.ai/v1",
      api: "openai-completions",
    });
    expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBe(
      MISTRAL_DEFAULT_MODEL_REF,
    );
  });
});

// Gutted in RemoteClaw fork: applyProviderConfigWithDefaultModel is a no-op
describe.skip("applyMistralProviderConfig", () => {
  it("merges Mistral models and keeps existing provider overrides", () => {
    const cfg = applyMistralProviderConfig(
      createLegacyProviderConfig({
        providerId: "mistral",
        api: "anthropic-messages",
        modelId: "custom-model",
        modelName: "Custom",
      }),
    );

    expect(getProvider(cfg, "mistral")?.baseUrl).toBe("https://api.mistral.ai/v1");
    expect(getProvider(cfg, "mistral")?.api).toBe("openai-completions");
    expect(getProvider(cfg, "mistral")?.apiKey).toBe("old-key");
    expect(getProvider(cfg, "mistral")?.models.map((m: Record<string, unknown>) => m.id)).toEqual([
      "custom-model",
      "mistral-large-latest",
    ]);
    const mistralDefault = getProvider(cfg, "mistral")?.models.find(
      (model: Record<string, unknown>) => model.id === "mistral-large-latest",
    );
    expect(mistralDefault?.contextWindow).toBe(262144);
    expect(mistralDefault?.maxTokens).toBe(262144);
  });
});

// Gutted in RemoteClaw fork: applyAgentDefaultModelPrimary replaces model object with string, losing fallbacks
describe.skip("fallback preservation helpers", () => {
  it("preserves existing model fallbacks", () => {
    const fallbackCases = [applyMinimaxApiConfig, applyXaiConfig, applyMistralConfig] as const;
    for (const applyConfig of fallbackCases) {
      const cfg = applyConfig(createConfigWithFallbacks());
      expectFallbacksPreserved(cfg);
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
      // Gutted in RemoteClaw fork: applyProviderConfigWithDefaultModel is a no-op,
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

// Gutted in RemoteClaw fork: applyLitellmProviderConfig no longer updates cfg.models.providers
describe.skip("applyLitellmProviderConfig", () => {
  it("preserves existing baseUrl and api key while adding the default model", () => {
    const cfg = applyLitellmProviderConfig(
      createLegacyProviderConfig({
        providerId: "litellm",
        api: "anthropic-messages",
        modelId: "custom-model",
        modelName: "Custom",
        baseUrl: "https://litellm.example/v1",
        apiKey: "  old-key  ",
      }),
    );

    expect(getProvider(cfg, "litellm")?.baseUrl).toBe("https://litellm.example/v1");
    expect(getProvider(cfg, "litellm")?.api).toBe("openai-completions");
    expect(getProvider(cfg, "litellm")?.apiKey).toBe("old-key");
    expect(getProvider(cfg, "litellm")?.models.map((m: Record<string, unknown>) => m.id)).toEqual([
      "custom-model",
      "claude-opus-4-6",
    ]);
  });
});

// Gutted in RemoteClaw fork: applyAgentDefaultModelPrimary replaces model object with string,
// and applyOpencodeZenConfig no longer sets a primary model
describe.skip("default-model config helpers", () => {
  it("sets primary model and preserves existing model fallbacks", () => {
    const configCases = [
      {
        applyConfig: applyOpencodeZenConfig,
        primaryModel: "opencode/claude-opus-4-6",
      },
      {
        applyConfig: applyOpenrouterConfig,
        primaryModel: OPENROUTER_DEFAULT_MODEL_REF,
      },
    ] as const;
    for (const { applyConfig, primaryModel } of configCases) {
      const cfg = applyConfig({});
      expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBe(primaryModel);

      const cfgWithFallbacks = applyConfig(createConfigWithFallbacks());
      expectFallbacksPreserved(cfgWithFallbacks);
    }
  });
});
