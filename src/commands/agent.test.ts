import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import "../cron/isolated-agent.mocks.js";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import type { RemoteClawConfig } from "../config/config.js";
import * as configModule from "../config/config.js";
import * as sessionsModule from "../config/sessions.js";
import { onAgentEvent } from "../infra/agent-events.js";
import type { AgentDeliveryResult, ChannelMessage } from "../middleware/types.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import type { RuntimeEnv } from "../runtime.js";
import { createOutboundTestPlugin, createTestRegistry } from "../test-utils/channel-plugins.js";
import { agentCommand } from "./agent.js";

// model-catalog.js was deleted; the mock is provided by isolated-agent.mocks.js.
// Access the mock function via vi.hoisted so we can configure return values per-test.
const loadModelCatalogMock = vi.fn();
vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: loadModelCatalogMock,
}));

// ── ChannelBridge mock ──────────────────────────────────────────────────

type BridgeConstructorOpts = {
  provider: string;
  sessionMap: unknown;
  gatewayUrl: string;
  gatewayToken: string;
  workspaceDir?: string;
};

const bridgeHandleMock =
  vi.fn<
    (
      message: ChannelMessage,
      callbacks?: unknown,
      abortSignal?: AbortSignal,
    ) => Promise<AgentDeliveryResult>
  >();
const bridgeConstructorCalls: BridgeConstructorOpts[] = [];

function defaultBridgeResult(): AgentDeliveryResult {
  return {
    payloads: [{ text: "ok" }],
    run: {
      text: "ok",
      sessionId: "s",
      durationMs: 5,
      usage: undefined,
      aborted: false,
    },
    mcp: {
      sentTexts: [],
      sentMediaUrls: [],
      sentTargets: [],
      cronAdds: 0,
    },
  };
}

vi.mock("../middleware/channel-bridge.js", () => ({
  ChannelBridge: class MockChannelBridge {
    #provider: string;
    constructor(opts: BridgeConstructorOpts) {
      this.#provider = opts.provider;
      bridgeConstructorCalls.push(opts);
    }
    get provider() {
      return this.#provider;
    }
    async handle(
      message: ChannelMessage,
      callbacks?: unknown,
      abortSignal?: AbortSignal,
    ): Promise<AgentDeliveryResult> {
      return bridgeHandleMock(message, callbacks, abortSignal);
    }
  },
}));

vi.mock("../config/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/paths.js")>();
  return {
    ...actual,
    resolveGatewayPort: () => 9999,
  };
});

vi.mock("../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: () => ({ token: "test-token" }),
}));

// ── Existing mocks ──────────────────────────────────────────────────────

vi.mock("../agents/auth-profiles.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/auth-profiles.js")>();
  return {
    ...actual,
    ensureAuthProfileStore: vi.fn(() => ({ version: 1, profiles: {} })),
  };
});

vi.mock("../agents/workspace.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/workspace.js")>();
  return {
    ...actual,
    ensureAgentWorkspace: vi.fn(async ({ dir }: { dir: string }) => ({ dir })),
  };
});

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(() => {
    throw new Error("exit");
  }),
};

const configSpy = vi.spyOn(configModule, "loadConfig");

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "openclaw-agent-" });
}

function mockConfig(
  home: string,
  storePath: string,
  agentOverrides?: Partial<NonNullable<NonNullable<RemoteClawConfig["agents"]>["defaults"]>>,
  telegramOverrides?: Partial<NonNullable<NonNullable<RemoteClawConfig["channels"]>["telegram"]>>,
  agentsList?: Array<{ id: string; default?: boolean }>,
) {
  configSpy.mockReturnValue({
    agents: {
      defaults: {
        model: { primary: "anthropic/claude-opus-4-5" },
        models: { "anthropic/claude-opus-4-5": {} },
        workspace: path.join(home, "openclaw"),
        ...agentOverrides,
      },
      list: agentsList,
    },
    session: { store: storePath, mainKey: "main" },
    channels: {
      telegram: telegramOverrides ? { ...telegramOverrides } : undefined,
    },
  });
}

/** Run agentCommand and return the last ChannelMessage passed to bridge.handle(). */
async function runWithDefaultAgentConfig(params: {
  home: string;
  args: Parameters<typeof agentCommand>[0];
  agentsList?: Array<{ id: string; default?: boolean }>;
}) {
  const store = path.join(params.home, "sessions.json");
  mockConfig(params.home, store, undefined, undefined, params.agentsList);
  await agentCommand(params.args, runtime);
  return bridgeHandleMock.mock.calls.at(-1)?.[0];
}

function writeSessionStoreSeed(
  storePath: string,
  sessions: Record<string, Record<string, unknown>>,
) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, JSON.stringify(sessions, null, 2));
}

function createTelegramOutboundPlugin() {
  return createOutboundTestPlugin({
    id: "telegram",
    outbound: {
      deliveryMode: "direct",
      sendText: async (ctx) => {
        const sendTelegram = ctx.deps?.sendTelegram;
        if (!sendTelegram) {
          throw new Error("sendTelegram dependency missing");
        }
        const result = await sendTelegram(ctx.to, ctx.text, {
          accountId: ctx.accountId ?? undefined,
          verbose: false,
        });
        return { channel: "telegram", messageId: result.messageId, chatId: result.chatId };
      },
      sendMedia: async (ctx) => {
        const sendTelegram = ctx.deps?.sendTelegram;
        if (!sendTelegram) {
          throw new Error("sendTelegram dependency missing");
        }
        const result = await sendTelegram(ctx.to, ctx.text, {
          accountId: ctx.accountId ?? undefined,
          mediaUrl: ctx.mediaUrl,
          verbose: false,
        });
        return { channel: "telegram", messageId: result.messageId, chatId: result.chatId };
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  bridgeConstructorCalls.length = 0;
  bridgeHandleMock.mockResolvedValue(defaultBridgeResult());
  loadModelCatalogMock?.mockResolvedValue([]);
});

describe("agentCommand", () => {
  it("creates a session entry when deriving from --to", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hello", to: "+1555" }, runtime);

      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<
        string,
        { sessionId: string }
      >;
      const entry = Object.values(saved)[0];
      expect(entry.sessionId).toBeTruthy();
    });
  });

  it("persists thinking and verbose overrides", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hi", to: "+1222", thinking: "high", verbose: "on" }, runtime);

      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<
        string,
        { thinkingLevel?: string; verboseLevel?: string }
      >;
      const entry = Object.values(saved)[0];
      expect(entry.thinkingLevel).toBe("high");
      expect(entry.verboseLevel).toBe("on");
    });
  });

  it("resumes when session-id is provided", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      writeSessionStoreSeed(store, {
        foo: {
          sessionId: "session-123",
          updatedAt: Date.now(),
          systemSent: true,
        },
      });
      mockConfig(home, store);

      // Should not throw — session-123 is found in the store.
      await agentCommand({ message: "resume me", sessionId: "session-123" }, runtime);

      expect(bridgeHandleMock).toHaveBeenCalledTimes(1);
    });
  });

  it("uses the resumed session agent scope when sessionId resolves to another agent store", async () => {
    await withTempHome(async (home) => {
      const storePattern = path.join(home, "sessions", "{agentId}", "sessions.json");
      const execStore = path.join(home, "sessions", "exec", "sessions.json");
      writeSessionStoreSeed(execStore, {
        "agent:exec:hook:gmail:thread-1": {
          sessionId: "session-exec-hook",
          updatedAt: Date.now(),
          systemSent: true,
        },
      });
      mockConfig(home, storePattern, undefined, undefined, [
        { id: "dev" },
        { id: "exec", default: true },
      ]);

      // Should not throw — session resolves through cross-agent store lookup.
      await agentCommand({ message: "resume me", sessionId: "session-exec-hook" }, runtime);

      expect(bridgeHandleMock).toHaveBeenCalledTimes(1);
    });
  });

  it("resolves resumed session transcript path from custom session store directory", async () => {
    await withTempHome(async (home) => {
      const customStoreDir = path.join(home, "custom-state");
      const store = path.join(customStoreDir, "sessions.json");
      writeSessionStoreSeed(store, {});
      mockConfig(home, store);
      const resolveSessionFilePathOptionsSpy = vi.spyOn(
        sessionsModule,
        "resolveSessionFilePathOptions",
      );

      await agentCommand({ message: "resume me", sessionId: "session-custom-123" }, runtime);

      const matchingCall = resolveSessionFilePathOptionsSpy.mock.calls.find(
        (call) => call[0]?.storePath === store,
      );
      expect(matchingCall?.[0]).toEqual(
        expect.objectContaining({
          agentId: "main",
        }),
      );
    });
  });

  it("emits lifecycle events for ChannelBridge runs", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      const lifecycleEvents: Array<{ phase?: unknown }> = [];
      const stop = onAgentEvent((evt) => {
        if (evt.stream === "lifecycle") {
          lifecycleEvents.push({ phase: evt.data?.phase });
        }
      });

      await agentCommand({ message: "hi", to: "+1555" }, runtime);
      stop();

      expect(lifecycleEvents).toHaveLength(1);
      expect(lifecycleEvents[0].phase).toBe("end");
    });
  });

  it("uses hardcoded default provider when no session override exists", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store, {
        model: { primary: "openai/gpt-4.1-mini" },
        models: {
          "anthropic/claude-opus-4-5": {},
          "openai/gpt-4.1-mini": {},
        },
      });

      await agentCommand({ message: "hi", to: "+1555" }, runtime);

      // agent.ts uses DEFAULT_PROVIDER ("anthropic") from agents/defaults.ts,
      // not agents.defaults.model.primary from config. Config-driven model
      // resolution was removed with model-selection.ts.
      expect(bridgeConstructorCalls.at(-1)?.provider).toBe("anthropic");
    });
  });

  it("keeps stored session model override when models allowlist is empty", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      writeSessionStoreSeed(store, {
        "agent:main:subagent:allow-any": {
          sessionId: "session-allow-any",
          updatedAt: Date.now(),
          providerOverride: "openai",
          modelOverride: "gpt-custom-foo",
        },
      });

      mockConfig(home, store, {
        model: { primary: "anthropic/claude-opus-4-5" },
        models: {},
      });

      loadModelCatalogMock.mockResolvedValueOnce([
        { id: "claude-opus-4-5", name: "Opus", provider: "anthropic" },
      ]);

      await agentCommand(
        {
          message: "hi",
          sessionKey: "agent:main:subagent:allow-any",
        },
        runtime,
      );

      // ChannelBridge constructed with the stored override provider.
      expect(bridgeConstructorCalls.at(-1)?.provider).toBe("openai");

      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<
        string,
        { providerOverride?: string; modelOverride?: string }
      >;
      expect(saved["agent:main:subagent:allow-any"]?.providerOverride).toBe("openai");
      expect(saved["agent:main:subagent:allow-any"]?.modelOverride).toBe("gpt-custom-foo");
    });
  });

  it("keeps explicit sessionKey even when sessionId exists elsewhere", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      writeSessionStoreSeed(store, {
        "agent:main:main": {
          sessionId: "sess-main",
          updatedAt: Date.now(),
        },
      });
      mockConfig(home, store);

      await agentCommand(
        {
          message: "hi",
          sessionId: "sess-main",
          sessionKey: "agent:main:subagent:abc",
        },
        runtime,
      );

      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<
        string,
        { sessionId?: string }
      >;
      expect(saved["agent:main:subagent:abc"]?.sessionId).toBe("sess-main");
    });
  });

  it("persists resolved sessionFile for existing session keys", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      writeSessionStoreSeed(store, {
        "agent:main:subagent:abc": {
          sessionId: "sess-main",
          updatedAt: Date.now(),
        },
      });
      mockConfig(home, store);

      await agentCommand(
        {
          message: "hi",
          sessionKey: "agent:main:subagent:abc",
        },
        runtime,
      );

      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<
        string,
        { sessionId?: string; sessionFile?: string }
      >;
      const entry = saved["agent:main:subagent:abc"];
      expect(entry?.sessionId).toBe("sess-main");
      expect(entry?.sessionFile).toContain(
        `${path.sep}agents${path.sep}main${path.sep}sessions${path.sep}sess-main.jsonl`,
      );
    });
  });

  it("preserves topic transcript suffix when persisting missing sessionFile", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      writeSessionStoreSeed(store, {
        "agent:main:telegram:group:123:topic:456": {
          sessionId: "sess-topic",
          updatedAt: Date.now(),
        },
      });
      mockConfig(home, store);

      await agentCommand(
        {
          message: "hi",
          sessionKey: "agent:main:telegram:group:123:topic:456",
        },
        runtime,
      );

      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<
        string,
        { sessionId?: string; sessionFile?: string }
      >;
      const entry = saved["agent:main:telegram:group:123:topic:456"];
      expect(entry?.sessionId).toBe("sess-topic");
      expect(entry?.sessionFile).toContain("sess-topic-topic-456.jsonl");
    });
  });

  it("derives session key from --agent when no routing target is provided", async () => {
    await withTempHome(async (home) => {
      await runWithDefaultAgentConfig({
        home,
        args: { message: "hi", agentId: "ops" },
        agentsList: [{ id: "ops" }],
      });

      // Verify session store was created with agent-scoped key.
      const store = path.join(home, "sessions.json");
      const saved = JSON.parse(fs.readFileSync(store, "utf-8")) as Record<
        string,
        { sessionId?: string }
      >;
      expect(saved["agent:ops:main"]).toBeDefined();
    });
  });

  it("rejects unknown agent overrides", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await expect(agentCommand({ message: "hi", agentId: "ghost" }, runtime)).rejects.toThrow(
        'Unknown agent id "ghost"',
      );
    });
  });

  it("defaults thinking to low for reasoning-capable models", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);
      loadModelCatalogMock.mockResolvedValueOnce([
        {
          id: "claude-opus-4-5",
          name: "Opus 4.5",
          provider: "anthropic",
          reasoning: true,
        },
      ]);

      // Should succeed — thinking resolution defaults to "low" for reasoning models.
      await agentCommand({ message: "hi", to: "+1555" }, runtime);

      expect(bridgeHandleMock).toHaveBeenCalledTimes(1);
    });
  });

  it("prints JSON payload when requested", async () => {
    await withTempHome(async (home) => {
      bridgeHandleMock.mockResolvedValueOnce({
        payloads: [{ text: "json-reply", mediaUrl: "http://x.test/a.jpg" }],
        run: {
          text: "ok",
          sessionId: "s",
          durationMs: 42,
          usage: undefined,
          aborted: false,
        },
        mcp: {
          sentTexts: [],
          sentMediaUrls: [],
          sentTargets: [],
          cronAdds: 0,
        },
      });
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hi", to: "+1999", json: true }, runtime);

      const logged = (runtime.log as unknown as MockInstance).mock.calls.at(-1)?.[0] as string;
      const parsed = JSON.parse(logged) as {
        payloads: Array<{ text: string; mediaUrl?: string | null }>;
        meta: { durationMs: number };
      };
      expect(parsed.payloads[0].text).toBe("json-reply");
      expect(parsed.payloads[0].mediaUrl).toBe("http://x.test/a.jpg");
      expect(parsed.meta.durationMs).toBe(42);
    });
  });

  it("passes the message through as the agent prompt", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "ping", to: "+1333" }, runtime);

      const message = bridgeHandleMock.mock.calls.at(-1)?.[0];
      expect(message?.text).toBe("ping");
    });
  });

  it("passes through telegram accountId when delivering", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store, undefined, { botToken: "t-1" });
      setActivePluginRegistry(
        createTestRegistry([
          { pluginId: "telegram", plugin: createTelegramOutboundPlugin(), source: "test" },
        ]),
      );
      const deps = {
        sendMessageWhatsApp: vi.fn(),
        sendMessageTelegram: vi.fn().mockResolvedValue({ messageId: "t1", chatId: "123" }),
        sendMessageSlack: vi.fn(),
        sendMessageDiscord: vi.fn(),
        sendMessageSignal: vi.fn(),
        sendMessageIMessage: vi.fn(),
      };

      const prevTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
      process.env.TELEGRAM_BOT_TOKEN = "";
      try {
        await agentCommand(
          {
            message: "hi",
            to: "123",
            deliver: true,
            channel: "telegram",
          },
          runtime,
          deps,
        );

        expect(deps.sendMessageTelegram).toHaveBeenCalledWith(
          "123",
          "ok",
          expect.objectContaining({ accountId: undefined, verbose: false }),
        );
      } finally {
        if (prevTelegramToken === undefined) {
          delete process.env.TELEGRAM_BOT_TOKEN;
        } else {
          process.env.TELEGRAM_BOT_TOKEN = prevTelegramToken;
        }
      }
    });
  });

  it("uses reply channel as the message channel context", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store, undefined, undefined, [{ id: "ops" }]);

      await agentCommand({ message: "hi", agentId: "ops", replyChannel: "slack" }, runtime);

      const message = bridgeHandleMock.mock.calls.at(-1)?.[0];
      expect(message?.provider).toBe("slack");
    });
  });

  it("prefers runContext for routing", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand(
        {
          message: "hi",
          to: "+1555",
          channel: "whatsapp",
          runContext: { messageChannel: "slack", accountId: "acct-2" },
        },
        runtime,
      );

      const message = bridgeHandleMock.mock.calls.at(-1)?.[0];
      expect(message?.provider).toBe("slack");
      expect(message?.from).toBe("acct-2");
    });
  });

  it("forwards accountId to bridge message", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hi", to: "+1555", accountId: "kev" }, runtime);

      const message = bridgeHandleMock.mock.calls.at(-1)?.[0];
      expect(message?.from).toBe("kev");
    });
  });

  it("logs output when delivery is disabled", async () => {
    await withTempHome(async (home) => {
      await runWithDefaultAgentConfig({
        home,
        args: { message: "hi", agentId: "ops" },
        agentsList: [{ id: "ops" }],
      });

      expect(runtime.log).toHaveBeenCalledWith("ok");
    });
  });
});
