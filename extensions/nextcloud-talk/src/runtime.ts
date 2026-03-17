import type { PluginRuntime } from "remoteclaw/plugin-sdk/nextcloud-talk";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setNextcloudTalkRuntime, getRuntime: getNextcloudTalkRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Nextcloud Talk runtime not initialized");
export { getNextcloudTalkRuntime, setNextcloudTalkRuntime };
