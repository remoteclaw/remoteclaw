import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

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
