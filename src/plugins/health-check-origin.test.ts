import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  POLICY_CHECK_IDS,
  registerPolicyDoctorChecks,
  resetPolicyDoctorChecksForTest,
} from "../../extensions/policy/src/doctor/register.js";
import type { RemoteClawConfig } from "../config/config.js";
import {
  clearHealthChecksForTest,
  isBundledOriginCheck,
} from "../plugin-sdk/_health/health-check-registry.js";
import type { HealthCheck } from "../plugin-sdk/_health/health-checks.js";
import { createPluginRegistry, type PluginRecord } from "./registry.js";
import type { PluginRuntime } from "./runtime/types.js";

// #2896 — the OPT-A wiring: `createApi().registerHealthCheck` marks a check
// bundled-origin ONLY when the loader-derived `record.origin === "bundled"`. This is
// the sole path that lets a check's `repair()` persist under `doctor --fix`. These
// tests prove (1) the origin gate in `createApi`, and (2) that the REAL bundled
// `policy` extension routes through it, so its checks are marked bundled-origin.

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

function stubCheck(id: string): HealthCheck {
  return {
    id,
    kind: "plugin",
    description: `${id} check`,
    async detect() {
      return [];
    },
  };
}

describe("api.registerHealthCheck origin marking (#2896)", () => {
  beforeEach(() => clearHealthChecksForTest());
  afterEach(() => clearHealthChecksForTest());

  it("marks a check bundled-origin when the plugin is bundled", () => {
    const { createApi } = createPluginRegistry(makeRegistryParams());
    const api = createApi(makeRecord({ origin: "bundled" }), { config: EMPTY_CONFIG });

    api.registerHealthCheck(stubCheck("bundled/x"));

    expect(isBundledOriginCheck("bundled/x")).toBe(true);
  });

  it("does NOT mark a check bundled-origin for a non-bundled plugin", () => {
    const { createApi } = createPluginRegistry(makeRegistryParams());
    for (const origin of ["global", "workspace", "config"] as const) {
      clearHealthChecksForTest();
      const api = createApi(makeRecord({ origin }), { config: EMPTY_CONFIG });

      api.registerHealthCheck(stubCheck(`${origin}/x`));

      expect(isBundledOriginCheck(`${origin}/x`)).toBe(false);
    }
  });
});

describe("bundled policy ext registers as bundled-origin (#2896)", () => {
  beforeEach(() => {
    clearHealthChecksForTest();
    resetPolicyDoctorChecksForTest();
  });
  afterEach(() => {
    clearHealthChecksForTest();
    resetPolicyDoctorChecksForTest();
  });

  it("marks every policy check bundled-origin via the bundled api host", () => {
    const { createApi } = createPluginRegistry(makeRegistryParams());
    const api = createApi(makeRecord({ id: "policy", origin: "bundled" }), {
      config: EMPTY_CONFIG,
    });

    // Mirrors extensions/policy/index.ts `register(api)`.
    registerPolicyDoctorChecks({ registerHealthCheck: (check) => api.registerHealthCheck(check) });

    // The one repairable check must be bundled-origin so `doctor --fix` persists it.
    expect(isBundledOriginCheck("policy/channels-denied-provider")).toBe(true);
    // ...and so must every other policy check.
    expect(POLICY_CHECK_IDS.every((id) => isBundledOriginCheck(id))).toBe(true);
  });

  it("would NOT mark the policy checks if the ext were loaded as non-bundled", () => {
    const { createApi } = createPluginRegistry(makeRegistryParams());
    const api = createApi(makeRecord({ id: "policy", origin: "config" }), { config: EMPTY_CONFIG });

    registerPolicyDoctorChecks({ registerHealthCheck: (check) => api.registerHealthCheck(check) });

    expect(isBundledOriginCheck("policy/channels-denied-provider")).toBe(false);
  });
});
