import { describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { createPluginRegistry, type PluginRecord } from "./registry.js";
import type { PluginRuntime } from "./runtime/types.js";

const EMPTY_CONFIG = {} as RemoteClawConfig;

function makeRegistryParams() {
  return {
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    runtime: {} as PluginRuntime,
  };
}

function makeRecord(overrides?: Partial<PluginRecord>): PluginRecord {
  return {
    id: "test-plugin",
    name: "test-plugin",
    source: "/tmp/test-plugin.js",
    origin: "global" as const,
    enabled: true,
    status: "loaded" as const,
    toolNames: [],
    hookNames: [],
    channelIds: [],
    providerIds: [],
    sttProviderIds: [],
    ttsProviderIds: [],
    gatewayMethods: [],
    cliCommands: [],
    services: [],
    commands: [],
    httpHandlers: 0,
    hookCount: 0,
    configSchema: false,
    ...overrides,
  } as PluginRecord;
}

describe("hook registration (post-gut)", () => {
  it("registers hooks via registerHook", () => {
    const { registry, registerHook } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const handler = vi.fn();

    registerHook(record, "message_received", handler, { name: "test-hook" }, EMPTY_CONFIG);

    expect(registry.hooks).toHaveLength(1);
    expect(registry.diagnostics).toHaveLength(0);
  });

  it("registers typed hooks via api.on()", () => {
    const { registry, createApi } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const api = createApi(record, { config: EMPTY_CONFIG });

    api.on("message_received", vi.fn());

    expect(registry.typedHooks).toHaveLength(1);
    expect(registry.diagnostics).toHaveLength(0);
  });
});
