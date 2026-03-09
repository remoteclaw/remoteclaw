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

const DEAD_HOOK_NAMES = [
  "before_model_resolve",
  "before_prompt_build",
  "before_agent_start",
  "llm_input",
  "llm_output",
  "tool_result_persist",
] as const;

describe("dead hook guards", () => {
  describe("registerHook (legacy string-based)", () => {
    it.each(DEAD_HOOK_NAMES)("warns and skips dead hook: %s", (hookName) => {
      const { registry, registerHook } = createPluginRegistry(makeRegistryParams());
      const record = makeRecord();
      const handler = vi.fn();

      registerHook(record, hookName, handler, { name: "test-hook" }, EMPTY_CONFIG);

      // Hook should NOT be registered
      expect(registry.hooks).toHaveLength(0);

      // Diagnostic warning should be pushed
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0]).toMatchObject({
        level: "warn",
        pluginId: "test-plugin",
        message: expect.stringContaining(hookName),
      });
      expect(registry.diagnostics[0].message).toContain("CLI-only mode");
    });

    it("allows live hooks through without warnings", () => {
      const { registry, registerHook } = createPluginRegistry(makeRegistryParams());
      const record = makeRecord();
      const handler = vi.fn();

      registerHook(record, "message_received", handler, { name: "test-hook" }, EMPTY_CONFIG);

      expect(registry.hooks).toHaveLength(1);
      expect(registry.diagnostics).toHaveLength(0);
    });

    it("filters dead hooks from a mixed array, keeping live ones", () => {
      const { registry, registerHook } = createPluginRegistry(makeRegistryParams());
      const record = makeRecord();
      const handler = vi.fn();

      registerHook(
        record,
        ["llm_input", "message_received", "llm_output"],
        handler,
        { name: "test-hook" },
        EMPTY_CONFIG,
      );

      // Only the live hook should be registered
      expect(registry.hooks).toHaveLength(1);
      expect(registry.hooks[0].events).toEqual(["message_received"]);

      // Two dead hooks should produce two warnings
      expect(registry.diagnostics).toHaveLength(2);
      expect(registry.diagnostics[0].message).toContain("llm_input");
      expect(registry.diagnostics[1].message).toContain("llm_output");
    });

    it("returns early when all events in array are dead", () => {
      const { registry, registerHook } = createPluginRegistry(makeRegistryParams());
      const record = makeRecord();
      const handler = vi.fn();

      registerHook(
        record,
        ["llm_input", "llm_output"],
        handler,
        { name: "test-hook" },
        EMPTY_CONFIG,
      );

      expect(registry.hooks).toHaveLength(0);
      expect(registry.diagnostics).toHaveLength(2);
    });
  });

  describe("api.on() (typed hook)", () => {
    it("warns and skips dead hook via api.on()", () => {
      const { registry, createApi } = createPluginRegistry(makeRegistryParams());
      const record = makeRecord();
      const api = createApi(record, { config: EMPTY_CONFIG });

      // Cast to bypass TypeScript — simulates JS extension or old type defs
      (api.on as (name: string, handler: () => void) => void)("llm_input", vi.fn());

      // Typed hook should NOT be registered
      expect(registry.typedHooks).toHaveLength(0);

      // Diagnostic warning should be pushed
      expect(registry.diagnostics).toHaveLength(1);
      expect(registry.diagnostics[0]).toMatchObject({
        level: "warn",
        pluginId: "test-plugin",
        message: expect.stringContaining("llm_input"),
      });
      expect(registry.diagnostics[0].message).toContain("CLI-only mode");
    });

    it("allows live hooks through api.on() without warnings", () => {
      const { registry, createApi } = createPluginRegistry(makeRegistryParams());
      const record = makeRecord();
      const api = createApi(record, { config: EMPTY_CONFIG });

      api.on("message_received", vi.fn());

      expect(registry.typedHooks).toHaveLength(1);
      expect(registry.diagnostics).toHaveLength(0);
    });
  });
});
