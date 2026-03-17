import {
  createPluginRuntimeStore,
  type PluginRuntime,
} from "../../../src/plugin-sdk-internal/core.js";

let runtime: PluginRuntime | null = null;

export function setSlackRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getSlackRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Slack runtime not initialized");
  }
  return runtime;
}
