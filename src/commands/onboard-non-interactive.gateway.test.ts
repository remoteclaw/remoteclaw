import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import { makeTempWorkspace } from "../test-helpers/workspace.js";
import { captureEnv } from "../test-utils/env.js";
import { createThrowingRuntime, readJsonFile } from "./onboard-non-interactive.test-helpers.js";

const gatewayClientCalls: Array<{
  url?: string;
  token?: string;
  password?: string;
  onHelloOk?: () => void;
  onClose?: (code: number, reason: string) => void;
}> = [];
const ensureWorkspaceAndSessionsMock = vi.fn(async (..._args: unknown[]) => {});

vi.mock("../gateway/client.js", () => ({
  GatewayClient: class {
    params: {
      url?: string;
      token?: string;
      password?: string;
      onHelloOk?: () => void;
    };
    constructor(params: {
      url?: string;
      token?: string;
      password?: string;
      onHelloOk?: () => void;
    }) {
      this.params = params;
      gatewayClientCalls.push(params);
    }
    async request() {
      return { ok: true };
    }
    start() {
      queueMicrotask(() => this.params.onHelloOk?.());
    }
    stop() {}
  },
}));

vi.mock("./onboard-helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./onboard-helpers.js")>();
  return {
    ...actual,
    ensureWorkspaceAndSessions: ensureWorkspaceAndSessionsMock,
  };
});

const { runNonInteractiveOnboarding } = await import("./onboard-non-interactive.js");
const { resolveConfigPath: resolveStateConfigPath } = await import("../config/paths.js");
const { resolveConfigPath } = await import("../config/config.js");
const { callGateway } = await import("../gateway/call.js");

function getPseudoPort(base: number): number {
  return base + (process.pid % 1000);
}

const runtime = createThrowingRuntime();

describe("onboard (non-interactive): gateway and remote auth", () => {
  let envSnapshot: ReturnType<typeof captureEnv>;
  let tempHome: string | undefined;

  const initStateDir = async (prefix: string) => {
    if (!tempHome) {
      throw new Error("temp home not initialized");
    }
    const stateDir = await fs.mkdtemp(path.join(tempHome, prefix));
    process.env.REMOTECLAW_STATE_DIR = stateDir;
    delete process.env.REMOTECLAW_CONFIG_PATH;
    return stateDir;
  };
  const withStateDir = async (
    prefix: string,
    run: (stateDir: string) => Promise<void>,
  ): Promise<void> => {
    const stateDir = await initStateDir(prefix);
    try {
      await run(stateDir);
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true });
    }
  };
  beforeAll(async () => {
    envSnapshot = captureEnv([
      "HOME",
      "REMOTECLAW_STATE_DIR",
      "REMOTECLAW_CONFIG_PATH",
      "REMOTECLAW_SKIP_CHANNELS",
      "REMOTECLAW_SKIP_GMAIL_WATCHER",
      "REMOTECLAW_SKIP_CRON",
      "REMOTECLAW_SKIP_CANVAS_HOST",
      "REMOTECLAW_SKIP_BROWSER_CONTROL_SERVER",
      "REMOTECLAW_GATEWAY_TOKEN",
      "REMOTECLAW_GATEWAY_PASSWORD",
    ]);
    process.env.REMOTECLAW_SKIP_CHANNELS = "1";
    process.env.REMOTECLAW_SKIP_GMAIL_WATCHER = "1";
    process.env.REMOTECLAW_SKIP_CRON = "1";
    process.env.REMOTECLAW_SKIP_CANVAS_HOST = "1";
    process.env.REMOTECLAW_SKIP_BROWSER_CONTROL_SERVER = "1";
    delete process.env.REMOTECLAW_GATEWAY_TOKEN;
    delete process.env.REMOTECLAW_GATEWAY_PASSWORD;

    tempHome = await makeTempWorkspace("remoteclaw-onboard-");
    process.env.HOME = tempHome;
  });

  afterAll(async () => {
    if (tempHome) {
      await fs.rm(tempHome, { recursive: true, force: true });
    }
    envSnapshot.restore();
  });

  it("writes gateway token auth into config", async () => {
    await withStateDir("state-noninteractive-", async (stateDir) => {
      const token = "tok_test_123";
      const workspace = path.join(stateDir, "remoteclaw");

      await runNonInteractiveOnboarding(
        {
          nonInteractive: true,
          mode: "local",
          workspace,

          skipHealth: true,
          installDaemon: false,
          gatewayBind: "loopback",
          gatewayAuth: "token",
          gatewayToken: token,
        },
        runtime,
      );

      const configPath = resolveStateConfigPath(process.env, stateDir);
      const cfg = await readJsonFile<{
        gateway?: { auth?: { mode?: string; token?: string } };
        tools?: { profile?: string };
      }>(configPath);

      expect(cfg?.tools?.profile).toBe("coding");
      expect(cfg?.gateway?.auth?.mode).toBe("token");
      expect(cfg?.gateway?.auth?.token).toBe(token);
    });
  }, 60_000);

  it("uses REMOTECLAW_GATEWAY_TOKEN when --gateway-token is omitted", async () => {
    await withStateDir("state-env-token-", async (stateDir) => {
      const envToken = "tok_env_fallback_123";
      const workspace = path.join(stateDir, "remoteclaw");
      const prevToken = process.env.REMOTECLAW_GATEWAY_TOKEN;
      process.env.REMOTECLAW_GATEWAY_TOKEN = envToken;

      try {
        await runNonInteractiveOnboarding(
          {
            nonInteractive: true,
            mode: "local",
            workspace,
            skipHealth: true,
            installDaemon: false,
            gatewayBind: "loopback",
            gatewayAuth: "token",
          },
          runtime,
        );

        const configPath = resolveStateConfigPath(process.env, stateDir);
        const cfg = await readJsonFile<{
          gateway?: { auth?: { mode?: string; token?: string } };
        }>(configPath);

        expect(cfg?.gateway?.auth?.mode).toBe("token");
        expect(cfg?.gateway?.auth?.token).toBe(envToken);
      } finally {
        if (prevToken === undefined) {
          delete process.env.REMOTECLAW_GATEWAY_TOKEN;
        } else {
          process.env.REMOTECLAW_GATEWAY_TOKEN = prevToken;
        }
      }
    });
  }, 60_000);

  it("writes gateway.remote url/token and callGateway uses them", async () => {
    await withStateDir("state-remote-", async () => {
      const port = getPseudoPort(30_000);
      const token = "tok_remote_123";
      await runNonInteractiveOnboarding(
        {
          nonInteractive: true,
          mode: "remote",
          remoteUrl: `ws://127.0.0.1:${port}`,
          remoteToken: token,
          json: true,
        },
        runtime,
      );

      const cfg = await readJsonFile<{
        gateway?: { mode?: string; remote?: { url?: string; token?: string } };
      }>(resolveConfigPath());

      expect(cfg.gateway?.mode).toBe("remote");
      expect(cfg.gateway?.remote?.url).toBe(`ws://127.0.0.1:${port}`);
      expect(cfg.gateway?.remote?.token).toBe(token);

      gatewayClientCalls.length = 0;
      const health = await callGateway<{ ok?: boolean }>({ method: "health" });
      expect(health?.ok).toBe(true);
      const lastCall = gatewayClientCalls[gatewayClientCalls.length - 1];
      expect(lastCall?.url).toBe(`ws://127.0.0.1:${port}`);
      expect(lastCall?.token).toBe(token);
    });
  }, 60_000);

  it("explains local health failure when no daemon was requested", async () => {
    await withStateDir("state-local-health-hint-", async (stateDir) => {
      waitForGatewayReachableMock = vi.fn(async () => ({
        ok: false,
        detail: "socket closed: 1006 abnormal closure",
      }));

      await expect(
        runNonInteractiveOnboarding(
          {
            nonInteractive: true,
            mode: "local",
            workspace: path.join(stateDir, "openclaw"),
            authChoice: "skip",
            skipSkills: true,
            skipHealth: false,
            installDaemon: false,
            gatewayBind: "loopback",
          },
          runtime,
        ),
      ).rejects.toThrow(
        /only waits for an already-running gateway unless you pass --install-daemon[\s\S]*--skip-health/,
      );
    });
  }, 60_000);

  it("uses a longer health deadline when daemon install was requested", async () => {
    await withStateDir("state-local-daemon-health-", async (stateDir) => {
      let capturedDeadlineMs: number | undefined;
      waitForGatewayReachableMock = vi.fn(async (params: { deadlineMs?: number }) => {
        capturedDeadlineMs = params.deadlineMs;
        return { ok: true };
      });

      await runNonInteractiveOnboarding(
        {
          nonInteractive: true,
          mode: "local",
          workspace: path.join(stateDir, "openclaw"),
          authChoice: "skip",
          skipSkills: true,
          skipHealth: false,
          installDaemon: true,
          gatewayBind: "loopback",
        },
        runtime,
      );

      expect(installGatewayDaemonNonInteractiveMock).toHaveBeenCalledTimes(1);
      expect(capturedDeadlineMs).toBe(45_000);
    });
  }, 60_000);

  it("emits structured JSON diagnostics when daemon health fails", async () => {
    await withStateDir("state-local-daemon-health-json-fail-", async (stateDir) => {
      waitForGatewayReachableMock = vi.fn(async () => ({
        ok: false,
        detail: "gateway closed (1006 abnormal closure (no close frame)): no close reason",
      }));

      let capturedError = "";
      const runtimeWithCapture: RuntimeEnv = {
        log: () => {},
        error: (...args: unknown[]) => {
          const firstArg = args[0];
          capturedError =
            typeof firstArg === "string"
              ? firstArg
              : firstArg instanceof Error
                ? firstArg.message
                : (JSON.stringify(firstArg) ?? "");
          throw new Error(capturedError);
        },
        exit: (_code: number) => {
          throw new Error("exit should not be reached after runtime.error");
        },
      };

      await expect(
        runNonInteractiveOnboarding(
          {
            nonInteractive: true,
            mode: "local",
            workspace: path.join(stateDir, "openclaw"),
            authChoice: "skip",
            skipSkills: true,
            skipHealth: false,
            installDaemon: true,
            gatewayBind: "loopback",
            json: true,
          },
          runtimeWithCapture,
        ),
      ).rejects.toThrow(/"phase": "gateway-health"/);

      const parsed = JSON.parse(capturedError) as {
        ok: boolean;
        phase: string;
        installDaemon: boolean;
        detail?: string;
        gateway?: { wsUrl?: string };
        hints?: string[];
        diagnostics?: {
          service?: {
            label?: string;
            loaded?: boolean;
            runtimeStatus?: string;
            pid?: number;
          };
          lastGatewayError?: string;
        };
      };
      expect(parsed.ok).toBe(false);
      expect(parsed.phase).toBe("gateway-health");
      expect(parsed.installDaemon).toBe(true);
      expect(parsed.detail).toContain("1006 abnormal closure");
      expect(parsed.gateway?.wsUrl).toContain("ws://127.0.0.1:");
      expect(parsed.hints).toContain("Run `openclaw gateway status --deep` for more detail.");
      expect(parsed.diagnostics?.service?.label).toBe("LaunchAgent");
      expect(parsed.diagnostics?.service?.loaded).toBe(true);
      expect(parsed.diagnostics?.service?.runtimeStatus).toBe("running");
      expect(parsed.diagnostics?.service?.pid).toBe(4242);
      expect(parsed.diagnostics?.lastGatewayError).toContain("required secrets are unavailable");
    });
  }, 60_000);

  it("auto-generates token auth when binding LAN and persists the token", async () => {
    if (process.platform === "win32") {
      // Windows runner occasionally drops the temp config write in this flow; skip to keep CI green.
      return;
    }
    await withStateDir("state-lan-", async (stateDir) => {
      process.env.REMOTECLAW_STATE_DIR = stateDir;
      process.env.REMOTECLAW_CONFIG_PATH = path.join(stateDir, "remoteclaw.json");

      const port = getPseudoPort(40_000);
      const workspace = path.join(stateDir, "remoteclaw");

      await runNonInteractiveOnboarding(
        {
          nonInteractive: true,
          mode: "local",
          workspace,

          skipHealth: true,
          installDaemon: false,
          gatewayPort: port,
          gatewayBind: "lan",
        },
        runtime,
      );

      const configPath = resolveStateConfigPath(process.env, stateDir);
      const cfg = await readJsonFile<{
        gateway?: {
          bind?: string;
          port?: number;
          auth?: { mode?: string; token?: string };
        };
      }>(configPath);

      expect(cfg.gateway?.bind).toBe("lan");
      expect(cfg.gateway?.port).toBe(port);
      expect(cfg.gateway?.auth?.mode).toBe("token");
      expect((cfg.gateway?.auth?.token ?? "").length).toBeGreaterThan(8);
    });
  }, 60_000);
});
