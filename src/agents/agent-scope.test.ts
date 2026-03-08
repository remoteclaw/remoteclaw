import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  hasConfiguredModelFallbacks,
  resolveAgentAuth,
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentEffectiveModelPrimary,
  resolveAgentExplicitModelPrimary,
  resolveFallbackAgentId,
  resolveEffectiveModelFallbacks,
  resolveAgentModelFallbacksOverride,
  resolveAgentModelPrimary,
  resolveRunModelFallbacksOverride,
  resolveAgentWorkspaceDir,
  resolveAgentWorkspaceDirOrNull,
} from "./agent-scope.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAgentConfig", () => {
  it("should return undefined when no agents config exists", () => {
    const cfg: RemoteClawConfig = {};
    const result = resolveAgentConfig(cfg, "main");
    expect(result).toBeUndefined();
  });

  it("should return undefined when agent id does not exist", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    const result = resolveAgentConfig(cfg, "nonexistent");
    expect(result).toBeUndefined();
  });

  it("should return basic agent config", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            name: "Main Agent",
            workspace: "~/remoteclaw",
            agentDir: "~/.remoteclaw/agents/main",
            model: "anthropic/claude-opus-4",
          },
        ],
      },
    };
    const result = resolveAgentConfig(cfg, "main");
    expect(result).toEqual({
      name: "Main Agent",
      workspace: "~/remoteclaw",
      agentDir: "~/.remoteclaw/agents/main",
      model: "anthropic/claude-opus-4",
      identity: undefined,
      groupChat: undefined,
      subagents: undefined,
      sandbox: undefined,
      tools: undefined,
    });
  });

  it("resolves explicit and effective model primary separately", () => {
    const cfgWithStringDefault = {
      agents: {
        defaults: {
          model: "anthropic/claude-sonnet-4",
        },
        list: [{ id: "main" }],
      },
    } as unknown as RemoteClawConfig;
    expect(resolveAgentExplicitModelPrimary(cfgWithStringDefault, "main")).toBeUndefined();
    expect(resolveAgentEffectiveModelPrimary(cfgWithStringDefault, "main")).toBe(
      "anthropic/claude-sonnet-4",
    );

    const cfgWithObjectDefault: RemoteClawConfig = {
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5.2",
            fallbacks: ["anthropic/claude-sonnet-4"],
          },
        },
        list: [{ id: "main" }],
      },
    };
    expect(resolveAgentExplicitModelPrimary(cfgWithObjectDefault, "main")).toBeUndefined();
    expect(resolveAgentEffectiveModelPrimary(cfgWithObjectDefault, "main")).toBe("openai/gpt-5.2");

    const cfgNoDefaults: RemoteClawConfig = {
      agents: {
        list: [{ id: "main" }],
      },
    };
    expect(resolveAgentExplicitModelPrimary(cfgNoDefaults, "main")).toBeUndefined();
    expect(resolveAgentEffectiveModelPrimary(cfgNoDefaults, "main")).toBeUndefined();
  });

  it("supports per-agent model primary+fallbacks", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: {
          model: {
            primary: "anthropic/claude-sonnet-4",
            fallbacks: ["openai/gpt-4.1"],
          },
        },
        list: [
          {
            id: "linus",
            model: {
              primary: "anthropic/claude-opus-4",
              fallbacks: ["openai/gpt-5.2"],
            },
          },
        ],
      },
    };

    expect(resolveAgentModelPrimary(cfg, "linus")).toBe("anthropic/claude-opus-4");
    expect(resolveAgentExplicitModelPrimary(cfg, "linus")).toBe("anthropic/claude-opus-4");
    expect(resolveAgentEffectiveModelPrimary(cfg, "linus")).toBe("anthropic/claude-opus-4");
    expect(resolveAgentModelFallbacksOverride(cfg, "linus")).toEqual(["openai/gpt-5.2"]);

    // If fallbacks isn't present, we don't override the global fallbacks.
    const cfgNoOverride: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "linus",
            model: {
              primary: "anthropic/claude-opus-4",
            },
          },
        ],
      },
    };
    expect(resolveAgentModelFallbacksOverride(cfgNoOverride, "linus")).toBe(undefined);

    // Explicit empty list disables global fallbacks for that agent.
    const cfgDisable: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "linus",
            model: {
              primary: "anthropic/claude-opus-4",
              fallbacks: [],
            },
          },
        ],
      },
    };
    expect(resolveAgentModelFallbacksOverride(cfgDisable, "linus")).toEqual([]);

    expect(
      resolveEffectiveModelFallbacks({
        cfg,
        agentId: "linus",
        hasSessionModelOverride: false,
      }),
    ).toEqual(["openai/gpt-5.2"]);
    expect(
      resolveEffectiveModelFallbacks({
        cfg,
        agentId: "linus",
        hasSessionModelOverride: true,
      }),
    ).toEqual(["openai/gpt-5.2"]);
    expect(
      resolveEffectiveModelFallbacks({
        cfg: cfgNoOverride,
        agentId: "linus",
        hasSessionModelOverride: true,
      }),
    ).toEqual([]);

    const cfgInheritDefaults: RemoteClawConfig = {
      agents: {
        defaults: {
          model: {
            fallbacks: ["openai/gpt-4.1"],
          },
        },
        list: [
          {
            id: "linus",
            model: {
              primary: "anthropic/claude-opus-4",
            },
          },
        ],
      },
    };
    expect(
      resolveEffectiveModelFallbacks({
        cfg: cfgInheritDefaults,
        agentId: "linus",
        hasSessionModelOverride: true,
      }),
    ).toEqual(["openai/gpt-4.1"]);
    expect(
      resolveEffectiveModelFallbacks({
        cfg: cfgDisable,
        agentId: "linus",
        hasSessionModelOverride: true,
      }),
    ).toEqual([]);
  });

  it("resolves fallback agent id from explicit agent id first", () => {
    expect(
      resolveFallbackAgentId({
        agentId: "Support",
        sessionKey: "agent:main:session",
      }),
    ).toBe("support");
  });

  it("resolves fallback agent id from session key when explicit id is missing", () => {
    expect(
      resolveFallbackAgentId({
        sessionKey: "agent:worker:session",
      }),
    ).toBe("worker");
  });

  it("resolves run fallback overrides via shared helper", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: {
          model: {
            fallbacks: ["openai/gpt-4.1"],
          },
        },
        list: [
          {
            id: "support",
            model: {
              fallbacks: ["openai/gpt-5.2"],
            },
          },
        ],
      },
    };

    expect(
      resolveRunModelFallbacksOverride({
        cfg,
        agentId: "support",
        sessionKey: "agent:main:session",
      }),
    ).toEqual(["openai/gpt-5.2"]);
    expect(
      resolveRunModelFallbacksOverride({
        cfg,
        agentId: undefined,
        sessionKey: "agent:support:session",
      }),
    ).toEqual(["openai/gpt-5.2"]);
  });

  it("computes whether any model fallbacks are configured via shared helper", () => {
    const cfgDefaultsOnly: RemoteClawConfig = {
      agents: {
        defaults: {
          model: {
            fallbacks: ["openai/gpt-4.1"],
          },
        },
        list: [{ id: "main" }],
      },
    };
    expect(
      hasConfiguredModelFallbacks({
        cfg: cfgDefaultsOnly,
        sessionKey: "agent:main:session",
      }),
    ).toBe(true);

    const cfgAgentOverrideOnly: RemoteClawConfig = {
      agents: {
        defaults: {
          model: {
            fallbacks: [],
          },
        },
        list: [
          {
            id: "support",
            model: {
              fallbacks: ["openai/gpt-5.2"],
            },
          },
        ],
      },
    };
    expect(
      hasConfiguredModelFallbacks({
        cfg: cfgAgentOverrideOnly,
        agentId: "support",
        sessionKey: "agent:support:session",
      }),
    ).toBe(true);
    expect(
      hasConfiguredModelFallbacks({
        cfg: cfgAgentOverrideOnly,
        agentId: "main",
        sessionKey: "agent:main:session",
      }),
    ).toBe(false);
  });

  it("should return agent-specific sandbox config", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "work",
            workspace: "~/remoteclaw-work",
            sandbox: {
              mode: "all",
              scope: "agent",
              perSession: false,
              workspaceAccess: "ro",
              workspaceRoot: "~/sandboxes",
            },
          },
        ],
      },
    };
    const result = resolveAgentConfig(cfg, "work");
    expect(result?.sandbox).toEqual({
      mode: "all",
      scope: "agent",
      perSession: false,
      workspaceAccess: "ro",
      workspaceRoot: "~/sandboxes",
    });
  });

  it("should return agent-specific tools config", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "restricted",
            workspace: "~/remoteclaw-restricted",
            tools: {
              allow: ["read"],
              deny: ["exec", "write"],
              elevated: {
                enabled: false,
                allowFrom: { whatsapp: ["+15555550123"] },
              },
            },
          },
        ],
      },
    };
    const result = resolveAgentConfig(cfg, "restricted");
    expect(result?.tools).toEqual({
      allow: ["read"],
      deny: ["exec", "write"],
      elevated: {
        enabled: false,
        allowFrom: { whatsapp: ["+15555550123"] },
      },
    });
  });

  it("should return both sandbox and tools config", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "family",
            workspace: "~/remoteclaw-family",
            sandbox: {
              mode: "all",
              scope: "agent",
            },
            tools: {
              allow: ["read"],
              deny: ["exec"],
            },
          },
        ],
      },
    };
    const result = resolveAgentConfig(cfg, "family");
    expect(result?.sandbox?.mode).toBe("all");
    expect(result?.tools?.allow).toEqual(["read"]);
  });

  it("should normalize agent id", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    // Should normalize to "main" (default)
    const result = resolveAgentConfig(cfg, "");
    expect(result).toBeDefined();
    expect(result?.workspace).toBe("~/remoteclaw");
  });

  it("throws when no workspace is configured for agent", () => {
    expect(() => resolveAgentWorkspaceDir({} as RemoteClawConfig, "main")).toThrow(
      "agent 'main' has no workspace configured",
    );
  });

  it("returns configured workspace from agents.list", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/my-workspace" }],
      },
    };
    const workspace = resolveAgentWorkspaceDir(cfg, "main");
    expect(workspace).toContain("my-workspace");
  });

  it("resolveAgentWorkspaceDirOrNull returns null when no workspace is configured", () => {
    expect(resolveAgentWorkspaceDirOrNull({} as RemoteClawConfig, "main")).toBeNull();
  });

  it("resolveAgentWorkspaceDirOrNull returns workspace when configured", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/my-workspace" }],
      },
    };
    const workspace = resolveAgentWorkspaceDirOrNull(cfg, "main");
    expect(workspace).toContain("my-workspace");
  });

  it("uses REMOTECLAW_HOME for default agentDir", () => {
    const home = path.join(path.sep, "srv", "remoteclaw-home");
    vi.stubEnv("REMOTECLAW_HOME", home);
    // Clear state dir so it falls back to REMOTECLAW_HOME
    vi.stubEnv("REMOTECLAW_STATE_DIR", "");

    const agentDir = resolveAgentDir({} as RemoteClawConfig, "main");
    expect(agentDir).toBe(path.join(path.resolve(home), ".remoteclaw", "agents", "main", "agent"));
  });

  it("should include auth in resolved agent config", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw", auth: "anthropic:default" }],
      },
    };
    const result = resolveAgentConfig(cfg, "main");
    expect(result?.auth).toBe("anthropic:default");
  });

  it("should include auth: false in resolved agent config", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw", auth: false }],
      },
    };
    const result = resolveAgentConfig(cfg, "main");
    expect(result?.auth).toBe(false);
  });

  it("should include auth array in resolved agent config", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "main", workspace: "~/remoteclaw", auth: ["anthropic:key1", "anthropic:key2"] },
        ],
      },
    };
    const result = resolveAgentConfig(cfg, "main");
    expect(result?.auth).toEqual(["anthropic:key1", "anthropic:key2"]);
  });
});

describe("resolveAgentAuth", () => {
  it("returns undefined when no agents config exists", () => {
    expect(resolveAgentAuth({}, "main")).toBeUndefined();
  });

  it("returns undefined when agent has no auth and no defaults", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentAuth(cfg, "main")).toBeUndefined();
  });

  it("inherits auth from defaults when agent entry has no auth", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { auth: "anthropic:default" },
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentAuth(cfg, "main")).toBe("anthropic:default");
  });

  it("agent entry auth overrides defaults auth", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { auth: "anthropic:default" },
        list: [{ id: "main", workspace: "~/remoteclaw", auth: "anthropic:custom" }],
      },
    };
    expect(resolveAgentAuth(cfg, "main")).toBe("anthropic:custom");
  });

  it("explicit auth: false on entry overrides defaults", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { auth: "anthropic:default" },
        list: [{ id: "main", workspace: "~/remoteclaw", auth: false }],
      },
    };
    expect(resolveAgentAuth(cfg, "main")).toBe(false);
  });

  it("inherits auth array from defaults", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { auth: ["anthropic:key1", "anthropic:key2"] },
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentAuth(cfg, "main")).toEqual(["anthropic:key1", "anthropic:key2"]);
  });

  it("agent entry auth array overrides defaults string", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { auth: "anthropic:default" },
        list: [
          {
            id: "main",
            workspace: "~/remoteclaw",
            auth: ["anthropic:key1", "anthropic:key2"],
          },
        ],
      },
    };
    expect(resolveAgentAuth(cfg, "main")).toEqual(["anthropic:key1", "anthropic:key2"]);
  });

  it("returns defaults auth: false when no agent entry exists", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { auth: false },
        list: [{ id: "other", workspace: "~/remoteclaw" }],
      },
    };
    // Agent "main" doesn't exist in list, so resolveAgentEntry returns undefined.
    // Falls through to defaults.auth.
    expect(resolveAgentAuth(cfg, "main")).toBe(false);
  });
});
