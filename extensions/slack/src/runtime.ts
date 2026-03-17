import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

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
