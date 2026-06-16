import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDeps } from "../cli/deps.js";
import type { RemoteClawConfig } from "../config/config.js";
import { SsrFBlockedError } from "../infra/net/ssrf.js";

const enqueueSystemEventMock = vi.fn();
const requestHeartbeatNowMock = vi.fn();
const loadConfigMock = vi.fn();
const fetchWithSsrFGuardMock = vi.fn();

function enqueueSystemEvent(...args: unknown[]) {
  return enqueueSystemEventMock(...args);
}

function requestHeartbeatNow(...args: unknown[]) {
  return requestHeartbeatNowMock(...args);
}

vi.mock("../infra/system-events.js", () => ({
  enqueueSystemEvent,
}));

vi.mock("../infra/heartbeat-wake.js", () => ({
  requestHeartbeatNow,
}));

vi.mock("../config/config.js", async () => {
  const actual = await vi.importActual<typeof import("../config/config.js")>("../config/config.js");
  return {
    ...actual,
    loadConfig: () => loadConfigMock(),
  };
});

vi.mock("../infra/net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: (...args: unknown[]) => fetchWithSsrFGuardMock(...args),
}));

import { buildGatewayCronService } from "./server-cron.js";

function createCronConfig(name: string): RemoteClawConfig {
  const tmpDir = path.join(os.tmpdir(), `${name}-${Date.now()}`);
  return {
    session: {
      mainKey: "main",
    },
    // Schema migration #1581 requires a non-empty agents.list; the default agent
    // id resolves to this entry ("main"), which scopes session keys as
    // agent:main:<sessionKey>. Without it, resolveDefaultAgentId falls back to
    // the fork's DEFAULT_AGENT_ID ("default") and the scoped keys would be
    // agent:default:..., not the agent:main:... the assertions below expect.
    agents: {
      list: [{ id: "main", workspace: tmpDir }],
    },
    cron: {
      store: path.join(tmpDir, "cron.json"),
    },
  } as RemoteClawConfig;
}

describe("buildGatewayCronService", () => {
  beforeEach(() => {
    enqueueSystemEventMock.mockClear();
    requestHeartbeatNowMock.mockClear();
    loadConfigMock.mockClear();
    fetchWithSsrFGuardMock.mockClear();
  });

  it("routes main-target jobs to the scoped session for enqueue + wake", async () => {
    const cfg = createCronConfig("server-cron");
    loadConfigMock.mockReturnValue(cfg);

    const state = buildGatewayCronService({
      cfg,
      deps: {} as CliDeps,
      broadcast: () => {},
    });
    try {
      const job = await state.cron.add({
        name: "canonicalize-session-key",
        enabled: true,
        schedule: { kind: "at", at: new Date(1).toISOString() },
        sessionTarget: "main",
        wakeMode: "next-heartbeat",
        sessionKey: "discord:channel:ops",
        payload: { kind: "systemEvent", text: "hello" },
      });

      await state.cron.run(job.id, "force");

      expect(enqueueSystemEventMock).toHaveBeenCalledWith(
        "hello",
        expect.objectContaining({
          sessionKey: "agent:main:discord:channel:ops",
        }),
      );
      expect(requestHeartbeatNowMock).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionKey: "agent:main:discord:channel:ops",
        }),
      );
    } finally {
      state.cron.stop();
    }
  });

  it("forwards heartbeat overrides through the cron wake adapter", () => {
    const cfg = createCronConfig("server-cron-heartbeat-override");
    loadConfigMock.mockReturnValue(cfg);

    const state = buildGatewayCronService({
      cfg,
      deps: {} as CliDeps,
      broadcast: () => {},
    });
    try {
      const cronDeps = (
        state.cron as unknown as {
          state?: {
            deps?: {
              requestHeartbeatNow?: (opts?: {
                agentId?: string;
                sessionKey?: string | null;
                reason?: string;
                heartbeat?: { target?: string };
              }) => void;
            };
          };
        }
      ).state?.deps;

      cronDeps?.requestHeartbeatNow?.({
        reason: "cron:test",
        sessionKey: "discord:channel:ops",
        heartbeat: { target: "last" },
      });

      expect(requestHeartbeatNowMock).toHaveBeenCalledWith({
        reason: "cron:test",
        agentId: "main",
        sessionKey: "agent:main:discord:channel:ops",
        heartbeat: { target: "last" },
      });
    } finally {
      state.cron.stop();
    }
  });

  it("preserves trust downgrades when cron enqueues system events", () => {
    const cfg = createCronConfig("server-cron-untrusted");
    loadConfigMock.mockReturnValue(cfg);

    const state = buildGatewayCronService({
      cfg,
      deps: {} as CliDeps,
      broadcast: () => {},
    });
    try {
      const cronDeps = (
        state.cron as unknown as {
          state?: {
            deps?: {
              enqueueSystemEvent?: (
                optsText: string,
                opts?: {
                  agentId?: string;
                  sessionKey?: string;
                  contextKey?: string;
                  trusted?: boolean;
                },
              ) => void;
            };
          };
        }
      ).state?.deps;

      cronDeps?.enqueueSystemEvent?.("hello", {
        sessionKey: "discord:channel:ops",
        contextKey: "cron:test",
        trusted: false,
      });

      expect(enqueueSystemEventMock).toHaveBeenCalledWith("hello", {
        sessionKey: "agent:main:discord:channel:ops",
        contextKey: "cron:test",
        trusted: false,
      });
    } finally {
      state.cron.stop();
    }
  });

  it("blocks private webhook URLs via SSRF-guarded fetch", async () => {
    const cfg = createCronConfig("server-cron-ssrf");
    loadConfigMock.mockReturnValue(cfg);
    fetchWithSsrFGuardMock.mockRejectedValue(
      new SsrFBlockedError("Blocked: resolves to private/internal/special-use IP address"),
    );

    const state = buildGatewayCronService({
      cfg,
      deps: {} as CliDeps,
      broadcast: () => {},
    });
    try {
      const job = await state.cron.add({
        name: "ssrf-webhook-blocked",
        enabled: true,
        schedule: { kind: "at", at: new Date(1).toISOString() },
        sessionTarget: "main",
        wakeMode: "next-heartbeat",
        payload: { kind: "systemEvent", text: "hello" },
        delivery: {
          mode: "webhook",
          to: "http://127.0.0.1:8080/cron-finished",
        },
      });

      await state.cron.run(job.id, "force");

      expect(fetchWithSsrFGuardMock).toHaveBeenCalledOnce();
      expect(fetchWithSsrFGuardMock).toHaveBeenCalledWith({
        url: "http://127.0.0.1:8080/cron-finished",
        init: {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: expect.stringContaining('"action":"finished"'),
          signal: expect.any(AbortSignal),
        },
      });
    } finally {
      state.cron.stop();
    }
  });
});
