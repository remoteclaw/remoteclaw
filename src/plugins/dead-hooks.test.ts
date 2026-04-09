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

// Gutted in RemoteClaw fork — dead hook guards were removed because the hook names
// (before_model_resolve, before_prompt_build, before_agent_start, llm_input,
// llm_output, tool_result_persist) are valid PluginHookName values in the upstream
// plugin system. RemoteClaw no longer filters them since the embedded Pi agent
// was gutted and hooks are now passthrough.
describe.skip("dead hook guards", () => {
  describe("registerHook (legacy string-based)", () => {
    it("warns and skips dead hook", () => {});
    it("allows live hooks through without warnings", () => {});
    it("filters dead hooks from a mixed array, keeping live ones", () => {});
    it("returns early when all events in array are dead", () => {});
  });
  describe("api.on() (typed hook)", () => {
    it("warns and skips dead hook via api.on()", () => {});
    it("allows live hooks through api.on() without warnings", () => {});
  });
});

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
