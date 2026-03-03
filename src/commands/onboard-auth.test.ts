import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  resolveAgentModelFallbackValues,
  resolveAgentModelPrimaryValue,
} from "../config/model-input.js";
import type { OAuthCredentials } from "../types/pi-compat.js";
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
  applyXaiConfig,
  applyXaiProviderConfig,
  applyXiaomiConfig,
  applyZaiConfig,
  applyZaiProviderConfig,
  OPENROUTER_DEFAULT_MODEL_REF,
  MISTRAL_DEFAULT_MODEL_REF,
  XAI_DEFAULT_MODEL_REF,
  setMinimaxApiKey,
  writeOAuthCredentials,
} from "./onboard-auth.js";
import {
  createAuthTestLifecycle,
  readAuthProfilesForAgent,
  setupAuthTestEnv,
} from "./test-wizard-helpers.js";

function createLegacyProviderConfig(_params: {
  providerId: string;
  api: "anthropic-messages" | "openai-completions" | "openai-responses";
  modelId?: string;
  modelName?: string;
  baseUrl?: string;
  apiKey?: string;
}): RemoteClawConfig {
  return {} as RemoteClawConfig;
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

describe("writeOAuthCredentials", () => {
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
    const env = await setupAuthTestEnv("openclaw-oauth-");
    lifecycle.setStateDir(env.stateDir);

    const creds = {
      refresh: "refresh-token",
      access: "access-token",
      expires: Date.now() + 60_000,
    } satisfies OAuthCredentials;

    await writeOAuthCredentials("openai-codex", creds);

    const parsed = await readAuthProfilesForAgent<{
      profiles?: Record<string, { type?: string; key?: string; provider?: string }>;
    }>(env.agentDir);
    expect(parsed.profiles?.["openai-codex:default"]).toMatchObject({
      type: "api_key",
      provider: "openai-codex",
      key: "access-token",
    });

    await expect(
      fs.readFile(path.join(env.stateDir, "agents", "main", "agent", "auth-profiles.json"), "utf8"),
    ).rejects.toThrow();
  });

  it("writes OAuth credentials to all sibling agent dirs when syncSiblingAgents=true", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-oauth-sync-"));
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
        profiles?: Record<string, { type?: string; key?: string; provider?: string }>;
      };
      expect(parsed.profiles?.["openai-codex:default"]).toMatchObject({
        type: "api_key",
        provider: "openai-codex",
        key: "access-sync",
      });
    }
  });

  it("writes OAuth credentials only to target dir by default", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-oauth-nosync-"));
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
      profiles?: Record<string, { type?: string; key?: string; provider?: string }>;
    };
    expect(kidParsed.profiles?.["openai-codex:default"]).toMatchObject({
      type: "api_key",
      provider: "openai-codex",
      key: "access-kid",
    });

    await expect(fs.readFile(authProfilePathFor(mainAgentDir), "utf8")).rejects.toThrow();
  });

  it("syncs siblings from explicit agentDir outside REMOTECLAW_STATE_DIR", async () => {
    tempStateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-oauth-external-"));
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
        profiles?: Record<string, { type?: string; key?: string; provider?: string }>;
      };
      expect(parsed.profiles?.["openai-codex:default"]).toMatchObject({
        type: "api_key",
        provider: "openai-codex",
        key: "access-ext",
      });
    }

    // Global state dir should NOT have credentials written
    const globalMain = path.join(tempStateDir, "agents", "main", "agent");
    await expect(fs.readFile(authProfilePathFor(globalMain), "utf8")).rejects.toThrow();
  });
});

describe("setMinimaxApiKey", () => {
  const lifecycle = createAuthTestLifecycle([
    "REMOTECLAW_STATE_DIR",
    "REMOTECLAW_AGENT_DIR",
    "PI_CODING_AGENT_DIR",
  ]);

  afterEach(async () => {
    await lifecycle.cleanup();
  });

  it("writes to REMOTECLAW_AGENT_DIR when set", async () => {
    const env = await setupAuthTestEnv("openclaw-minimax-", { agentSubdir: "custom-agent" });
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
  it("sets agent default models for minimax", () => {
    const cfg = applyMinimaxApiConfig({});
    expect(cfg.agents?.defaults?.models).toBeDefined();
  });

  it("preserves existing model params when adding alias", () => {
    const cfg = applyMinimaxApiConfig(
      {
        agents: {
          defaults: {
            models: {
              "minimax/MiniMax-M2.1": {
                alias: "MiniMax",
                params: { custom: "value" },
              },
            },
          },
        },
      },
      "MiniMax-M2.1",
    );
    expect(cfg.agents?.defaults?.models?.["minimax/MiniMax-M2.1"]).toMatchObject({
      alias: "Minimax",
      params: { custom: "value" },
    });
  });

  it("applies minimax config from legacy provider config", () => {
    const cfg = applyMinimaxApiConfig(
      createLegacyProviderConfig({
        providerId: "minimax",
        api: "openai-completions",
      }),
    );
    expect(cfg.agents?.defaults?.models).toBeDefined();
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

describe("applyZaiConfig", () => {
  it("sets agent default models for zai", () => {
    const cfg = applyZaiConfig({});
    expect(cfg.agents?.defaults?.models).toBeDefined();
  });

  it("does not set default primary model for CN endpoint", () => {
    for (const modelId of ["glm-4.7-flash", "glm-4.7-flashx"] as const) {
      const cfg = applyZaiConfig({}, { endpoint: "coding-cn", modelId });
      expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBeUndefined();
    }
  });
});

describe("applySyntheticConfig", () => {
  it("sets agent default models for synthetic", () => {
    const cfg = applySyntheticConfig({});
    expect(cfg.agents?.defaults?.models).toBeDefined();
  });
});

describe("primary model defaults", () => {
  it("does not set a default primary model", () => {
    const configCases = [
      {
        getConfig: () => applyMinimaxApiConfig({}, "MiniMax-M2.1-lightning"),
      },
      {
        getConfig: () => applyZaiConfig({}, { modelId: "glm-5" }),
      },
      {
        getConfig: () => applySyntheticConfig({}),
      },
    ] as const;
    for (const { getConfig } of configCases) {
      const cfg = getConfig();
      expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBeUndefined();
    }
  });
});

describe("applyXiaomiConfig", () => {
  it("sets agent default models for xiaomi and does not set primary model", () => {
    const cfg = applyXiaomiConfig({});
    expect(cfg.agents?.defaults?.models).toBeDefined();
    expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBeUndefined();
  });
});

describe("applyXaiConfig", () => {
  it("sets agent default models for xai and does not set primary model", () => {
    const cfg = applyXaiConfig({});
    expect(cfg.agents?.defaults?.models).toBeDefined();
    expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBeUndefined();
  });
});

describe("applyXaiProviderConfig", () => {
  it("sets agent default models for xai provider config", () => {
    const cfg = applyXaiProviderConfig(
      createLegacyProviderConfig({
        providerId: "xai",
        api: "anthropic-messages",
        modelId: "custom-model",
        modelName: "Custom",
      }),
    );
    expect(cfg.agents?.defaults?.models).toBeDefined();
  });
});

describe("applyMistralConfig", () => {
  it("sets agent default models for mistral and does not set primary model", () => {
    const cfg = applyMistralConfig({});
    expect(cfg.agents?.defaults?.models).toBeDefined();
    expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBeUndefined();
  });
});

describe("applyMistralProviderConfig", () => {
  it("sets agent default models for mistral provider config", () => {
    const cfg = applyMistralProviderConfig(
      createLegacyProviderConfig({
        providerId: "mistral",
        api: "anthropic-messages",
        modelId: "custom-model",
        modelName: "Custom",
      }),
    );
    expect(cfg.agents?.defaults?.models).toBeDefined();
  });
});

describe("fallback preservation helpers", () => {
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
        applyConfig: () => applyMinimaxApiConfig({}, "MiniMax-M2.1"),
        modelRef: "minimax/MiniMax-M2.1",
        alias: "Minimax",
      },
      {
        applyConfig: () => applyXaiProviderConfig({}),
        modelRef: XAI_DEFAULT_MODEL_REF,
        alias: "Grok",
      },
      {
        applyConfig: () => applyMistralProviderConfig({}),
        modelRef: MISTRAL_DEFAULT_MODEL_REF,
        alias: "Mistral",
      },
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

describe("applyLitellmProviderConfig", () => {
  it("sets agent default models for litellm provider config", () => {
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
    expect(cfg.agents?.defaults?.models).toBeDefined();
  });
});

describe("default-model config helpers", () => {
  it("does not set primary model but preserves existing model fallbacks", () => {
    const configCases = [
      {
        applyConfig: applyOpencodeZenConfig,
      },
      {
        applyConfig: applyOpenrouterConfig,
      },
    ] as const;
    for (const { applyConfig } of configCases) {
      const cfg = applyConfig({});
      expect(resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model)).toBeUndefined();

      const cfgWithFallbacks = applyConfig(createConfigWithFallbacks());
      expectFallbacksPreserved(cfgWithFallbacks);
    }
  });
});
