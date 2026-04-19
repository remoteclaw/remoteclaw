import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  hasConfiguredModelFallbacks,
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentEffectiveModelPrimary,
  resolveAgentExplicitModelPrimary,
  resolveFallbackAgentId,
  resolveEffectiveModelFallbacks,
  resolveAgentModelFallbacksOverride,
  resolveAgentModelPrimary,
  resolveAgentRuntimeOrThrow,
  resolveRunModelFallbacksOverride,
  resolveAgentWorkspaceDir,
  resolveAgentIdByWorkspacePath,
  resolveAgentIdsByWorkspacePath,
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
            model: "anthropic/claude-sonnet-4-6",
          },
        ],
      },
    };
    const result = resolveAgentConfig(cfg, "main");
    expect(result).toEqual({
      name: "Main Agent",
      workspace: "~/remoteclaw",
      agentDir: "~/.remoteclaw/agents/main",
      model: "anthropic/claude-sonnet-4-6",
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
          model: "anthropic/claude-sonnet-4-6",
        },
        list: [{ id: "main" }],
      },
    } as unknown as RemoteClawConfig;
    expect(resolveAgentExplicitModelPrimary(cfgWithStringDefault, "main")).toBeUndefined();
    expect(resolveAgentEffectiveModelPrimary(cfgWithStringDefault, "main")).toBe(
      "anthropic/claude-sonnet-4-6",
    );

    const cfgWithObjectDefault: RemoteClawConfig = {
      agents: {
        defaults: {
          model: {
            primary: "openai/gpt-5.4",
            fallbacks: ["anthropic/claude-sonnet-4-6"],
          },
        },
        list: [{ id: "main" }],
      },
    };
    expect(resolveAgentExplicitModelPrimary(cfgWithObjectDefault, "main")).toBeUndefined();
    expect(resolveAgentEffectiveModelPrimary(cfgWithObjectDefault, "main")).toBe("openai/gpt-5.4");

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
            primary: "openai/gpt-5.4",
            fallbacks: ["anthropic/claude-sonnet-4-6"],
          },
        },
        list: [
          {
            id: "linus",
            model: {
              primary: "anthropic/claude-sonnet-4-6",
              fallbacks: ["openai/gpt-5.4"],
            },
          },
        ],
      },
    };

    expect(resolveAgentModelPrimary(cfg, "linus")).toBe("anthropic/claude-sonnet-4-6");
    expect(resolveAgentExplicitModelPrimary(cfg, "linus")).toBe("anthropic/claude-sonnet-4-6");
    expect(resolveAgentEffectiveModelPrimary(cfg, "linus")).toBe("anthropic/claude-sonnet-4-6");
    expect(resolveAgentModelFallbacksOverride(cfg, "linus")).toEqual(["openai/gpt-5.4"]);

    // If fallbacks isn't present, we don't override the global fallbacks.
    const cfgNoOverride: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "linus",
            model: {
              primary: "anthropic/claude-sonnet-4-6",
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
              primary: "anthropic/claude-sonnet-4-6",
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
    ).toEqual(["openai/gpt-5.4"]);
    expect(
      resolveEffectiveModelFallbacks({
        cfg,
        agentId: "linus",
        hasSessionModelOverride: true,
      }),
    ).toEqual(["openai/gpt-5.4"]);
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
            fallbacks: ["openai/gpt-5.4"],
          },
        },
        list: [
          {
            id: "linus",
            model: {
              primary: "anthropic/claude-sonnet-4-6",
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
    ).toEqual(["openai/gpt-5.4"]);
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
            fallbacks: ["anthropic/claude-sonnet-4-6"],
          },
        },
        list: [
          {
            id: "support",
            model: {
              fallbacks: ["openai/gpt-5.4"],
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
    ).toEqual(["openai/gpt-5.4"]);
    expect(
      resolveRunModelFallbacksOverride({
        cfg,
        agentId: undefined,
        sessionKey: "agent:support:session",
      }),
    ).toEqual(["openai/gpt-5.4"]);
  });

  it("computes whether any model fallbacks are configured via shared helper", () => {
    const cfgDefaultsOnly: RemoteClawConfig = {
      agents: {
        defaults: {
          model: {
            fallbacks: ["openai/gpt-5.4"],
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
              fallbacks: ["openai/gpt-5.4"],
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
              deny: ["exec", "write", "edit"],
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
      deny: ["exec", "write", "edit"],
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

  it("uses REMOTECLAW_HOME for default agent workspace", () => {
    const home = path.join(path.sep, "srv", "remoteclaw-home");
    vi.stubEnv("REMOTECLAW_HOME", home);

    const workspace = resolveAgentWorkspaceDir({} as RemoteClawConfig, "main");
    expect(workspace).toBe(path.join(path.resolve(home), ".remoteclaw", "workspace"));
  });

  it("uses REMOTECLAW_HOME for default agentDir", () => {
    const home = path.join(path.sep, "srv", "remoteclaw-home");
    vi.stubEnv("REMOTECLAW_HOME", home);
    // Clear state dir so it falls back to REMOTECLAW_HOME
    vi.stubEnv("REMOTECLAW_STATE_DIR", "");

    const agentDir = resolveAgentDir({} as RemoteClawConfig, "main");
    expect(agentDir).toBe(path.join(path.resolve(home), ".remoteclaw", "agents", "main", "agent"));
  });
});

describe("resolveAgentIdByWorkspacePath", () => {
  it("returns the most specific workspace match for a directory", () => {
    const workspaceRoot = `/tmp/remoteclaw-agent-scope-${Date.now()}-root`;
    const opsWorkspace = `${workspaceRoot}/projects/ops`;
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "main", workspace: workspaceRoot },
          { id: "ops", workspace: opsWorkspace },
        ],
      },
    };

    expect(resolveAgentIdByWorkspacePath(cfg, `${opsWorkspace}/src`)).toBe("ops");
  });

  it("returns undefined when directory has no matching workspace", () => {
    const workspaceRoot = `/tmp/remoteclaw-agent-scope-${Date.now()}-root`;
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "main", workspace: workspaceRoot },
          { id: "ops", workspace: `${workspaceRoot}-ops` },
        ],
      },
    };

    expect(
      resolveAgentIdByWorkspacePath(cfg, `/tmp/remoteclaw-agent-scope-${Date.now()}-unrelated`),
    ).toBeUndefined();
  });

  it("matches workspace paths through symlink aliases", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-agent-scope-"));
    const realWorkspaceRoot = path.join(tempRoot, "real-root");
    const realOpsWorkspace = path.join(realWorkspaceRoot, "projects", "ops");
    const aliasWorkspaceRoot = path.join(tempRoot, "alias-root");
    try {
      fs.mkdirSync(path.join(realOpsWorkspace, "src"), { recursive: true });
      fs.symlinkSync(
        realWorkspaceRoot,
        aliasWorkspaceRoot,
        process.platform === "win32" ? "junction" : "dir",
      );

      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "main", workspace: realWorkspaceRoot },
            { id: "ops", workspace: realOpsWorkspace },
          ],
        },
      };

      expect(
        resolveAgentIdByWorkspacePath(cfg, path.join(aliasWorkspaceRoot, "projects", "ops")),
      ).toBe("ops");
      expect(
        resolveAgentIdByWorkspacePath(cfg, path.join(aliasWorkspaceRoot, "projects", "ops", "src")),
      ).toBe("ops");
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("resolveAgentIdsByWorkspacePath", () => {
  it("returns matching workspaces ordered by specificity", () => {
    const workspaceRoot = `/tmp/remoteclaw-agent-scope-${Date.now()}-root`;
    const opsWorkspace = `${workspaceRoot}/projects/ops`;
    const opsDevWorkspace = `${opsWorkspace}/dev`;
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "main", workspace: workspaceRoot },
          { id: "ops", workspace: opsWorkspace },
          { id: "ops-dev", workspace: opsDevWorkspace },
        ],
      },
    };

    expect(resolveAgentIdsByWorkspacePath(cfg, `${opsDevWorkspace}/pkg`)).toEqual([
      "ops-dev",
      "ops",
      "main",
    ]);
  });
});

describe("resolveAgentRuntimeOrThrow", () => {
  it("returns runtime string when per-agent runtime is configured", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", runtime: "gemini" }],
      },
    };
    expect(resolveAgentRuntimeOrThrow(cfg, "main")).toBe("gemini");
  });

  it("returns runtime string when only defaults.runtime is configured", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main" }],
        defaults: { runtime: "claude" },
      },
    };
    expect(resolveAgentRuntimeOrThrow(cfg, "main")).toBe("claude");
  });

  it("prefers per-agent runtime over defaults.runtime", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", runtime: "codex" }],
        defaults: { runtime: "claude" },
      },
    };
    expect(resolveAgentRuntimeOrThrow(cfg, "main")).toBe("codex");
  });

  it("throws when no runtime is configured", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "main" }] },
    };
    expect(() => resolveAgentRuntimeOrThrow(cfg, "main")).toThrow(
      /No runtime configured for agent "main"/,
    );
  });

  it("throws message names the agent id and points to agents.defaults.runtime", () => {
    const cfg: RemoteClawConfig = {};
    expect(() => resolveAgentRuntimeOrThrow(cfg, "worker-42")).toThrow(
      /agent "worker-42".*agents\.defaults\.runtime/s,
    );
  });
});
