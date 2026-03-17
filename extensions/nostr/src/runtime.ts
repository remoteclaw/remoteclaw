import type { PluginRuntime } from "remoteclaw/plugin-sdk/nostr";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

const { setRuntime: setNostrRuntime, getRuntime: getNostrRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Nostr runtime not initialized");
export { getNostrRuntime, setNostrRuntime };
