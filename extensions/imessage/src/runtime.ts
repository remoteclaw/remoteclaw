import {
  createPluginRuntimeStore,
  type PluginRuntime,
} from "../../../src/plugin-sdk-internal/core.js";

let runtime: PluginRuntime | null = null;

export function setIMessageRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getIMessageRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("iMessage runtime not initialized");
  }
  return runtime;
}
