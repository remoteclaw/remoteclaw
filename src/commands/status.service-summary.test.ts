import { describe, expect, it, vi } from "vitest";
import type { GatewayService } from "../daemon/service.js";
import type { GatewayServiceEnvArgs } from "../daemon/service.js";
import { readServiceStatusSummary } from "./status.service-summary.js";

function createService(overrides: Partial<GatewayService>): GatewayService {
  return {
    label: "systemd",
    loadedText: "enabled",
    notLoadedText: "disabled",
    install: vi.fn(async () => {}),
    uninstall: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    restart: vi.fn(async () => ({ outcome: "completed" as const })),
    isLoaded: vi.fn(async () => false),
    readCommand: vi.fn(async () => null),
    readRuntime: vi.fn(async () => ({ status: "stopped" as const })),
    ...overrides,
  };
}

function requireMockArg(mock: { mock: { calls: unknown[][] } }, label: string): unknown {
  const call = mock.mock.calls.at(0);
  if (!call) {
    throw new Error(`expected ${label} call`);
  }
  return call[0];
}

describe("readServiceStatusSummary", () => {
  it("marks RemoteClaw-managed services as installed", async () => {
    const summary = await readServiceStatusSummary(
      createService({
        isLoaded: vi.fn(async () => true),
        readCommand: vi.fn(async () => ({ programArguments: ["remoteclaw", "gateway", "run"] })),
        readRuntime: vi.fn(async () => ({ status: "running" })),
      }),
      "Daemon",
    );

    expect(summary.installed).toBe(true);
    expect(summary.managedByRemoteClaw).toBe(true);
    expect(summary.externallyManaged).toBe(false);
    expect(summary.loadedText).toBe("enabled");
  });

  it("marks running unmanaged services as externally managed", async () => {
    const summary = await readServiceStatusSummary(
      createService({
        readRuntime: vi.fn(async () => ({ status: "running" })),
      }),
      "Daemon",
    );

    expect(summary.installed).toBe(true);
    expect(summary.managedByRemoteClaw).toBe(false);
    expect(summary.externallyManaged).toBe(true);
    expect(summary.loadedText).toBe("running (externally managed)");
  });

  it("keeps missing services as not installed when nothing is running", async () => {
    const summary = await readServiceStatusSummary(createService({}), "Daemon");

    expect(summary.installed).toBe(false);
    expect(summary.managedByRemoteClaw).toBe(false);
    expect(summary.externallyManaged).toBe(false);
    expect(summary.loadedText).toBe("disabled");
  });

  it("passes command environment to runtime and loaded checks", async () => {
    const isLoaded = vi.fn(async ({ env }: GatewayServiceEnvArgs) => {
      return env?.REMOTECLAW_GATEWAY_PORT === "18789";
    });
    const readRuntime = vi.fn(async (env?: NodeJS.ProcessEnv) => ({
      status:
        env?.REMOTECLAW_GATEWAY_PORT === "18789" ? ("running" as const) : ("unknown" as const),
    }));

    const summary = await readServiceStatusSummary(
      createService({
        isLoaded,
        readCommand: vi.fn(async () => ({
          programArguments: ["remoteclaw", "gateway", "run", "--port", "18789"],
          environment: { REMOTECLAW_GATEWAY_PORT: "18789" },
        })),
        readRuntime,
      }),
      "Daemon",
    );

    const loadedArgs = requireMockArg(isLoaded, "isLoaded") as GatewayServiceEnvArgs;
    expect(loadedArgs?.env?.REMOTECLAW_GATEWAY_PORT).toBe("18789");
    const runtimeEnv = requireMockArg(readRuntime, "readRuntime") as NodeJS.ProcessEnv;
    expect(runtimeEnv?.REMOTECLAW_GATEWAY_PORT).toBe("18789");
    expect(summary.installed).toBe(true);
    expect(summary.loaded).toBe(true);
    expect(summary.runtime?.status).toBe("running");
  });
});
