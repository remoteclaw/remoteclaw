import type { PluginRuntime } from "./types.js";

export function createRuntimeTools(): PluginRuntime["tools"] {
  return {
    createMemoryGetTool: () => undefined,
    createMemorySearchTool: () => undefined,
    registerMemoryCli: () => {},
  };
}
