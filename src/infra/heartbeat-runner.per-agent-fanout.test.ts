import { afterEach, describe, expect, it, vi } from "vitest";
import { listAgentIds, resolveSoleAgentId } from "../agents/agent-scope.js";
import type { RemoteClawConfig } from "../config/config.js";
import { startHeartbeatRunner } from "./heartbeat-runner.js";
import { resetHeartbeatWakeStateForTests } from "./heartbeat-wake.js";

// The pre-#2310 phantom default; pinned as an anti-value to catch regressions
// that re-introduce a default-agent fallback.
const PHANTOM_DEFAULT = "main";

// Regression coverage for #2310 (Wave 3/6 — "eliminate default agent" initiative).
//
// These assertions pin two invariants established by #2310:
//
//   1. `listAgentIds()` returns `[]` for empty configs (no phantom default
//      injection). Pre-#2310 it returned the PHANTOM_DEFAULT id, which caused
//      `startHeartbeatRunner` to create a heartbeat for a phantom agent that
//      wasn't in the config.
//
//   2. `startHeartbeatRunner` fans heartbeats out per configured agent using
//      the actual agent IDs from `listAgentIds`, not the PHANTOM_DEFAULT.
//      With 3 agents configured, one heartbeat per agent fires in
//      declaration order. With 0 agents configured, zero heartbeats fire.
//
// These tests intentionally use explicit agent IDs ("alpha", "beta", "gamma",
// "solo") and never the phantom default. A test that used the phantom default
// as the fixture agent ID would not catch a regression that re-introduced a
// default fallback — the fixture name would mask the bug.
//
// Note: `src/agents/agent-scope.test.ts` is excluded from `vitest.unit.config.ts`
// (pre-existing exclusion from the fork gut work), so direct unit tests on
// `listAgentIds` in that file do not run under `pnpm test`. The direct
// assertions below provide runnable coverage for the same regression.

describe("listAgentIds (regression: #2310 — no phantom main injection)", () => {
  it("returns empty array for empty config", () => {
    expect(listAgentIds({})).toEqual([]);
  });

  it("returns empty array when agents.list is an explicit empty array", () => {
    expect(listAgentIds({ agents: { list: [] } })).toEqual([]);
  });

  it("returns all configured agent IDs in declaration order", () => {
    const cfg: RemoteClawConfig = {
      agents: {
        list: [
          { id: "alpha", workspace: "~/alpha" },
          { id: "beta", workspace: "~/beta" },
          { id: "gamma", workspace: "~/gamma" },
        ],
      },
    };
    expect(listAgentIds(cfg)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("resolveSoleAgentId returns null for empty config (not 'main')", () => {
    expect(resolveSoleAgentId({})).toBeNull();
  });

  it("resolveSoleAgentId returns null for multi-agent config (not the first agent)", () => {
    const cfg: RemoteClawConfig = {
      agents: { list: [{ id: "alpha" }, { id: "beta" }] },
    };
    expect(resolveSoleAgentId(cfg)).toBeNull();
  });
});

describe("startHeartbeatRunner per-agent fanout (regression: #2310)", () => {
  afterEach(() => {
    resetHeartbeatWakeStateForTests();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("fires one heartbeat per agent in a 3-agent config, in declaration order", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const runSpy = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    const runner = startHeartbeatRunner({
      cfg: {
        agents: {
          defaults: { heartbeat: { every: "30m" } },
          list: [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }],
        },
      } as RemoteClawConfig,
      runOnce: runSpy,
    });

    await vi.advanceTimersByTimeAsync(30 * 60_000 + 1_000);

    expect(runSpy).toHaveBeenCalledTimes(3);
    const firedAgentIds = runSpy.mock.calls.map((call) => call[0]?.agentId);
    expect(firedAgentIds).toEqual(["alpha", "beta", "gamma"]);
    // Belt-and-braces: none of the calls fired for the phantom default agent.
    expect(firedAgentIds).not.toContain(PHANTOM_DEFAULT);

    runner.stop();
  });

  it("fires heartbeat with the explicit agent ID for a sole agent (not 'main')", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const runSpy = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    const runner = startHeartbeatRunner({
      cfg: {
        agents: {
          defaults: { heartbeat: { every: "30m" } },
          list: [{ id: "solo" }],
        },
      } as RemoteClawConfig,
      runOnce: runSpy,
    });

    await vi.advanceTimersByTimeAsync(30 * 60_000 + 1_000);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(runSpy.mock.calls[0]?.[0]?.agentId).toBe("solo");
    expect(runSpy.mock.calls[0]?.[0]?.agentId).not.toBe(PHANTOM_DEFAULT);

    runner.stop();
  });

  it("fires zero heartbeats when agents.list is empty (no phantom main heartbeat)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const runSpy = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    const runner = startHeartbeatRunner({
      cfg: {
        agents: {
          defaults: { heartbeat: { every: "30m" } },
          list: [],
        },
      } as RemoteClawConfig,
      runOnce: runSpy,
    });

    // Advance well beyond one interval: if any phantom agent was registered,
    // its heartbeat would have fired by now.
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(runSpy).not.toHaveBeenCalled();

    runner.stop();
  });

  it("fires zero heartbeats when agents config is entirely absent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    const runSpy = vi.fn().mockResolvedValue({ status: "ran", durationMs: 1 });
    const runner = startHeartbeatRunner({
      cfg: {} as RemoteClawConfig,
      runOnce: runSpy,
    });

    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(runSpy).not.toHaveBeenCalled();

    runner.stop();
  });
});
