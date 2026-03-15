import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";
import { createInternalHookEventPayload } from "../../test-utils/internal-hook-event-payload.js";
import type { MsgContext } from "../templating.js";
import type { GetReplyOptions, ReplyPayload } from "../types.js";
import type { ReplyDispatcher } from "./reply-dispatcher.js";
import { buildTestCtx } from "./test-ctx.js";

type AbortResult = { handled: boolean; aborted: boolean; stoppedSubagents?: number };

const mocks = vi.hoisted(() => ({
  routeReply: vi.fn(async (_params: unknown) => ({ ok: true, messageId: "mock" })),
  tryFastAbortFromMessage: vi.fn<() => Promise<AbortResult>>(async () => ({
    handled: false,
    aborted: false,
  })),
}));
const diagnosticMocks = vi.hoisted(() => ({
  logMessageQueued: vi.fn(),
  logMessageProcessed: vi.fn(),
  logSessionStateChange: vi.fn(),
}));
const hookMocks = vi.hoisted(() => ({
  registry: {
    plugins: [] as Array<{
      id: string;
      status: "loaded" | "disabled" | "error";
    }>,
  },
  runner: {
    hasHooks: vi.fn(() => false),
    runInboundClaim: vi.fn(async () => undefined),
    runInboundClaimForPlugin: vi.fn(async () => undefined),
    runInboundClaimForPluginOutcome: vi.fn(async () => ({ status: "no_handler" as const })),
    runMessageReceived: vi.fn(async () => {}),
  },
}));
const sessionStoreMocks = vi.hoisted(() => ({
  loadSessionStore: vi.fn(async () => ({})),
  resolveStorePath: vi.fn(() => "/tmp/test-store"),
  resolveSessionStoreEntry: vi.fn(async () => undefined as Record<string, unknown> | undefined),
  currentEntry: undefined as Record<string, unknown> | undefined,
}));
const internalHookMocks = vi.hoisted(() => ({
  createInternalHookEvent: vi.fn(),
  triggerInternalHook: vi.fn(async () => {}),
}));
const acpMocks = vi.hoisted(() => ({
  listAcpSessionEntries: vi.fn(async () => []),
  readAcpSessionEntry: vi.fn<() => unknown>(() => null),
  upsertAcpSessionMeta: vi.fn(async () => null),
  requireAcpRuntimeBackend: vi.fn<() => unknown>(),
}));
const sessionBindingMocks = vi.hoisted(() => ({
  listBySession: vi.fn<(targetSessionKey: string) => SessionBindingRecord[]>(() => []),
  resolveByConversation: vi.fn<
    (ref: {
      channel: string;
      accountId: string;
      conversationId: string;
      parentConversationId?: string;
    }) => SessionBindingRecord | null
  >(() => null),
  touch: vi.fn(),
}));
const sessionStoreMocks = vi.hoisted(() => ({
  currentEntry: undefined as Record<string, unknown> | undefined,
  loadSessionStore: vi.fn(() => ({})),
  resolveStorePath: vi.fn(() => "/tmp/mock-sessions.json"),
  resolveSessionStoreEntry: vi.fn(() => ({ existing: sessionStoreMocks.currentEntry })),
}));
const ttsMocks = vi.hoisted(() => {
  const state = {
    synthesizeFinalAudio: false,
  };
  return {
    state,
    maybeApplyTtsToPayload: vi.fn(async (paramsUnknown: unknown) => {
      const params = paramsUnknown as {
        payload: ReplyPayload;
        kind: "tool" | "block" | "final";
      };
      if (
        state.synthesizeFinalAudio &&
        params.kind === "final" &&
        typeof params.payload?.text === "string" &&
        params.payload.text.trim()
      ) {
        return {
          ...params.payload,
          mediaUrl: "https://example.com/tts-synth.opus",
          audioAsVoice: true,
        };
      }
      return params.payload;
    }),
    normalizeTtsAutoMode: vi.fn((value: unknown) =>
      typeof value === "string" ? value : undefined,
    ),
    resolveTtsConfig: vi.fn((_cfg: RemoteClawConfig) => ({ mode: "final" })),
  };
});

vi.mock("./route-reply.js", () => ({
  isRoutableChannel: (channel: string | undefined) =>
    Boolean(
      channel &&
      [
        "telegram",
        "slack",
        "discord",
        "signal",
        "imessage",
        "whatsapp",
        "feishu",
        "mattermost",
      ].includes(channel),
    ),
  routeReply: mocks.routeReply,
}));

vi.mock("./abort.js", () => ({
  tryFastAbortFromMessage: mocks.tryFastAbortFromMessage,
  formatAbortReplyText: (stoppedSubagents?: number) => {
    if (typeof stoppedSubagents !== "number" || stoppedSubagents <= 0) {
      return "⚙️ Agent was aborted.";
    }
    const label = stoppedSubagents === 1 ? "sub-agent" : "sub-agents";
    return `⚙️ Agent was aborted. Stopped ${stoppedSubagents} ${label}.`;
  },
}));

vi.mock("../../logging/diagnostic.js", () => ({
  logMessageQueued: diagnosticMocks.logMessageQueued,
  logMessageProcessed: diagnosticMocks.logMessageProcessed,
  logSessionStateChange: diagnosticMocks.logSessionStateChange,
}));
vi.mock("../../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../config/sessions.js")>();
  return {
    ...actual,
    loadSessionStore: sessionStoreMocks.loadSessionStore,
    resolveStorePath: sessionStoreMocks.resolveStorePath,
    resolveSessionStoreEntry: sessionStoreMocks.resolveSessionStoreEntry,
  };
});

vi.mock("../../plugins/hook-runner-global.js", () => ({
  getGlobalHookRunner: () => hookMocks.runner,
  getGlobalPluginRegistry: () => hookMocks.registry,
}));
vi.mock("../../hooks/internal-hooks.js", () => ({
  createInternalHookEvent: internalHookMocks.createInternalHookEvent,
  triggerInternalHook: internalHookMocks.triggerInternalHook,
}));
vi.mock("../../acp/runtime/session-meta.js", () => ({
  listAcpSessionEntries: acpMocks.listAcpSessionEntries,
  readAcpSessionEntry: acpMocks.readAcpSessionEntry,
  upsertAcpSessionMeta: acpMocks.upsertAcpSessionMeta,
}));
vi.mock("../../acp/runtime/registry.js", () => ({
  requireAcpRuntimeBackend: acpMocks.requireAcpRuntimeBackend,
}));
vi.mock("../../infra/outbound/session-binding-service.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../infra/outbound/session-binding-service.js")>();
  return {
    ...actual,
    getSessionBindingService: () => ({
      bind: vi.fn(async () => {
        throw new Error("bind not mocked");
      }),
      getCapabilities: vi.fn(() => ({
        adapterAvailable: true,
        bindSupported: true,
        unbindSupported: true,
        placements: ["current", "child"] as const,
      })),
      listBySession: (targetSessionKey: string) =>
        sessionBindingMocks.listBySession(targetSessionKey),
      resolveByConversation: sessionBindingMocks.resolveByConversation,
      touch: sessionBindingMocks.touch,
      unbind: vi.fn(async () => []),
    }),
  };
});
vi.mock("../../tts/tts.js", () => ({
  maybeApplyTtsToPayload: (params: unknown) => ttsMocks.maybeApplyTtsToPayload(params),
  normalizeTtsAutoMode: (value: unknown) => ttsMocks.normalizeTtsAutoMode(value),
  resolveTtsConfig: (cfg: RemoteClawConfig) => ttsMocks.resolveTtsConfig(cfg),
}));

const { dispatchReplyFromConfig } = await import("./dispatch-from-config.js");
const { resetInboundDedupe } = await import("./inbound-dedupe.js");
const { __testing: acpManagerTesting } = await import("../../acp/control-plane/manager.js");
const { __testing: pluginBindingTesting } = await import("../../plugins/conversation-binding.js");

const noAbortResult = { handled: false, aborted: false } as const;
const emptyConfig = {} as RemoteClawConfig;
type DispatchReplyArgs = Parameters<typeof dispatchReplyFromConfig>[0];

function createDispatcher(): ReplyDispatcher {
  return {
    sendToolResult: vi.fn(() => true),
    sendBlockReply: vi.fn(() => true),
    sendFinalReply: vi.fn(() => true),
    waitForIdle: vi.fn(async () => {}),
    getQueuedCounts: vi.fn(() => ({ tool: 0, block: 0, final: 0 })),
    markComplete: vi.fn(),
  };
}

function setNoAbort() {
  mocks.tryFastAbortFromMessage.mockResolvedValue(noAbortResult);
}

function firstToolResultPayload(dispatcher: ReplyDispatcher): ReplyPayload | undefined {
  return (dispatcher.sendToolResult as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
    | ReplyPayload
    | undefined;
}

async function dispatchTwiceWithFreshDispatchers(params: Omit<DispatchReplyArgs, "dispatcher">) {
  await dispatchReplyFromConfig({
    ...params,
    dispatcher: createDispatcher(),
  });
  await dispatchReplyFromConfig({
    ...params,
    dispatcher: createDispatcher(),
  });
}

describe("dispatchReplyFromConfig", () => {
  beforeEach(() => {
    resetInboundDedupe();
    diagnosticMocks.logMessageQueued.mockClear();
    diagnosticMocks.logMessageProcessed.mockClear();
    diagnosticMocks.logSessionStateChange.mockClear();
    hookMocks.runner.hasHooks.mockClear();
    hookMocks.runner.hasHooks.mockReturnValue(false);
    hookMocks.runner.runInboundClaim.mockClear();
    hookMocks.runner.runInboundClaim.mockResolvedValue(undefined);
    hookMocks.runner.runInboundClaimForPlugin.mockClear();
    hookMocks.runner.runInboundClaimForPlugin.mockResolvedValue(undefined);
    hookMocks.runner.runInboundClaimForPluginOutcome.mockClear();
    hookMocks.runner.runInboundClaimForPluginOutcome.mockResolvedValue({
      status: "no_handler",
    });
    hookMocks.runner.runMessageReceived.mockClear();
    hookMocks.registry.plugins = [];
    internalHookMocks.createInternalHookEvent.mockClear();
    internalHookMocks.createInternalHookEvent.mockImplementation(createInternalHookEventPayload);
    internalHookMocks.triggerInternalHook.mockClear();
    acpMocks.readAcpSessionEntry.mockReset();
    acpMocks.readAcpSessionEntry.mockReturnValue(null);
    acpMocks.upsertAcpSessionMeta.mockReset();
    acpMocks.upsertAcpSessionMeta.mockResolvedValue(null);
    acpMocks.requireAcpRuntimeBackend.mockReset();
    sessionBindingMocks.listBySession.mockReset();
    sessionBindingMocks.listBySession.mockReturnValue([]);
    pluginBindingTesting.reset();
    sessionBindingMocks.resolveByConversation.mockReset();
    sessionBindingMocks.resolveByConversation.mockReturnValue(null);
    sessionBindingMocks.touch.mockReset();
    sessionStoreMocks.currentEntry = undefined;
    sessionStoreMocks.loadSessionStore.mockClear();
    sessionStoreMocks.resolveStorePath.mockClear();
    sessionStoreMocks.resolveSessionStoreEntry.mockClear();
    ttsMocks.state.synthesizeFinalAudio = false;
    ttsMocks.maybeApplyTtsToPayload.mockClear();
    ttsMocks.normalizeTtsAutoMode.mockClear();
    ttsMocks.resolveTtsConfig.mockClear();
    ttsMocks.resolveTtsConfig.mockReturnValue({
      mode: "final",
    });
  });
  it("does not route when Provider matches OriginatingChannel (even if Surface is missing)", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      Surface: undefined,
      OriginatingChannel: "slack",
      OriginatingTo: "channel:C123",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      _opts?: GetReplyOptions,
      _cfg?: RemoteClawConfig,
    ) => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(mocks.routeReply).not.toHaveBeenCalled();
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("routes when OriginatingChannel differs from Provider", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      AccountId: "acc-1",
      MessageThreadId: 123,
      GroupChannel: "ops-room",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:999",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      _opts?: GetReplyOptions,
      _cfg?: RemoteClawConfig,
    ) => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
    expect(mocks.routeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        to: "telegram:999",
        accountId: "acc-1",
        threadId: 123,
        isGroup: true,
        groupId: "telegram:999",
      }),
    );
  });

  it("falls back to thread-scoped session key when current ctx has no MessageThreadId", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    sessionStoreMocks.currentEntry = {
      deliveryContext: {
        channel: "mattermost",
        to: "channel:CHAN1",
        accountId: "default",
      },
      origin: {
        threadId: "stale-origin-root",
      },
      lastThreadId: "stale-origin-root",
    };
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "webchat",
      Surface: "webchat",
      SessionKey: "agent:main:mattermost:channel:CHAN1:thread:post-root",
      AccountId: "default",
      MessageThreadId: undefined,
      OriginatingChannel: "mattermost",
      OriginatingTo: "channel:CHAN1",
      ExplicitDeliverRoute: true,
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(mocks.routeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "mattermost",
        to: "channel:CHAN1",
        threadId: "post-root",
      }),
    );
  });

  it("does not resurrect a cleared route thread from origin metadata", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    // Simulate the real store: lastThreadId and deliveryContext.threadId may be normalised from
    // origin.threadId on read, but a non-thread session key must still route to channel root.
    sessionStoreMocks.currentEntry = {
      deliveryContext: {
        channel: "mattermost",
        to: "channel:CHAN1",
        accountId: "default",
        threadId: "stale-root",
      },
      lastThreadId: "stale-root",
      origin: {
        threadId: "stale-root",
      },
    };
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "webchat",
      Surface: "webchat",
      SessionKey: "agent:main:mattermost:channel:CHAN1",
      AccountId: "default",
      MessageThreadId: undefined,
      OriginatingChannel: "mattermost",
      OriginatingTo: "channel:CHAN1",
      ExplicitDeliverRoute: true,
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    const routeCall = mocks.routeReply.mock.calls[0]?.[0] as
      | { channel?: string; to?: string; threadId?: string | number }
      | undefined;
    expect(routeCall).toMatchObject({
      channel: "mattermost",
      to: "channel:CHAN1",
    });
    expect(routeCall?.threadId).toBeUndefined();
  });

  it("forces suppressTyping when routing to a different originating channel", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:999",
    });

    const replyResolver = async (_ctx: MsgContext, opts?: GetReplyOptions) => {
      expect(opts?.suppressTyping).toBe(true);
      expect(opts?.typingPolicy).toBe("system_event");
      return { text: "hi" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });
  });

  it("forces suppressTyping for internal webchat turns", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "webchat",
      Surface: "webchat",
      OriginatingChannel: "webchat",
      OriginatingTo: "session:abc",
    });

    const replyResolver = async (_ctx: MsgContext, opts?: GetReplyOptions) => {
      expect(opts?.suppressTyping).toBe(true);
      expect(opts?.typingPolicy).toBe("internal_webchat");
      return { text: "hi" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });
  });

  it("routes when provider is webchat but surface carries originating channel metadata", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "webchat",
      Surface: "telegram",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:999",
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
    expect(mocks.routeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        to: "telegram:999",
      }),
    );
  });

  it("routes Feishu replies when provider is webchat and origin metadata points to Feishu", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "webchat",
      Surface: "feishu",
      OriginatingChannel: "feishu",
      OriginatingTo: "ou_feishu_direct_123",
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
    expect(mocks.routeReply).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "feishu",
        to: "ou_feishu_direct_123",
      }),
    );
  });

  it("does not route when provider already matches originating channel", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      Surface: "webchat",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:999",
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(mocks.routeReply).not.toHaveBeenCalled();
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("routes media-only tool results when summaries are suppressed", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      ChatType: "group",
      AccountId: "acc-1",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:999",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts?: GetReplyOptions,
      _cfg?: RemoteClawConfig,
    ) => {
      expect(opts?.onToolResult).toBeDefined();
      await opts?.onToolResult?.({
        text: "NO_REPLY",
        mediaUrls: ["https://example.com/tts-routed.opus"],
      });
      return undefined;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(dispatcher.sendToolResult).not.toHaveBeenCalled();
    expect(dispatcher.sendFinalReply).not.toHaveBeenCalled();
    expect(mocks.routeReply).toHaveBeenCalledTimes(1);
    const routed = mocks.routeReply.mock.calls[0]?.[0] as { payload?: ReplyPayload } | undefined;
    expect(routed?.payload?.mediaUrls).toEqual(["https://example.com/tts-routed.opus"]);
    expect(routed?.payload?.text).toBeUndefined();
  });

  it("provides onToolResult in DM sessions", async () => {
    setNoAbort();
    mocks.routeReply.mockClear();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      ChatType: "direct",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts?: GetReplyOptions,
      _cfg?: RemoteClawConfig,
    ) => {
      expect(opts?.onToolResult).toBeDefined();
      expect(typeof opts?.onToolResult).toBe("function");
      return { text: "hi" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("suppresses group tool summaries but still forwards tool media", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      ChatType: "group",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts?: GetReplyOptions,
      _cfg?: RemoteClawConfig,
    ) => {
      expect(opts?.onToolResult).toBeDefined();
      await opts?.onToolResult?.({ text: "🔧 exec: ls" });
      await opts?.onToolResult?.({
        text: "NO_REPLY",
        mediaUrls: ["https://example.com/tts-group.opus"],
      });
      return { text: "hi" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(dispatcher.sendToolResult).toHaveBeenCalledTimes(1);
    const sent = firstToolResultPayload(dispatcher);
    expect(sent?.mediaUrls).toEqual(["https://example.com/tts-group.opus"]);
    expect(sent?.text).toBeUndefined();
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("sends tool results via dispatcher in DM sessions", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      ChatType: "direct",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts?: GetReplyOptions,
      _cfg?: RemoteClawConfig,
    ) => {
      // Simulate tool result emission
      await opts?.onToolResult?.({ text: "🔧 exec: ls" });
      return { text: "done" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });
    expect(dispatcher.sendToolResult).toHaveBeenCalledWith(
      expect.objectContaining({ text: "🔧 exec: ls" }),
    );
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("suppresses native tool summaries but still forwards tool media", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      ChatType: "direct",
      CommandSource: "native",
    });

    const replyResolver = async (
      _ctx: MsgContext,
      opts?: GetReplyOptions,
      _cfg?: RemoteClawConfig,
    ) => {
      expect(opts?.onToolResult).toBeDefined();
      await opts?.onToolResult?.({ text: "🔧 tools/sessions_send" });
      await opts?.onToolResult?.({
        mediaUrl: "https://example.com/tts-native.opus",
      });
      return { text: "hi" } satisfies ReplyPayload;
    };

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(dispatcher.sendToolResult).toHaveBeenCalledTimes(1);
    const sent = firstToolResultPayload(dispatcher);
    expect(sent?.mediaUrl).toBe("https://example.com/tts-native.opus");
    expect(sent?.text).toBeUndefined();
    expect(dispatcher.sendFinalReply).toHaveBeenCalledTimes(1);
  });

  it("fast-aborts without calling the reply resolver", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: true,
      aborted: true,
    });
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      Body: "/stop",
    });
    const replyResolver = vi.fn(async () => ({ text: "hi" }) as ReplyPayload);

    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(replyResolver).not.toHaveBeenCalled();
    expect(dispatcher.sendFinalReply).toHaveBeenCalledWith({
      text: "⚙️ Agent was aborted.",
    });
  });

  it("fast-abort reply includes stopped subagent count when provided", async () => {
    mocks.tryFastAbortFromMessage.mockResolvedValue({
      handled: true,
      aborted: true,
      stoppedSubagents: 2,
    });
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      Body: "/stop",
    });

    await dispatchReplyFromConfig({
      ctx,
      cfg,
      dispatcher,
      replyResolver: vi.fn(async () => ({ text: "hi" }) as ReplyPayload),
    });

    expect(dispatcher.sendFinalReply).toHaveBeenCalledWith({
      text: "⚙️ Agent was aborted. Stopped 2 sub-agents.",
    });
  });

  // ACP runtime tests removed — the upstream control-plane, runtime, and session-binding
  // modules referenced by these tests have been gutted in this fork.

  it("deduplicates inbound messages by MessageSid and origin", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const ctx = buildTestCtx({
      Provider: "whatsapp",
      OriginatingChannel: "whatsapp",
      OriginatingTo: "whatsapp:+15555550123",
      MessageSid: "msg-1",
    });
    const replyResolver = vi.fn(async () => ({ text: "hi" }) as ReplyPayload);

    await dispatchTwiceWithFreshDispatchers({
      ctx,
      cfg,
      replyResolver,
    });

    expect(replyResolver).toHaveBeenCalledTimes(1);
  });

  it("deduplicates same-agent inbound replies across main and direct session keys", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const replyResolver = vi.fn(async () => ({ text: "hi" }) as ReplyPayload);
    const baseCtx = buildTestCtx({
      Provider: "telegram",
      Surface: "telegram",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:7463849194",
      MessageSid: "msg-1",
      SessionKey: "agent:main:main",
    });

    await dispatchReplyFromConfig({
      ctx: baseCtx,
      cfg,
      dispatcher: createDispatcher(),
      replyResolver,
    });
    await dispatchReplyFromConfig({
      ctx: {
        ...baseCtx,
        SessionKey: "agent:main:telegram:direct:7463849194",
      },
      cfg,
      dispatcher: createDispatcher(),
      replyResolver,
    });

    expect(replyResolver).toHaveBeenCalledTimes(1);
  });

  it("emits message_received hook with originating channel metadata", async () => {
    setNoAbort();
    hookMocks.runner.hasHooks.mockReturnValue(true);
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      Surface: "slack",
      OriginatingChannel: "Telegram",
      OriginatingTo: "telegram:999",
      CommandBody: "/search hello",
      RawBody: "raw text",
      Body: "body text",
      Timestamp: 1710000000000,
      MessageSidFull: "sid-full",
      SenderId: "user-1",
      SenderName: "Alice",
      SenderUsername: "alice",
      SenderE164: "+15555550123",
      AccountId: "acc-1",
      GroupSpace: "guild-123",
      GroupChannel: "alerts",
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(hookMocks.runner.runMessageReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ctx.From,
        content: "/search hello",
        timestamp: 1710000000000,
        metadata: expect.objectContaining({
          originatingChannel: "Telegram",
          originatingTo: "telegram:999",
          messageId: "sid-full",
          senderId: "user-1",
          senderName: "Alice",
          senderUsername: "alice",
          senderE164: "+15555550123",
          guildId: "guild-123",
          channelName: "alerts",
        }),
      }),
      expect.objectContaining({
        channelId: "telegram",
        accountId: "acc-1",
        conversationId: "telegram:999",
      }),
    );
  });

  it("does not broadcast inbound claims without a core-owned plugin binding", async () => {
    setNoAbort();
    hookMocks.runner.hasHooks.mockImplementation(
      ((hookName?: string) =>
        hookName === "inbound_claim" || hookName === "message_received") as () => boolean,
    );
    hookMocks.runner.runInboundClaim.mockResolvedValue({ handled: true } as never);
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      Surface: "telegram",
      OriginatingChannel: "telegram",
      OriginatingTo: "telegram:-10099",
      To: "telegram:-10099",
      AccountId: "default",
      SenderId: "user-9",
      SenderUsername: "ada",
      MessageThreadId: 77,
      CommandAuthorized: true,
      WasMentioned: true,
      CommandBody: "who are you",
      RawBody: "who are you",
      Body: "who are you",
      MessageSid: "msg-claim-1",
      SessionKey: "agent:main:telegram:group:-10099:77",
    });
    const replyResolver = vi.fn(async () => ({ text: "core reply" }) satisfies ReplyPayload);

    const result = await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(result).toEqual({ queuedFinal: true, counts: { tool: 0, block: 0, final: 0 } });
    expect(hookMocks.runner.runInboundClaim).not.toHaveBeenCalled();
    expect(hookMocks.runner.runMessageReceived).toHaveBeenCalledWith(
      expect.objectContaining({
        from: ctx.From,
        content: "who are you",
        metadata: expect.objectContaining({
          messageId: "msg-claim-1",
          originatingChannel: "telegram",
          originatingTo: "telegram:-10099",
          senderId: "user-9",
          senderUsername: "ada",
          threadId: 77,
        }),
      }),
      expect.objectContaining({
        channelId: "telegram",
        accountId: "default",
        conversationId: "telegram:-10099",
      }),
    );
    expect(internalHookMocks.triggerInternalHook).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "message",
        action: "received",
        sessionKey: "agent:main:telegram:group:-10099:77",
      }),
    );
    expect(replyResolver).toHaveBeenCalledTimes(1);
    expect(dispatcher.sendFinalReply).toHaveBeenCalledWith(
      expect.objectContaining({ text: "core reply" }),
    );
  });

  it("emits internal message:received hook when a session key is available", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      Surface: "telegram",
      SessionKey: "agent:main:main",
      CommandBody: "/help",
      MessageSid: "msg-42",
      GroupSpace: "guild-456",
      GroupChannel: "ops-room",
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(internalHookMocks.createInternalHookEvent).toHaveBeenCalledWith(
      "message",
      "received",
      "agent:main:main",
      expect.objectContaining({
        from: ctx.From,
        content: "/help",
        channelId: "telegram",
        messageId: "msg-42",
        metadata: expect.objectContaining({
          guildId: "guild-456",
          channelName: "ops-room",
        }),
      }),
    );
    expect(internalHookMocks.triggerInternalHook).toHaveBeenCalledTimes(1);
  });

  it("skips internal message:received hook when session key is unavailable", async () => {
    setNoAbort();
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "telegram",
      Surface: "telegram",
      CommandBody: "/help",
    });
    (ctx as MsgContext).SessionKey = undefined;

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(internalHookMocks.createInternalHookEvent).not.toHaveBeenCalled();
    expect(internalHookMocks.triggerInternalHook).not.toHaveBeenCalled();
  });

  it("emits diagnostics when enabled", async () => {
    setNoAbort();
    const cfg = { diagnostics: { enabled: true } } as RemoteClawConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "slack",
      Surface: "slack",
      SessionKey: "agent:main:main",
      MessageSid: "msg-1",
      To: "slack:C123",
    });

    const replyResolver = async () => ({ text: "hi" }) satisfies ReplyPayload;
    await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(diagnosticMocks.logMessageQueued).toHaveBeenCalledTimes(1);
    expect(diagnosticMocks.logSessionStateChange).toHaveBeenCalledWith({
      sessionKey: "agent:main:main",
      state: "processing",
      reason: "message_start",
    });
    expect(diagnosticMocks.logMessageProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "slack",
        outcome: "completed",
        sessionKey: "agent:main:main",
      }),
    );
  });

  it("routes plugin-owned bindings to the owning plugin before generic inbound claim broadcast", async () => {
    setNoAbort();
    hookMocks.runner.hasHooks.mockImplementation(
      ((hookName?: string) =>
        hookName === "inbound_claim" || hookName === "message_received") as () => boolean,
    );
    hookMocks.registry.plugins = [{ id: "openclaw-codex-app-server", status: "loaded" }];
    hookMocks.runner.runInboundClaimForPluginOutcome.mockResolvedValue({
      status: "handled",
      result: { handled: true },
    });
    sessionBindingMocks.resolveByConversation.mockReturnValue({
      bindingId: "binding-1",
      targetSessionKey: "plugin-binding:codex:abc123",
      targetKind: "session",
      conversation: {
        channel: "discord",
        accountId: "default",
        conversationId: "channel:1481858418548412579",
      },
      status: "active",
      boundAt: 1710000000000,
      metadata: {
        pluginBindingOwner: "plugin",
        pluginId: "openclaw-codex-app-server",
        pluginRoot: "/Users/huntharo/github/openclaw-app-server",
      },
    } satisfies SessionBindingRecord);
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      OriginatingTo: "discord:channel:1481858418548412579",
      To: "discord:channel:1481858418548412579",
      AccountId: "default",
      SenderId: "user-9",
      SenderUsername: "ada",
      CommandAuthorized: true,
      WasMentioned: false,
      CommandBody: "who are you",
      RawBody: "who are you",
      Body: "who are you",
      MessageSid: "msg-claim-plugin-1",
      SessionKey: "agent:main:discord:channel:1481858418548412579",
    });
    const replyResolver = vi.fn(async () => ({ text: "should not run" }) satisfies ReplyPayload);

    const result = await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(result).toEqual({ queuedFinal: false, counts: { tool: 0, block: 0, final: 0 } });
    expect(sessionBindingMocks.touch).toHaveBeenCalledWith("binding-1");
    expect(hookMocks.runner.runInboundClaimForPluginOutcome).toHaveBeenCalledWith(
      "openclaw-codex-app-server",
      expect.objectContaining({
        channel: "discord",
        accountId: "default",
        conversationId: "channel:1481858418548412579",
        content: "who are you",
      }),
      expect.objectContaining({
        channelId: "discord",
        accountId: "default",
        conversationId: "channel:1481858418548412579",
      }),
    );
    expect(hookMocks.runner.runInboundClaim).not.toHaveBeenCalled();
    expect(replyResolver).not.toHaveBeenCalled();
  });

  it("routes plugin-owned Discord DM bindings to the owning plugin before generic inbound claim broadcast", async () => {
    setNoAbort();
    hookMocks.runner.hasHooks.mockImplementation(
      ((hookName?: string) =>
        hookName === "inbound_claim" || hookName === "message_received") as () => boolean,
    );
    hookMocks.registry.plugins = [{ id: "openclaw-codex-app-server", status: "loaded" }];
    hookMocks.runner.runInboundClaimForPluginOutcome.mockResolvedValue({
      status: "handled",
      result: { handled: true },
    });
    sessionBindingMocks.resolveByConversation.mockReturnValue({
      bindingId: "binding-dm-1",
      targetSessionKey: "plugin-binding:codex:dm123",
      targetKind: "session",
      conversation: {
        channel: "discord",
        accountId: "default",
        conversationId: "user:1177378744822943744",
      },
      status: "active",
      boundAt: 1710000000000,
      metadata: {
        pluginBindingOwner: "plugin",
        pluginId: "openclaw-codex-app-server",
        pluginRoot: "/Users/huntharo/github/openclaw-app-server",
      },
    } satisfies SessionBindingRecord);
    const cfg = emptyConfig;
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({
      Provider: "discord",
      Surface: "discord",
      OriginatingChannel: "discord",
      From: "discord:1177378744822943744",
      OriginatingTo: "channel:1480574946919846079",
      To: "channel:1480574946919846079",
      AccountId: "default",
      SenderId: "user-9",
      SenderUsername: "ada",
      CommandAuthorized: true,
      WasMentioned: false,
      CommandBody: "who are you",
      RawBody: "who are you",
      Body: "who are you",
      MessageSid: "msg-claim-plugin-dm-1",
      SessionKey: "agent:main:discord:user:1177378744822943744",
    });
    const replyResolver = vi.fn(async () => ({ text: "should not run" }) satisfies ReplyPayload);

    const result = await dispatchReplyFromConfig({ ctx, cfg, dispatcher, replyResolver });

    expect(result).toEqual({ queuedFinal: false, counts: { tool: 0, block: 0, final: 0 } });
    expect(sessionBindingMocks.touch).toHaveBeenCalledWith("binding-dm-1");
    expect(hookMocks.runner.runInboundClaimForPluginOutcome).toHaveBeenCalledWith(
      "openclaw-codex-app-server",
      expect.objectContaining({
        channel: "discord",
        accountId: "default",
        conversationId: "user:1177378744822943744",
        content: "who are you",
      }),
      expect.objectContaining({
        channelId: "discord",
        accountId: "default",
        conversationId: "user:1177378744822943744",
      }),
    );
    expect(hookMocks.runner.runInboundClaim).not.toHaveBeenCalled();
    expect(replyResolver).not.toHaveBeenCalled();
  });

  it("falls back to OpenClaw once per startup when a bound plugin is missing", async () => {
    setNoAbort();
    hookMocks.runner.hasHooks.mockImplementation(
      ((hookName?: string) =>
        hookName === "inbound_claim" || hookName === "message_received") as () => boolean,
    );
    hookMocks.runner.runInboundClaimForPluginOutcome.mockResolvedValue({
      status: "missing_plugin",
    });
    sessionBindingMocks.resolveByConversation.mockReturnValue({
      bindingId: "binding-missing-1",
      targetSessionKey: "plugin-binding:codex:missing123",
      targetKind: "session",
      conversation: {
        channel: "discord",
        accountId: "default",
        conversationId: "channel:missing-plugin",
      },
      status: "active",
      boundAt: 1710000000000,
      metadata: {
        pluginBindingOwner: "plugin",
        pluginId: "openclaw-codex-app-server",
        pluginName: "Codex App Server",
        pluginRoot: "/Users/huntharo/github/openclaw-app-server",
        detachHint: "/codex_detach",
      },
    } satisfies SessionBindingRecord);

    const replyResolver = vi.fn(async () => ({ text: "openclaw fallback" }) satisfies ReplyPayload);

    const firstDispatcher = createDispatcher();
    await dispatchReplyFromConfig({
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        OriginatingChannel: "discord",
        OriginatingTo: "discord:channel:missing-plugin",
        To: "discord:channel:missing-plugin",
        AccountId: "default",
        MessageSid: "msg-missing-plugin-1",
        SessionKey: "agent:main:discord:channel:missing-plugin",
        CommandBody: "hello",
        RawBody: "hello",
        Body: "hello",
      }),
      cfg: emptyConfig,
      dispatcher: firstDispatcher,
      replyResolver,
    });

    const firstNotice = (firstDispatcher.sendToolResult as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ReplyPayload | undefined;
    expect(firstNotice?.text).toContain("Routing this message to OpenClaw instead.");
    expect(firstNotice?.text).toContain("/codex_detach");
    expect(replyResolver).toHaveBeenCalledTimes(1);
    expect(hookMocks.runner.runInboundClaim).not.toHaveBeenCalled();

    replyResolver.mockClear();
    hookMocks.runner.runInboundClaim.mockClear();

    const secondDispatcher = createDispatcher();
    await dispatchReplyFromConfig({
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        OriginatingChannel: "discord",
        OriginatingTo: "discord:channel:missing-plugin",
        To: "discord:channel:missing-plugin",
        AccountId: "default",
        MessageSid: "msg-missing-plugin-2",
        SessionKey: "agent:main:discord:channel:missing-plugin",
        CommandBody: "still there?",
        RawBody: "still there?",
        Body: "still there?",
      }),
      cfg: emptyConfig,
      dispatcher: secondDispatcher,
      replyResolver,
    });

    expect(secondDispatcher.sendToolResult).not.toHaveBeenCalled();
    expect(replyResolver).toHaveBeenCalledTimes(1);
    expect(hookMocks.runner.runInboundClaim).not.toHaveBeenCalled();
  });

  it("falls back to OpenClaw when the bound plugin is loaded but has no inbound_claim handler", async () => {
    setNoAbort();
    hookMocks.runner.hasHooks.mockImplementation(
      ((hookName?: string) =>
        hookName === "inbound_claim" || hookName === "message_received") as () => boolean,
    );
    hookMocks.registry.plugins = [{ id: "openclaw-codex-app-server", status: "loaded" }];
    hookMocks.runner.runInboundClaimForPluginOutcome.mockResolvedValue({
      status: "no_handler",
    });
    sessionBindingMocks.resolveByConversation.mockReturnValue({
      bindingId: "binding-no-handler-1",
      targetSessionKey: "plugin-binding:codex:nohandler123",
      targetKind: "session",
      conversation: {
        channel: "discord",
        accountId: "default",
        conversationId: "channel:no-handler",
      },
      status: "active",
      boundAt: 1710000000000,
      metadata: {
        pluginBindingOwner: "plugin",
        pluginId: "openclaw-codex-app-server",
        pluginName: "Codex App Server",
        pluginRoot: "/Users/huntharo/github/openclaw-app-server",
      },
    } satisfies SessionBindingRecord);
    const dispatcher = createDispatcher();
    const replyResolver = vi.fn(async () => ({ text: "openclaw fallback" }) satisfies ReplyPayload);

    await dispatchReplyFromConfig({
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        OriginatingChannel: "discord",
        OriginatingTo: "discord:channel:no-handler",
        To: "discord:channel:no-handler",
        AccountId: "default",
        MessageSid: "msg-no-handler-1",
        SessionKey: "agent:main:discord:channel:no-handler",
        CommandBody: "hello",
        RawBody: "hello",
        Body: "hello",
      }),
      cfg: emptyConfig,
      dispatcher,
      replyResolver,
    });

    const notice = (dispatcher.sendToolResult as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as
      | ReplyPayload
      | undefined;
    expect(notice?.text).toContain("Routing this message to OpenClaw instead.");
    expect(replyResolver).toHaveBeenCalledTimes(1);
    expect(hookMocks.runner.runInboundClaim).not.toHaveBeenCalled();
  });

  it("notifies the user when a bound plugin declines the turn and keeps the binding attached", async () => {
    setNoAbort();
    hookMocks.runner.hasHooks.mockImplementation(
      ((hookName?: string) =>
        hookName === "inbound_claim" || hookName === "message_received") as () => boolean,
    );
    hookMocks.registry.plugins = [{ id: "openclaw-codex-app-server", status: "loaded" }];
    hookMocks.runner.runInboundClaimForPluginOutcome.mockResolvedValue({
      status: "declined",
    });
    sessionBindingMocks.resolveByConversation.mockReturnValue({
      bindingId: "binding-declined-1",
      targetSessionKey: "plugin-binding:codex:declined123",
      targetKind: "session",
      conversation: {
        channel: "discord",
        accountId: "default",
        conversationId: "channel:declined",
      },
      status: "active",
      boundAt: 1710000000000,
      metadata: {
        pluginBindingOwner: "plugin",
        pluginId: "openclaw-codex-app-server",
        pluginName: "Codex App Server",
        pluginRoot: "/Users/huntharo/github/openclaw-app-server",
        detachHint: "/codex_detach",
      },
    } satisfies SessionBindingRecord);
    const dispatcher = createDispatcher();
    const replyResolver = vi.fn(async () => ({ text: "should not run" }) satisfies ReplyPayload);

    await dispatchReplyFromConfig({
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        OriginatingChannel: "discord",
        OriginatingTo: "discord:channel:declined",
        To: "discord:channel:declined",
        AccountId: "default",
        MessageSid: "msg-declined-1",
        SessionKey: "agent:main:discord:channel:declined",
        CommandBody: "hello",
        RawBody: "hello",
        Body: "hello",
      }),
      cfg: emptyConfig,
      dispatcher,
      replyResolver,
    });

    const finalNotice = (dispatcher.sendFinalReply as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ReplyPayload | undefined;
    expect(finalNotice?.text).toContain("did not handle this message");
    expect(finalNotice?.text).toContain("/codex_detach");
    expect(replyResolver).not.toHaveBeenCalled();
    expect(hookMocks.runner.runInboundClaim).not.toHaveBeenCalled();
  });

  it("notifies the user when a bound plugin errors and keeps raw details out of the reply", async () => {
    setNoAbort();
    hookMocks.runner.hasHooks.mockImplementation(
      ((hookName?: string) =>
        hookName === "inbound_claim" || hookName === "message_received") as () => boolean,
    );
    hookMocks.registry.plugins = [{ id: "openclaw-codex-app-server", status: "loaded" }];
    hookMocks.runner.runInboundClaimForPluginOutcome.mockResolvedValue({
      status: "error",
      error: "boom",
    });
    sessionBindingMocks.resolveByConversation.mockReturnValue({
      bindingId: "binding-error-1",
      targetSessionKey: "plugin-binding:codex:error123",
      targetKind: "session",
      conversation: {
        channel: "discord",
        accountId: "default",
        conversationId: "channel:error",
      },
      status: "active",
      boundAt: 1710000000000,
      metadata: {
        pluginBindingOwner: "plugin",
        pluginId: "openclaw-codex-app-server",
        pluginName: "Codex App Server",
        pluginRoot: "/Users/huntharo/github/openclaw-app-server",
      },
    } satisfies SessionBindingRecord);
    const dispatcher = createDispatcher();
    const replyResolver = vi.fn(async () => ({ text: "should not run" }) satisfies ReplyPayload);

    await dispatchReplyFromConfig({
      ctx: buildTestCtx({
        Provider: "discord",
        Surface: "discord",
        OriginatingChannel: "discord",
        OriginatingTo: "discord:channel:error",
        To: "discord:channel:error",
        AccountId: "default",
        MessageSid: "msg-error-1",
        SessionKey: "agent:main:discord:channel:error",
        CommandBody: "hello",
        RawBody: "hello",
        Body: "hello",
      }),
      cfg: emptyConfig,
      dispatcher,
      replyResolver,
    });

    const finalNotice = (dispatcher.sendFinalReply as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ReplyPayload | undefined;
    expect(finalNotice?.text).toContain("hit an error handling this message");
    expect(finalNotice?.text).not.toContain("boom");
    expect(replyResolver).not.toHaveBeenCalled();
    expect(hookMocks.runner.runInboundClaim).not.toHaveBeenCalled();
  });

  it("marks diagnostics skipped for duplicate inbound messages", async () => {
    setNoAbort();
    const cfg = { diagnostics: { enabled: true } } as RemoteClawConfig;
    const ctx = buildTestCtx({
      Provider: "whatsapp",
      OriginatingChannel: "whatsapp",
      OriginatingTo: "whatsapp:+15555550123",
      MessageSid: "msg-dup",
    });
    const replyResolver = vi.fn(async () => ({ text: "hi" }) as ReplyPayload);

    await dispatchTwiceWithFreshDispatchers({
      ctx,
      cfg,
      replyResolver,
    });

    expect(replyResolver).toHaveBeenCalledTimes(1);
    expect(diagnosticMocks.logMessageProcessed).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        outcome: "skipped",
        reason: "duplicate",
      }),
    );
  });

  it("suppresses isReasoning payloads from final replies (WhatsApp channel)", async () => {
    setNoAbort();
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({ Provider: "whatsapp" });
    const replyResolver = async () =>
      [
        { text: "Reasoning:\n_thinking..._", isReasoning: true },
        { text: "The answer is 42" },
      ] satisfies ReplyPayload[];
    await dispatchReplyFromConfig({ ctx, cfg: emptyConfig, dispatcher, replyResolver });
    const finalCalls = (dispatcher.sendFinalReply as ReturnType<typeof vi.fn>).mock.calls;
    expect(finalCalls).toHaveLength(1);
    expect(finalCalls[0][0]).toMatchObject({ text: "The answer is 42" });
  });

  it("suppresses isReasoning payloads from block replies (generic dispatch path)", async () => {
    setNoAbort();
    const dispatcher = createDispatcher();
    const ctx = buildTestCtx({ Provider: "whatsapp" });
    const blockReplySentTexts: string[] = [];
    const replyResolver = async (
      _ctx: MsgContext,
      opts?: GetReplyOptions,
    ): Promise<ReplyPayload> => {
      // Simulate block reply with reasoning payload
      await opts?.onBlockReply?.({ text: "Reasoning:\n_thinking..._", isReasoning: true });
      await opts?.onBlockReply?.({ text: "The answer is 42" });
      return { text: "The answer is 42" };
    };
    // Capture what actually gets dispatched as block replies
    (dispatcher.sendBlockReply as ReturnType<typeof vi.fn>).mockImplementation(
      (payload: ReplyPayload) => {
        if (payload.text) {
          blockReplySentTexts.push(payload.text);
        }
        return true;
      },
    );
    await dispatchReplyFromConfig({ ctx, cfg: emptyConfig, dispatcher, replyResolver });
    expect(blockReplySentTexts).not.toContain("Reasoning:\n_thinking..._");
    expect(blockReplySentTexts).toContain("The answer is 42");
  });
});
