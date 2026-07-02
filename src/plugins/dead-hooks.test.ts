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

describe("conversation hook access gate", () => {
  it("blocks conversation typed hooks for non-bundled plugins unless explicitly allowed", () => {
    const { registry, createApi } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord({ origin: "config" });
    const api = createApi(record, { config: EMPTY_CONFIG });

    api.on("llm_input", vi.fn());
    api.on("llm_output", vi.fn());
    api.on("agent_end", vi.fn());

    expect(registry.typedHooks).toHaveLength(0);
    const blocked = registry.diagnostics.filter((diag) =>
      diag.message.includes(
        "non-bundled plugins must set plugins.entries.test-plugin.hooks.allowConversationAccess=true",
      ),
    );
    expect(blocked).toHaveLength(3);
  });

  it("allows conversation typed hooks for non-bundled plugins when explicitly enabled", () => {
    const { registry, createApi } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord({ origin: "config" });
    const api = createApi(record, {
      config: EMPTY_CONFIG,
      hookPolicy: { allowConversationAccess: true },
    });

    api.on("llm_input", vi.fn());
    api.on("llm_output", vi.fn());
    api.on("agent_end", vi.fn());

    expect(registry.typedHooks.map((entry) => entry.hookName)).toEqual([
      "llm_input",
      "llm_output",
      "agent_end",
    ]);
    expect(registry.diagnostics).toHaveLength(0);
  });

  it("allows conversation typed hooks for bundled plugins by default", () => {
    const { registry, createApi } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord({ origin: "bundled" });
    const api = createApi(record, { config: EMPTY_CONFIG });

    api.on("llm_output", vi.fn());

    expect(registry.typedHooks).toHaveLength(1);
    expect(registry.diagnostics).toHaveLength(0);
  });

  it("blocks conversation typed hooks for bundled plugins that explicitly opt out", () => {
    const { registry, createApi } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord({ origin: "bundled" });
    const api = createApi(record, {
      config: EMPTY_CONFIG,
      hookPolicy: { allowConversationAccess: false },
    });

    api.on("agent_end", vi.fn());

    expect(registry.typedHooks).toHaveLength(0);
    const blocked = registry.diagnostics.filter((diag) =>
      diag.message.includes(
        "blocked by plugins.entries.test-plugin.hooks.allowConversationAccess=false",
      ),
    );
    expect(blocked).toHaveLength(1);
  });

  it("does not gate non-conversation typed hooks for non-bundled plugins", () => {
    const { registry, createApi } = createPluginRegistry(makeRegistryParams());
    const record = makeRecord({ origin: "config" });
    const api = createApi(record, { config: EMPTY_CONFIG });

    api.on("message_received", vi.fn());

    expect(registry.typedHooks).toHaveLength(1);
    expect(registry.diagnostics).toHaveLength(0);
  });
});
