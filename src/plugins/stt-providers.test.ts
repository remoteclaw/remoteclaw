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

// Note: registerSttProvider is aliased to registerProvider in the registry,
// so STT providers are stored in registry.providers (not registry.sttProviders).
// The record tracks STT provider IDs separately via record.providerIds.
describe("registerSttProvider", () => {
  it("registers a plugin STT provider", () => {
    const { registry, registerSttProvider } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const provider = {
      id: "my-custom-stt",
      transcribeAudio: async () => ({ text: "hello" }),
    };

    registerSttProvider(record, provider as unknown as Parameters<typeof registerSttProvider>[1]);

    expect(registry.providers).toHaveLength(1);
    expect(registry.providers[0]).toMatchObject({
      pluginId: "test-plugin",
      provider,
    });
    expect(record.providerIds).toEqual(["my-custom-stt"]);
  });

  it("rejects provider with empty id", () => {
    const { registry, registerSttProvider } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const provider = {
      id: "  ",
      transcribeAudio: async () => ({ text: "" }),
    };

    registerSttProvider(record, provider as unknown as Parameters<typeof registerSttProvider>[1]);

    expect(registry.providers).toHaveLength(0);
    expect(registry.diagnostics).toHaveLength(1);
    expect(registry.diagnostics[0]).toMatchObject({
      level: "error",
      pluginId: "test-plugin",
      message: expect.stringContaining("missing id"),
    });
  });

  it("rejects duplicate provider id", () => {
    const { registry, registerSttProvider } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord();
    const provider1 = {
      id: "my-stt",
      transcribeAudio: async () => ({ text: "one" }),
    };
    const provider2 = {
      id: "my-stt",
      transcribeAudio: async () => ({ text: "two" }),
    };

    registerSttProvider(record, provider1 as unknown as Parameters<typeof registerSttProvider>[1]);
    registerSttProvider(record, provider2 as unknown as Parameters<typeof registerSttProvider>[1]);

    expect(registry.providers).toHaveLength(1);
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
      id: "api-stt",
      transcribeAudio: async () => ({ text: "via api" }),
    };

    api.registerSttProvider(provider as unknown as Parameters<typeof api.registerSttProvider>[0]);

    expect(registry.providers).toHaveLength(1);
    expect(registry.providers[0].provider.id).toBe("api-stt");
    expect(record.providerIds).toEqual(["api-stt"]);
  });
});
