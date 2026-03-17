import { createPluginRuntimeStore } from "remoteclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "remoteclaw/plugin-sdk/synology-chat";

import type { PluginRuntime } from "remoteclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setSynologyRuntime(r: PluginRuntime): void {
  runtime = r;
}

export function getSynologyRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("Synology Chat runtime not initialized - plugin not registered");
  }
  return runtime;
}
