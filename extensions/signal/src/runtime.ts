import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

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
