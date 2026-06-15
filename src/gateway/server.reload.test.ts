import fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMainSessionKeyFromConfig } from "../config/sessions.js";
import { drainSystemEvents } from "../infra/system-events.js";
import { withEnvAsync } from "../test-utils/env.js";
import {
  connectOk,
  installGatewayTestHooks,
  rpcReq,
  startServerWithClient,
  withGatewayServer,
} from "./test-helpers.js";

const hoisted = vi.hoisted(() => {
  const cronInstances: Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }> = [];

  class CronServiceMock {
    start = vi.fn(async () => {});
    stop = vi.fn();
    constructor() {
      cronInstances.push(this);
    }
  }

  const heartbeatStop = vi.fn();
  const heartbeatUpdateConfig = vi.fn();
  const startHeartbeatRunner = vi.fn(() => ({
    stop: heartbeatStop,
    updateConfig: heartbeatUpdateConfig,
  }));

  const startGmailWatcher = vi.fn(async () => ({ started: true }));
  const stopGmailWatcher = vi.fn(async () => {});

  const providerManager = {
    getRuntimeSnapshot: vi.fn(() => ({
      providers: {
        whatsapp: {
          running: false,
          connected: false,
          reconnectAttempts: 0,
          lastConnectedAt: null,
          lastDisconnect: null,
          lastMessageAt: null,
          lastEventAt: null,
          lastError: null,
        },
        telegram: {
          running: false,
          lastStartAt: null,
          lastStopAt: null,
          lastError: null,
          mode: null,
        },
        discord: {
          running: false,
          lastStartAt: null,
          lastStopAt: null,
          lastError: null,
        },
        slack: {
          running: false,
          lastStartAt: null,
          lastStopAt: null,
          lastError: null,
        },
        signal: {
          running: false,
          lastStartAt: null,
          lastStopAt: null,
          lastError: null,
          baseUrl: null,
        },
        imessage: {
          running: false,
          lastStartAt: null,
          lastStopAt: null,
          lastError: null,
          cliPath: null,
          dbPath: null,
        },
        msteams: {
          running: false,
          lastStartAt: null,
          lastStopAt: null,
          lastError: null,
        },
      },
      providerAccounts: {
        whatsapp: {},
        telegram: {},
        discord: {},
        slack: {},
        signal: {},
        imessage: {},
        msteams: {},
      },
    })),
    startChannels: vi.fn(async () => {}),
    startChannel: vi.fn(async () => {}),
    stopChannel: vi.fn(async () => {}),
    markChannelLoggedOut: vi.fn(),
    isHealthMonitorEnabled: vi.fn(() => true),
    isManuallyStopped: vi.fn(() => false),
    resetRestartAttempts: vi.fn(),
  };

  const createChannelManager = vi.fn(() => providerManager);

  const reloaderStop = vi.fn(async () => {});
  let onHotReload: ((plan: unknown, nextConfig: unknown) => Promise<void>) | null = null;
  let onRestart: ((plan: unknown, nextConfig: unknown) => void) | null = null;

  const startGatewayConfigReloader = vi.fn(
    (opts: { onHotReload: typeof onHotReload; onRestart: typeof onRestart }) => {
      onHotReload = opts.onHotReload;
      onRestart = opts.onRestart;
      return { stop: reloaderStop };
    },
  );

  return {
    CronService: CronServiceMock,
    cronInstances,
    heartbeatStop,
    heartbeatUpdateConfig,
    startHeartbeatRunner,
    startGmailWatcher,
    stopGmailWatcher,
    providerManager,
    createChannelManager,
    startGatewayConfigReloader,
    reloaderStop,
    getOnHotReload: () => onHotReload,
    getOnRestart: () => onRestart,
  };
});

vi.mock("../cron/service.js", () => ({
  CronService: hoisted.CronService,
}));

vi.mock("../infra/heartbeat-runner.js", () => ({
  startHeartbeatRunner: hoisted.startHeartbeatRunner,
}));

vi.mock("../hooks/gmail-watcher.js", () => ({
  startGmailWatcher: hoisted.startGmailWatcher,
  stopGmailWatcher: hoisted.stopGmailWatcher,
}));

vi.mock("./server-channels.js", () => ({
  createChannelManager: hoisted.createChannelManager,
}));

vi.mock("./config-reload.js", () => ({
  startGatewayConfigReloader: hoisted.startGatewayConfigReloader,
}));

installGatewayTestHooks({ scope: "suite" });

describe("gateway hot reload", () => {
  let prevSkipChannels: string | undefined;
  let prevSkipGmail: string | undefined;
  let prevSkipProviders: string | undefined;
  let prevOpenAiApiKey: string | undefined;
  let prevGeminiApiKey: string | undefined;

  beforeEach(() => {
    prevSkipChannels = process.env.REMOTECLAW_SKIP_CHANNELS;
    prevSkipGmail = process.env.REMOTECLAW_SKIP_GMAIL_WATCHER;
    prevSkipProviders = process.env.REMOTECLAW_SKIP_PROVIDERS;
    prevOpenAiApiKey = process.env.OPENAI_API_KEY;
    prevGeminiApiKey = process.env.GEMINI_API_KEY;
    process.env.REMOTECLAW_SKIP_CHANNELS = "0";
    delete process.env.REMOTECLAW_SKIP_GMAIL_WATCHER;
    delete process.env.REMOTECLAW_SKIP_PROVIDERS;
  });

  afterEach(() => {
    if (prevSkipChannels === undefined) {
      delete process.env.REMOTECLAW_SKIP_CHANNELS;
    } else {
      process.env.REMOTECLAW_SKIP_CHANNELS = prevSkipChannels;
    }
    if (prevSkipGmail === undefined) {
      delete process.env.REMOTECLAW_SKIP_GMAIL_WATCHER;
    } else {
      process.env.REMOTECLAW_SKIP_GMAIL_WATCHER = prevSkipGmail;
    }
    if (prevSkipProviders === undefined) {
      delete process.env.REMOTECLAW_SKIP_PROVIDERS;
    } else {
      process.env.REMOTECLAW_SKIP_PROVIDERS = prevSkipProviders;
    }
    if (prevOpenAiApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = prevOpenAiApiKey;
    }
    if (prevGeminiApiKey === undefined) {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = prevGeminiApiKey;
    }
  });

  async function writeChannelEnvRefConfig() {
    await writeConfigFile({
      channels: {
        telegram: {
          botToken: { source: "env", provider: "default", id: "TELEGRAM_BOT_TOKEN" },
        },
      },
    });
  }

  async function writeConfigFile(config: unknown) {
    const configPath = process.env.REMOTECLAW_CONFIG_PATH;
    if (!configPath) {
      throw new Error("REMOTECLAW_CONFIG_PATH is not set");
    }
    await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  }

  async function writeDisabledSurfaceRefConfig() {
    const configPath = process.env.REMOTECLAW_CONFIG_PATH;
    if (!configPath) {
      throw new Error("REMOTECLAW_CONFIG_PATH is not set");
    }
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          channels: {
            telegram: {
              enabled: false,
              botToken: { source: "env", provider: "default", id: "DISABLED_TELEGRAM_STARTUP_REF" },
            },
          },
          tools: {
            web: {
              search: {
                enabled: false,
                apiKey: {
                  source: "env",
                  provider: "default",
                  id: "DISABLED_WEB_SEARCH_STARTUP_REF",
                },
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  async function writeGatewayTokenRefConfig() {
    const configPath = process.env.REMOTECLAW_CONFIG_PATH;
    if (!configPath) {
      throw new Error("REMOTECLAW_CONFIG_PATH is not set");
    }
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          secrets: {
            providers: {
              default: { source: "env" },
            },
          },
          gateway: {
            auth: {
              mode: "token",
              token: { source: "env", provider: "default", id: "MISSING_STARTUP_GW_TOKEN" },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  async function writeWebSearchGeminiRefConfig() {
    const configPath = process.env.REMOTECLAW_CONFIG_PATH;
    if (!configPath) {
      throw new Error("REMOTECLAW_CONFIG_PATH is not set");
    }
    await fs.writeFile(
      configPath,
      `${JSON.stringify(
        {
          plugins: {
            entries: {
              google: {
                enabled: true,
                config: {
                  webSearch: {
                    apiKey: "gemini-startup-key",
                  },
                },
              },
            },
          },
          tools: {
            web: {
              search: {
                enabled: true,
                provider: "gemini",
              },
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
  }

  async function withNonMinimalGatewayServer(
    fn: Parameters<typeof withGatewayServer>[0],
  ): ReturnType<typeof withGatewayServer> {
    return await withEnvAsync({ REMOTECLAW_TEST_MINIMAL_GATEWAY: undefined }, async () =>
      withGatewayServer(fn),
    );
  }

  it("applies hot reload actions and emits restart signal", async () => {
    await withNonMinimalGatewayServer(async () => {
      const onHotReload = hoisted.getOnHotReload();
      expect(onHotReload).toBeTypeOf("function");

      const nextConfig = {
        hooks: {
          enabled: true,
          token: "secret",
        },
        cron: { enabled: true, store: "/tmp/cron.json" },
        agents: { defaults: { heartbeat: { every: "1m" }, maxConcurrent: 2 } },
        web: { enabled: true },
        channels: {
          telegram: { botToken: "token" },
          discord: { token: "token" },
          signal: { account: "+15550000000" },
          imessage: { enabled: true },
        },
      };

      await onHotReload?.(
        {
          changedPaths: [
            "cron.enabled",
            "agents.defaults.heartbeat.every",
            "web.enabled",
            "channels.telegram.botToken",
            "channels.discord.token",
            "channels.signal.account",
            "channels.imessage.enabled",
          ],
          restartGateway: false,
          restartReasons: [],
          hotReasons: ["web.enabled"],
          reloadHooks: true,
          restartGmailWatcher: false,
          restartCron: true,
          restartHeartbeat: true,
          restartChannels: new Set(["whatsapp", "telegram", "discord", "signal", "imessage"]),
          noopPaths: [],
        },
        nextConfig,
      );

      expect(hoisted.startHeartbeatRunner).toHaveBeenCalledTimes(1);
      expect(hoisted.heartbeatUpdateConfig).toHaveBeenCalledTimes(1);
      expect(hoisted.heartbeatUpdateConfig).toHaveBeenCalledWith(
        expect.objectContaining(nextConfig),
      );

      expect(hoisted.cronInstances.length).toBe(2);
      expect(hoisted.cronInstances[0].stop).toHaveBeenCalledTimes(1);
      expect(hoisted.cronInstances[1].start).toHaveBeenCalledTimes(1);

      expect(hoisted.providerManager.stopChannel).toHaveBeenCalledTimes(5);
      expect(hoisted.providerManager.startChannel).toHaveBeenCalledTimes(5);
      expect(hoisted.providerManager.stopChannel).toHaveBeenCalledWith("whatsapp");
      expect(hoisted.providerManager.startChannel).toHaveBeenCalledWith("whatsapp");
      expect(hoisted.providerManager.stopChannel).toHaveBeenCalledWith("telegram");
      expect(hoisted.providerManager.startChannel).toHaveBeenCalledWith("telegram");
      expect(hoisted.providerManager.stopChannel).toHaveBeenCalledWith("discord");
      expect(hoisted.providerManager.startChannel).toHaveBeenCalledWith("discord");
      expect(hoisted.providerManager.stopChannel).toHaveBeenCalledWith("signal");
      expect(hoisted.providerManager.startChannel).toHaveBeenCalledWith("signal");
      expect(hoisted.providerManager.stopChannel).toHaveBeenCalledWith("imessage");
      expect(hoisted.providerManager.startChannel).toHaveBeenCalledWith("imessage");

      const onRestart = hoisted.getOnRestart();
      expect(onRestart).toBeTypeOf("function");

      const signalSpy = vi.fn();
      process.once("SIGUSR1", signalSpy);

      const restartResult = onRestart?.(
        {
          changedPaths: ["gateway.port"],
          restartGateway: true,
          restartReasons: ["gateway.port"],
          hotReasons: [],
          reloadHooks: false,
          restartGmailWatcher: false,
          restartCron: false,
          restartHeartbeat: false,
          restartChannels: new Set(),
          noopPaths: [],
        },
        {},
      );
      await Promise.resolve(restartResult);

      expect(signalSpy).toHaveBeenCalledTimes(1);
    });
  });

  it("allows startup when unresolved channel refs exist but channels are skipped", async () => {
    await writeChannelEnvRefConfig();
    delete process.env.TELEGRAM_BOT_TOKEN;
    process.env.REMOTECLAW_SKIP_CHANNELS = "1";
    await expect(withGatewayServer(async () => {})).resolves.toBeUndefined();
  });

  it("allows startup when unresolved refs exist only on disabled surfaces", async () => {
    await writeDisabledSurfaceRefConfig();
    delete process.env.DISABLED_TELEGRAM_STARTUP_REF;
    delete process.env.DISABLED_WEB_SEARCH_STARTUP_REF;
    await expect(withGatewayServer(async () => {})).resolves.toBeUndefined();
  });

  it("honors startup auth overrides before secret preflight gating", async () => {
    await writeGatewayTokenRefConfig();
    delete process.env.MISSING_STARTUP_GW_TOKEN;
    await expect(
      withGatewayServer(async () => {}, {
        serverOptions: {
          auth: {
            mode: "password",
            password: "override-password", // pragma: allowlist secret
          },
        },
      }),
    ).resolves.toBeUndefined();
  });

  it("does not emit secrets reloader events for web search secret reload transitions", async () => {
    await writeWebSearchGeminiRefConfig();

    await withGatewayServer(async () => {
      const onHotReload = hoisted.getOnHotReload();
      expect(onHotReload).toBeTypeOf("function");
      const sessionKey = resolveMainSessionKeyFromConfig();
      const plan = {
        changedPaths: ["plugins.entries.google.config.webSearch.apiKey"],
        restartGateway: false,
        restartReasons: [],
        hotReasons: ["plugins.entries.google.config.webSearch.apiKey"],
        reloadHooks: false,
        restartGmailWatcher: false,
        restartCron: false,
        restartHeartbeat: false,
        restartChannels: new Set(),
        noopPaths: [],
      };
      const degradedConfig = {
        tools: {
          web: {
            search: {
              enabled: true,
              provider: "gemini",
            },
          },
        },
        plugins: {
          entries: {
            google: {
              enabled: true,
              config: {
                webSearch: {
                  apiKey: {
                    source: "env",
                    provider: "default",
                    id: "REMOTECLAW_TEST_MISSING_GEMINI_API_KEY",
                  },
                },
              },
            },
          },
        },
      };
      const recoveredConfig = {
        tools: degradedConfig.tools,
        plugins: {
          entries: {
            google: {
              enabled: true,
              config: {
                webSearch: {
                  apiKey: "gemini-recovered-key",
                },
              },
            },
          },
        },
      };

      delete process.env.GEMINI_API_KEY;
      delete process.env.REMOTECLAW_TEST_MISSING_GEMINI_API_KEY;
      expect(drainSystemEvents(sessionKey)).toEqual([]);
      await expect(onHotReload?.(plan, degradedConfig)).resolves.toBeUndefined();
      expect(drainSystemEvents(sessionKey)).toEqual([]);

      await expect(onHotReload?.(plan, recoveredConfig)).resolves.toBeUndefined();
      expect(drainSystemEvents(sessionKey)).toEqual([]);
    });
  });
});

describe("gateway agents", () => {
  it("lists configured agents via agents.list RPC", async () => {
    const { server, ws } = await startServerWithClient();
    await connectOk(ws);
    const res = await rpcReq<{ agents: Array<{ id: string }> }>(ws, "agents.list", {});
    expect(res.ok).toBe(true);
    expect(res.payload?.agents.map((agent) => agent.id)).toContain("main");
    ws.close();
    await server.close();
  });
});
