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
  };
}

describe("registerTtsProvider", () => {
  it("registers a plugin TTS provider", () => {
    const { registry, registerTtsProvider } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const provider = {
      id: "my-custom-tts",
      requiresApiKey: true as const,
      synthesize: async () => ({ audioBuffer: Buffer.from("audio"), format: "mp3" }),
    };

    registerTtsProvider(record, provider);

    expect(registry.ttsProviders).toHaveLength(1);
    expect(registry.ttsProviders[0]).toMatchObject({
      pluginId: "test-plugin",
      provider,
    });
    expect(record.ttsProviderIds).toEqual(["my-custom-tts"]);
  });

  it("rejects provider with empty id", () => {
    const { registry, registerTtsProvider } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const provider = {
      id: "  ",
      requiresApiKey: false as const,
      synthesize: async () => ({ audioBuffer: Buffer.from(""), format: "mp3" }),
    };

    registerTtsProvider(record, provider);

    expect(registry.ttsProviders).toHaveLength(0);
    expect(registry.diagnostics).toHaveLength(1);
    expect(registry.diagnostics[0]).toMatchObject({
      level: "error",
      pluginId: "test-plugin",
      message: expect.stringContaining("missing id"),
    });
  });

  it("rejects duplicate provider id", () => {
    const { registry, registerTtsProvider } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const provider1 = {
      id: "my-tts",
      requiresApiKey: true as const,
      synthesize: async () => ({ audioBuffer: Buffer.from("one"), format: "mp3" }),
    };
    const provider2 = {
      id: "my-tts",
      requiresApiKey: true as const,
      synthesize: async () => ({ audioBuffer: Buffer.from("two"), format: "mp3" }),
    };

    registerTtsProvider(record, provider1);
    registerTtsProvider(record, provider2);

    expect(registry.ttsProviders).toHaveLength(1);
    expect(registry.diagnostics).toHaveLength(1);
    expect(registry.diagnostics[0]).toMatchObject({
      level: "error",
      message: expect.stringContaining("already registered"),
    });
  });

  it("is accessible via plugin API", () => {
    const { registry, createApi } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const api = createApi(record, { config: EMPTY_CONFIG });
    const provider = {
      id: "api-tts",
      requiresApiKey: false as const,
      synthesize: async () => ({ audioBuffer: Buffer.from("via api"), format: "opus" }),
    };

    api.registerTtsProvider(provider);

    expect(registry.ttsProviders).toHaveLength(1);
    expect(registry.ttsProviders[0].provider.id).toBe("api-tts");
    expect(record.ttsProviderIds).toEqual(["api-tts"]);
  });
});
