import type { PluginRuntime } from "remoteclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";

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
