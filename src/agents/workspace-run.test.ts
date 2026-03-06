import path from "node:path";
import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveRunWorkspaceDir } from "./workspace-run.js";

describe("resolveRunWorkspaceDir", () => {
  it("resolves explicit workspace values without fallback", () => {
    const explicit = path.join(process.cwd(), "tmp", "workspace-run-explicit");
    const result = resolveRunWorkspaceDir({
      workspaceDir: explicit,
      sessionKey: "agent:main:subagent:test",
    });

    expect(result.usedFallback).toBe(false);
    expect(result.agentId).toBe("main");
    expect(result.workspaceDir).toBe(path.resolve(explicit));
  });

  it("falls back to configured per-agent workspace when input is missing", () => {
    const defaultWorkspace = path.join(process.cwd(), "tmp", "workspace-default-main");
    const researchWorkspace = path.join(process.cwd(), "tmp", "workspace-research");
    const cfg = {
      agents: {
        defaults: { workspace: defaultWorkspace },
        list: [{ id: "research", workspace: researchWorkspace }],
      },
    } satisfies RemoteClawConfig;

    const result = resolveRunWorkspaceDir({
      workspaceDir: undefined,
      sessionKey: "agent:research:subagent:test",
      config: cfg,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe("missing");
    expect(result.agentId).toBe("research");
    expect(result.workspaceDir).toBe(path.resolve(researchWorkspace));
  });

  it("falls back to per-agent workspace for blank strings", () => {
    const mainWorkspace = path.join(process.cwd(), "tmp", "workspace-default-main");
    const cfg = {
      agents: {
        list: [{ id: "main", workspace: mainWorkspace }],
      },
    } satisfies RemoteClawConfig;

    const result = resolveRunWorkspaceDir({
      workspaceDir: "   ",
      sessionKey: "agent:main:subagent:test",
      config: cfg,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.fallbackReason).toBe("blank");
    expect(result.agentId).toBe("main");
    expect(result.workspaceDir).toBe(path.resolve(mainWorkspace));
  });

  it("throws when config has no workspace for the resolved agent", () => {
    expect(() =>
      resolveRunWorkspaceDir({
        workspaceDir: null,
        sessionKey: "agent:main:subagent:test",
        config: undefined,
      }),
    ).toThrow("agent 'main' has no workspace configured");
  });

  it("throws for malformed agent session keys", () => {
    expect(() =>
      resolveRunWorkspaceDir({
        workspaceDir: undefined,
        sessionKey: "agent::broken",
        config: undefined,
      }),
    ).toThrow("Malformed agent session key");
  });

  it("throws when explicit agent id has no configured workspace", () => {
    expect(() =>
      resolveRunWorkspaceDir({
        workspaceDir: undefined,
        sessionKey: "definitely-not-a-valid-session-key",
        agentId: "research",
        config: undefined,
      }),
    ).toThrow("agent 'research' has no workspace configured");
  });

  it("throws for malformed agent session keys even when config has a default agent", () => {
    const mainWorkspace = path.join(process.cwd(), "tmp", "workspace-main-default");
    const researchWorkspace = path.join(process.cwd(), "tmp", "workspace-research-default");
    const cfg = {
      agents: {
        defaults: { workspace: mainWorkspace },
        list: [
          { id: "main", workspace: mainWorkspace },
          { id: "research", workspace: researchWorkspace, default: true },
        ],
      },
    } satisfies RemoteClawConfig;

    expect(() =>
      resolveRunWorkspaceDir({
        workspaceDir: undefined,
        sessionKey: "agent::broken",
        config: cfg,
      }),
    ).toThrow("Malformed agent session key");
  });

  it("treats non-agent legacy keys as default, not malformed", () => {
    const fallbackWorkspace = path.join(process.cwd(), "tmp", "workspace-default-legacy");
    const cfg = {
      agents: {
        list: [{ id: "main", workspace: fallbackWorkspace }],
      },
    } satisfies RemoteClawConfig;

    const result = resolveRunWorkspaceDir({
      workspaceDir: undefined,
      sessionKey: "custom-main-key",
      config: cfg,
    });

    expect(result.agentId).toBe("main");
    expect(result.agentIdSource).toBe("default");
    expect(result.workspaceDir).toBe(path.resolve(fallbackWorkspace));
  });
});
