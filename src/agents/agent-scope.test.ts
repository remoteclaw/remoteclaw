import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import {
  resolveAgentAuth,
  resolveAgentConfig,
  resolveAgentDir,
  resolveAgentRuntime,
  resolveAgentRuntimeArgs,
  resolveAgentRuntimeEnv,
  resolveAgentRuntimeOrThrow,
  resolveFallbackAgentId,
  resolveAgentWorkspaceDir,
  resolveAgentWorkspaceDirOrNull,
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
          },
        ],
      },
    };
    const result = resolveAgentConfig(cfg, "main");
    expect(result).toEqual({
      name: "Main Agent",
      workspace: "~/remoteclaw",
      agentDir: "~/.remoteclaw/agents/main",
      identity: undefined,
      groupChat: undefined,
      subagents: undefined,
      sandbox: undefined,
      tools: undefined,
    });
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
            },
          },
        ],
      },
    };
    const result = resolveAgentConfig(cfg, "restricted");
    expect(result?.tools).toEqual({
      allow: ["read"],
      deny: ["exec", "write"],
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

  it("should include runtime in resolved agent config", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw", runtime: "gemini" }],
      },
    };
    const result = resolveAgentConfig(cfg, "main");
    expect(result?.runtime).toBe("gemini");
  });
});

describe("resolveAgentRuntime", () => {
  it("returns undefined when no agents config exists", () => {
    expect(resolveAgentRuntime({}, "main")).toBeUndefined();
  });

  it("returns undefined when agent has no runtime and no defaults", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntime(cfg, "main")).toBeUndefined();
  });

  it("inherits runtime from defaults when agent entry has no runtime", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntime(cfg, "main")).toBe("claude");
  });

  it("agent entry runtime overrides defaults runtime", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/remoteclaw", runtime: "gemini" }],
      },
    };
    expect(resolveAgentRuntime(cfg, "main")).toBe("gemini");
  });

  it("returns defaults runtime when agent entry does not exist", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "codex" },
        list: [{ id: "other", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntime(cfg, "main")).toBe("codex");
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

describe("resolveAgentRuntimeOrThrow", () => {
  it("returns runtime when set on agent entry", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/remoteclaw", runtime: "gemini" }],
      },
    };
    expect(resolveAgentRuntimeOrThrow(cfg, "main")).toBe("gemini");
  });

  it("falls back to defaults runtime", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntimeOrThrow(cfg, "main")).toBe("claude");
  });

  it("throws when no runtime is configured", () => {
    expect(() => resolveAgentRuntimeOrThrow({}, "main")).toThrow("No runtime configured");
  });

  it("includes supported providers in error message", () => {
    expect(() => resolveAgentRuntimeOrThrow({}, "main")).toThrow("claude, gemini, codex, opencode");
  });
});

describe("resolveAgentRuntimeArgs", () => {
  it("returns undefined when no agents config exists", () => {
    expect(resolveAgentRuntimeArgs({}, "main")).toBeUndefined();
  });

  it("returns undefined when agent has no runtimeArgs and no defaults", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntimeArgs(cfg, "main")).toBeUndefined();
  });

  it("inherits runtimeArgs from defaults when agent entry has none", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtimeArgs: ["--verbose"] },
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntimeArgs(cfg, "main")).toEqual(["--verbose"]);
  });

  it("agent entry runtimeArgs replaces defaults entirely", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtimeArgs: ["--verbose"] },
        list: [{ id: "main", workspace: "~/remoteclaw", runtimeArgs: ["--model", "sonnet"] }],
      },
    };
    expect(resolveAgentRuntimeArgs(cfg, "main")).toEqual(["--model", "sonnet"]);
  });

  it("returns defaults runtimeArgs when agent entry does not exist", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtimeArgs: ["--dangerously-skip-permissions"] },
        list: [{ id: "other", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntimeArgs(cfg, "main")).toEqual(["--dangerously-skip-permissions"]);
  });

  it("agent entry with empty runtimeArgs clears defaults", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtimeArgs: ["--verbose"] },
        list: [{ id: "main", workspace: "~/remoteclaw", runtimeArgs: [] }],
      },
    };
    // Empty array is truthy — per-agent [] replaces defaults entirely.
    expect(resolveAgentRuntimeArgs(cfg, "main")).toEqual([]);
  });
});

describe("resolveAgentRuntimeEnv", () => {
  it("returns undefined when no agents config exists", () => {
    expect(resolveAgentRuntimeEnv({}, "main")).toBeUndefined();
  });

  it("returns undefined when agent has no runtimeEnv and no defaults", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntimeEnv(cfg, "main")).toBeUndefined();
  });

  it("inherits runtimeEnv from defaults when agent entry has none", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtimeEnv: { API_KEY: "sk-default" } },
        list: [{ id: "main", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntimeEnv(cfg, "main")).toEqual({ API_KEY: "sk-default" });
  });

  it("agent entry runtimeEnv replaces defaults entirely", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtimeEnv: { API_KEY: "sk-default", SHARED: "yes" } },
        list: [
          {
            id: "main",
            workspace: "~/remoteclaw",
            runtimeEnv: { API_KEY: "sk-agent-specific" },
          },
        ],
      },
    };
    // Per-agent replaces entirely — SHARED is NOT inherited.
    expect(resolveAgentRuntimeEnv(cfg, "main")).toEqual({ API_KEY: "sk-agent-specific" });
  });

  it("returns defaults runtimeEnv when agent entry does not exist", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        defaults: { runtimeEnv: { API_KEY: "sk-default" } },
        list: [{ id: "other", workspace: "~/remoteclaw" }],
      },
    };
    expect(resolveAgentRuntimeEnv(cfg, "main")).toEqual({ API_KEY: "sk-default" });
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
