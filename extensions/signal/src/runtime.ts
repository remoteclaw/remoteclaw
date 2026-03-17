import {
  createPluginRuntimeStore,
  type PluginRuntime,
} from "../../../src/plugin-sdk-internal/core.js";

let runtime: PluginRuntime | null = null;

export function setSignalRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getSignalRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Signal runtime not initialized");
  }
  return runtime;
}
