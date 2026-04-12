import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveFirstAgentWorkspace } from "../../agents/agent-scope.js";
import type { RemoteClawConfig } from "../../config/config.js";

describe("plugin-loading workspace resolution — regression for #2308", () => {
  describe("resolveFirstAgentWorkspace", () => {
    it("returns the sole agent's workspace when only one is configured", () => {
      const cfg: RemoteClawConfig = {
        agents: {
          list: [{ id: "ops", workspace: "/tmp/ops" }],
        },
      };
      expect(resolveFirstAgentWorkspace(cfg)).toBe(path.resolve("/tmp/ops"));
    });

    it("returns the first agent's workspace in declaration order for multi-agent configs", () => {
      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "alpha", workspace: "/tmp/alpha" },
            { id: "zulu", workspace: "/tmp/zulu" },
          ],
        },
      };
      expect(resolveFirstAgentWorkspace(cfg)).toBe(path.resolve("/tmp/alpha"));
    });

    it("uses declaration order, not alphabetical order, when the first entry sorts last", () => {
      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "zulu", workspace: "/tmp/zulu" },
            { id: "alpha", workspace: "/tmp/alpha" },
          ],
        },
      };
      // If sorted alphabetically, alpha would win; declaration order must give zulu.
      expect(resolveFirstAgentWorkspace(cfg)).toBe(path.resolve("/tmp/zulu"));
    });

    it("returns null when agents.list is empty", () => {
      const cfg: RemoteClawConfig = {
        agents: { list: [] },
      };
      expect(resolveFirstAgentWorkspace(cfg)).toBeNull();
    });

    it("returns null when agents is entirely absent", () => {
      const cfg: RemoteClawConfig = {};
      expect(resolveFirstAgentWorkspace(cfg)).toBeNull();
    });

    it("returns null when agents.list is present but no entry has a workspace", () => {
      const cfg = {
        agents: {
          list: [{ id: "assistant" }],
        },
      } as unknown as RemoteClawConfig;
      expect(resolveFirstAgentWorkspace(cfg)).toBeNull();
    });

    it("prefers agents.defaults.workspace over per-entry workspace when both are set", () => {
      const cfg: RemoteClawConfig = {
        agents: {
          defaults: { workspace: "/tmp/shared" },
          list: [
            { id: "alpha", workspace: "/tmp/alpha" },
            { id: "ops", workspace: "/tmp/ops" },
          ],
        },
      };
      expect(resolveFirstAgentWorkspace(cfg)).toBe(path.resolve("/tmp/shared"));
    });

    it("does not depend on an agent named 'main'", () => {
      // Explicit regression pin: the pre-#2308 code used DEFAULT_AGENT_ID="main"
      // as a phantom fallback. This multi-agent config has no "main" and no
      // defaults.workspace, which is exactly the scenario that used to crash.
      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "assistant", workspace: "/tmp/assistant" },
            { id: "ops", workspace: "/tmp/ops" },
          ],
        },
      };
      const resolved = resolveFirstAgentWorkspace(cfg);
      expect(resolved).toBe(path.resolve("/tmp/assistant"));
      // Belt-and-braces: the resolved path must not reference a "main" workspace.
      expect(resolved).not.toContain("main");
    });
  });

  describe("resolveOutboundChannelPlugin plugin bootstrap", () => {
    const loadRemoteClawPluginsMock = vi.fn();
    const getChannelPluginMock = vi.fn();
    const getActivePluginRegistryMock = vi.fn();
    const getActivePluginRegistryKeyMock = vi.fn();

    beforeEach(async () => {
      vi.resetModules();
      loadRemoteClawPluginsMock.mockReset();
      getChannelPluginMock.mockReset();
      getActivePluginRegistryMock.mockReset();
      getActivePluginRegistryKeyMock.mockReset();

      // Empty registry forces the bootstrap path; distinct key per test so the
      // module-level bootstrapAttempts cache does not bleed between cases.
      getActivePluginRegistryMock.mockReturnValue({ plugins: [], channels: [], tools: [] });
      getActivePluginRegistryKeyMock.mockReturnValue(`test-${Math.random().toString(36).slice(2)}`);

      vi.doMock("../../plugins/loader.js", () => ({
        loadRemoteClawPlugins: loadRemoteClawPluginsMock,
      }));
      vi.doMock("../../plugins/runtime.js", () => ({
        getActivePluginRegistry: getActivePluginRegistryMock,
        getActivePluginRegistryKey: getActivePluginRegistryKeyMock,
      }));
      vi.doMock("../../channels/plugins/index.js", () => ({
        getChannelPlugin: getChannelPluginMock,
      }));
    });

    it("bootstraps plugins from the sole agent's workspace (no 'main' required)", async () => {
      // First lookup returns undefined → triggers bootstrap. Second lookup (after
      // bootstrap) is not observed — the test asserts on the loader call, not
      // on the returned plugin.
      getChannelPluginMock.mockReturnValue(undefined);

      const { resolveOutboundChannelPlugin } = await import("./channel-resolution.js");

      const cfg: RemoteClawConfig = {
        agents: {
          list: [{ id: "ops", workspace: "/tmp/ops" }],
        },
      };
      resolveOutboundChannelPlugin({ channel: "whatsapp", cfg });

      expect(loadRemoteClawPluginsMock).toHaveBeenCalledTimes(1);
      expect(loadRemoteClawPluginsMock).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceDir: path.resolve("/tmp/ops") }),
      );
    });

    it("does not attempt to bootstrap when no config is supplied", async () => {
      getChannelPluginMock.mockReturnValue(undefined);

      const { resolveOutboundChannelPlugin } = await import("./channel-resolution.js");

      resolveOutboundChannelPlugin({ channel: "whatsapp" });

      expect(loadRemoteClawPluginsMock).not.toHaveBeenCalled();
    });

    it("skips bootstrap when the active registry already has channels", async () => {
      getActivePluginRegistryMock.mockReturnValue({
        plugins: [{ id: "whatsapp" }],
        channels: [
          {
            pluginId: "whatsapp",
            source: "test",
            plugin: { id: "whatsapp" },
          },
        ],
        tools: [],
      });
      getChannelPluginMock.mockReturnValue(undefined);

      const { resolveOutboundChannelPlugin } = await import("./channel-resolution.js");

      const cfg: RemoteClawConfig = {
        agents: {
          list: [{ id: "ops", workspace: "/tmp/ops" }],
        },
      };
      resolveOutboundChannelPlugin({ channel: "whatsapp", cfg });

      expect(loadRemoteClawPluginsMock).not.toHaveBeenCalled();
    });

    // TODO(#2310): Unskip once Phase 2b migrates channel-resolution.ts off the
    // deprecated resolveDefaultAgentId shim. Today's implementation at
    // src/infra/outbound/channel-resolution.ts:48-49 still calls
    // resolveDefaultAgentId(cfg) + resolveAgentWorkspaceDir(cfg, "main"), which
    // throws "agent 'main' has no workspace configured" for a multi-agent
    // config that has neither a "main" entry nor a defaults.workspace. After
    // Phase 2b replaces that pair with resolveFirstAgentWorkspace(cfg), this
    // test should pass unchanged and pin the regression.
    it.skip("bootstraps plugins from the first agent's workspace for multi-agent config without 'main'", async () => {
      getChannelPluginMock.mockReturnValue(undefined);

      const { resolveOutboundChannelPlugin } = await import("./channel-resolution.js");

      const cfg: RemoteClawConfig = {
        agents: {
          list: [
            { id: "alpha", workspace: "/tmp/alpha" },
            { id: "ops", workspace: "/tmp/ops" },
          ],
        },
      };
      resolveOutboundChannelPlugin({ channel: "whatsapp", cfg });

      expect(loadRemoteClawPluginsMock).toHaveBeenCalledTimes(1);
      expect(loadRemoteClawPluginsMock).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceDir: path.resolve("/tmp/alpha") }),
      );
    });
  });
});
