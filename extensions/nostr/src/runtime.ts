import type { PluginRuntime } from "remoteclaw/plugin-sdk/compat";

const { setRuntime: setNostrRuntime, getRuntime: getNostrRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Nostr runtime not initialized");
export { getNostrRuntime, setNostrRuntime };
