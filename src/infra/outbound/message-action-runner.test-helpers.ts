import { slackPlugin } from "../../../extensions/slack/src/channel.js";
import { setSlackRuntime } from "../../../extensions/slack/src/runtime.js";
import { telegramPlugin } from "../../../extensions/telegram/src/channel.js";
import { setTelegramRuntime } from "../../../extensions/telegram/src/runtime.js";
import type { RemoteClawConfig } from "../../config/config.js";
import { setActivePluginRegistry } from "../../plugins/runtime.js";
import { createPluginRuntime } from "../../plugins/runtime/index.js";
import { createTestRegistry } from "../../test-utils/channel-plugins.js";

export const slackConfig = {
  agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
  channels: {
    slack: {
      botToken: "xoxb-test",
      appToken: "xapp-test",
    },
  },
} as RemoteClawConfig;

export const telegramConfig = {
  agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] },
  channels: {
    telegram: {
      botToken: "telegram-test",
    },
  },
} as RemoteClawConfig;

export function installMessageActionRunnerTestRegistry() {
  const runtime = createPluginRuntime();
  setSlackRuntime(runtime);
  setTelegramRuntime(runtime);
  setActivePluginRegistry(
    createTestRegistry([
      {
        pluginId: "slack",
        source: "test",
        plugin: slackPlugin,
      },
      {
        pluginId: "telegram",
        source: "test",
        plugin: telegramPlugin,
      },
    ]),
  );
}

export function resetMessageActionRunnerTestRegistry() {
  setActivePluginRegistry(createTestRegistry([]));
}
