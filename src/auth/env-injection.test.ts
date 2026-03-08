import { afterEach, describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  _resetRoundRobinState,
  resolveAuthEnv,
  resolveAuthProfileCount,
  resolveProviderEnvVarName,
} from "./env-injection.js";
import type { AuthProfileStore } from "./types.js";

afterEach(() => {
  _resetRoundRobinState();
});

describe("resolveProviderEnvVarName", () => {
  it("maps anthropic to ANTHROPIC_API_KEY", () => {
    expect(resolveProviderEnvVarName("anthropic")).toBe("ANTHROPIC_API_KEY");
  });

  it("maps google to GEMINI_API_KEY", () => {
    expect(resolveProviderEnvVarName("google")).toBe("GEMINI_API_KEY");
  });

  it("maps openai to OPENAI_API_KEY", () => {
    expect(resolveProviderEnvVarName("openai")).toBe("OPENAI_API_KEY");
  });

  it("maps openai-codex to OPENAI_API_KEY", () => {
    expect(resolveProviderEnvVarName("openai-codex")).toBe("OPENAI_API_KEY");
  });

  it("maps opencode to OPENCODE_API_KEY", () => {
    expect(resolveProviderEnvVarName("opencode")).toBe("OPENCODE_API_KEY");
  });

  it("maps general providers via envMap", () => {
    expect(resolveProviderEnvVarName("groq")).toBe("GROQ_API_KEY");
    expect(resolveProviderEnvVarName("mistral")).toBe("MISTRAL_API_KEY");
    expect(resolveProviderEnvVarName("openrouter")).toBe("OPENROUTER_API_KEY");
  });

  it("returns undefined for unknown providers", () => {
    expect(resolveProviderEnvVarName("unknown-provider")).toBeUndefined();
  });
});

describe("resolveAuthEnv", () => {
  const makeStore = (
    profiles: Record<string, { provider: string; key: string }>,
  ): AuthProfileStore => ({
    version: 1,
    profiles: Object.fromEntries(
      Object.entries(profiles).map(([id, p]) => [
        id,
        { type: "api_key" as const, provider: p.provider, key: p.key },
      ]),
    ),
  });

  it("returns undefined when auth is undefined (no config)", async () => {
    const cfg: RemoteClawConfig = {};
    const result = await resolveAuthEnv({ cfg, agentId: "main" });
    expect(result).toBeUndefined();
  });

  it("returns undefined when auth is false", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: false }],
      },
    };
    const result = await resolveAuthEnv({ cfg, agentId: "main" });
    expect(result).toBeUndefined();
  });

  it("injects CLAUDE_CODE_OAUTH_TOKEN for anthropic token credential", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: "claude:oauth-token" }],
      },
    };
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "claude:oauth-token": {
          type: "token",
          provider: "anthropic",
          token: "sk-ant-oat01-test-oauth-token",
        },
      },
    };

    const result = await resolveAuthEnv({ cfg, agentId: "main", store });
    expect(result).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-oat01-test-oauth-token" });
  });

  it("injects ANTHROPIC_API_KEY for anthropic api_key credential", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: "anthropic:default" }],
      },
    };
    const store: AuthProfileStore = {
      version: 1,
      profiles: {
        "anthropic:default": {
          type: "api_key",
          provider: "anthropic",
          key: "sk-ant-api03-regular-api-key",
        },
      },
    };

    const result = await resolveAuthEnv({ cfg, agentId: "main", store });
    expect(result).toEqual({ ANTHROPIC_API_KEY: "sk-ant-api03-regular-api-key" });
  });

  it("injects correct env var for single anthropic profile", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: "anthropic:default" }],
      },
    };
    const store = makeStore({
      "anthropic:default": { provider: "anthropic", key: "sk-ant-test-key" },
    });

    const result = await resolveAuthEnv({ cfg, agentId: "main", store });
    expect(result).toEqual({ ANTHROPIC_API_KEY: "sk-ant-test-key" });
  });

  it("injects correct env var for google profile", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: "google:default" }],
      },
    };
    const store = makeStore({
      "google:default": { provider: "google", key: "gemini-test-key" },
    });

    const result = await resolveAuthEnv({ cfg, agentId: "main", store });
    expect(result).toEqual({ GEMINI_API_KEY: "gemini-test-key" });
  });

  it("injects correct env var for openai profile", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: "openai:default" }],
      },
    };
    const store = makeStore({
      "openai:default": { provider: "openai", key: "sk-openai-test" },
    });

    const result = await resolveAuthEnv({ cfg, agentId: "main", store });
    expect(result).toEqual({ OPENAI_API_KEY: "sk-openai-test" });
  });

  it("returns undefined for missing profile and logs warning", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: "anthropic:nonexistent" }],
      },
    };
    const store = makeStore({});

    const result = await resolveAuthEnv({ cfg, agentId: "main", store });
    expect(result).toBeUndefined();
  });

  it("returns undefined for profile with unknown provider", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/w", auth: "exotic:p1" }],
      },
    };
    const store = makeStore({
      "exotic:p1": { provider: "exotic", key: "exotic-key" },
    });

    const result = await resolveAuthEnv({ cfg, agentId: "main", store });
    expect(result).toBeUndefined();
  });

  it("inherits auth from defaults", async () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { auth: "anthropic:shared" },
        list: [{ id: "main", workspace: "~/w" }],
      },
    };
    const store = makeStore({
      "anthropic:shared": { provider: "anthropic", key: "sk-shared" },
    });

    const result = await resolveAuthEnv({ cfg, agentId: "main", store });
    expect(result).toEqual({ ANTHROPIC_API_KEY: "sk-shared" });
  });

  describe("round-robin", () => {
    it("cycles through array entries across calls", async () => {
      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            {
              id: "main",
              workspace: "~/w",
              auth: ["anthropic:key1", "anthropic:key2", "anthropic:key3"],
            },
          ],
        },
      };
      const store = makeStore({
        "anthropic:key1": { provider: "anthropic", key: "sk-1" },
        "anthropic:key2": { provider: "anthropic", key: "sk-2" },
        "anthropic:key3": { provider: "anthropic", key: "sk-3" },
      });

      const r1 = await resolveAuthEnv({ cfg, agentId: "main", store });
      expect(r1).toEqual({ ANTHROPIC_API_KEY: "sk-1" });

      const r2 = await resolveAuthEnv({ cfg, agentId: "main", store });
      expect(r2).toEqual({ ANTHROPIC_API_KEY: "sk-2" });

      const r3 = await resolveAuthEnv({ cfg, agentId: "main", store });
      expect(r3).toEqual({ ANTHROPIC_API_KEY: "sk-3" });

      // Wraps around
      const r4 = await resolveAuthEnv({ cfg, agentId: "main", store });
      expect(r4).toEqual({ ANTHROPIC_API_KEY: "sk-1" });
    });

    it("tracks rotation independently per agent", async () => {
      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "a", workspace: "~/w", auth: ["anthropic:a1", "anthropic:a2"] },
            { id: "b", workspace: "~/w", auth: ["anthropic:b1", "anthropic:b2"] },
          ],
        },
      };
      const store = makeStore({
        "anthropic:a1": { provider: "anthropic", key: "sk-a1" },
        "anthropic:a2": { provider: "anthropic", key: "sk-a2" },
        "anthropic:b1": { provider: "anthropic", key: "sk-b1" },
        "anthropic:b2": { provider: "anthropic", key: "sk-b2" },
      });

      const ra1 = await resolveAuthEnv({ cfg, agentId: "a", store });
      expect(ra1).toEqual({ ANTHROPIC_API_KEY: "sk-a1" });

      const rb1 = await resolveAuthEnv({ cfg, agentId: "b", store });
      expect(rb1).toEqual({ ANTHROPIC_API_KEY: "sk-b1" });

      const ra2 = await resolveAuthEnv({ cfg, agentId: "a", store });
      expect(ra2).toEqual({ ANTHROPIC_API_KEY: "sk-a2" });

      const rb2 = await resolveAuthEnv({ cfg, agentId: "b", store });
      expect(rb2).toEqual({ ANTHROPIC_API_KEY: "sk-b2" });
    });

    it("returns undefined for empty auth array", async () => {
      const cfg: RemoteClawConfig = {
        agents: {
          list: [{ id: "main", workspace: "~/w", auth: [] }],
        },
      };
      const store = makeStore({});

      const result = await resolveAuthEnv({ cfg, agentId: "main", store });
      expect(result).toBeUndefined();
    });
  });
});

describe("resolveAuthProfileCount", () => {
  it("returns 0 when auth is undefined (no config)", () => {
    expect(resolveAuthProfileCount({}, "main")).toBe(0);
  });

  it("returns 0 when auth is false", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "main", workspace: "~/w", auth: false }] },
    };
    expect(resolveAuthProfileCount(cfg, "main")).toBe(0);
  });

  it("returns 1 for single string profile", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "main", workspace: "~/w", auth: "anthropic:default" }] },
    };
    expect(resolveAuthProfileCount(cfg, "main")).toBe(1);
  });

  it("returns array length for multiple profiles", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "main", workspace: "~/w", auth: ["anthropic:k1", "anthropic:k2", "anthropic:k3"] },
        ],
      },
    };
    expect(resolveAuthProfileCount(cfg, "main")).toBe(3);
  });

  it("returns 0 for empty array", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "main", workspace: "~/w", auth: [] }] },
    };
    expect(resolveAuthProfileCount(cfg, "main")).toBe(0);
  });

  it("resolves from defaults when agent has no auth", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { auth: ["anthropic:d1", "anthropic:d2"] },
        list: [{ id: "main", workspace: "~/w" }],
      },
    };
    expect(resolveAuthProfileCount(cfg, "main")).toBe(2);
  });
});
