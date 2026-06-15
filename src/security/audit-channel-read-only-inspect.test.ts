import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import type { RemoteClawConfig } from "../config/config.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createChannelTestPluginBase, createTestRegistry } from "../test-utils/channel-plugins.js";
import { collectChannelSecurityFindings } from "./audit-channel.js";

const emptyRegistry = createTestRegistry([]);

describe("security audit read-only channel resolution", () => {
  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("resolves channel account info via the read-only inspect path when the audited plugin exposes no inspector", async () => {
    const inspectAccount = vi.fn((_cfg: RemoteClawConfig, accountId?: string | null) => ({
      accountId,
      enabled: true,
      configured: true,
      config: { dangerouslyAllowNameMatching: true },
    }));

    // The registry-resolved plugin exposes the read-only inspector...
    const registeredPlugin = {
      ...createChannelTestPluginBase({
        id: "discord",
        config: { listAccountIds: () => ["default"], inspectAccount },
      }),
      security: {},
    } as ChannelPlugin;
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "discord", source: "test", plugin: registeredPlugin }]),
    );

    // ...but the plugin handed to the audit does NOT, forcing it through the
    // read-only resolution path (inspectReadOnlyChannelAccount -> getChannelPlugin).
    const auditedPlugin = {
      ...createChannelTestPluginBase({
        id: "discord",
        config: { listAccountIds: () => ["default"] },
      }),
      security: {},
    } as ChannelPlugin;

    const cfg: RemoteClawConfig = {
      channels: { discord: { enabled: true, token: "t" } },
    };

    const findings = await collectChannelSecurityFindings({
      cfg,
      plugins: [auditedPlugin],
    });

    expect(inspectAccount).toHaveBeenCalled();
    const finding = findings.find(
      (entry) => entry.checkId === "channels.discord.allowFrom.dangerous_name_matching_enabled",
    );
    expect(finding).toBeDefined();
  });
});
