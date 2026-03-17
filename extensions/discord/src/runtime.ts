import {
  createPluginRuntimeStore,
  type PluginRuntime,
} from "../../../src/plugin-sdk-internal/core.js";

let runtime: PluginRuntime | null = null;

export function setDiscordRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getDiscordRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Discord runtime not initialized");
  }
  return runtime;
}
