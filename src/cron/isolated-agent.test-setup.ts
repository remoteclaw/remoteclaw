import { vi } from "vitest";
import { runSubagentAnnounceFlow } from "../agents/subagent-announce.js";
import { telegramOutbound } from "../channels/plugins/outbound/telegram.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../test-utils/channel-plugins.js";

export function setupIsolatedAgentTurnMocks(params?: { fast?: boolean }): void {
  if (params?.fast) {
    vi.stubEnv("REMOTECLAW_TEST_FAST", "1");
  }
  vi.mocked(runSubagentAnnounceFlow).mockReset().mockResolvedValue(true);
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "telegram",
        plugin: createOutboundTestPlugin({ id: "telegram", outbound: telegramOutbound }),
        source: "test",
      },
    ]),
  );
}
