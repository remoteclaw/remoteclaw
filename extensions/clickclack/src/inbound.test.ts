// Clickclack tests cover inbound plugin behavior.
import type { PluginRuntime } from "remoteclaw/plugin-sdk/clickclack";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPluginRuntimeMock } from "../../test-utils/plugin-runtime-mock.js";
import { handleClickClackInbound } from "./inbound.js";
import { setClickClackRuntime } from "./runtime.js";
import type { ClickClackMessage, CoreConfig, ResolvedClickClackAccount } from "./types.js";

const sendClickClackTextMock = vi.hoisted(() => vi.fn());
const dispatchInboundReplyWithBaseMock = vi.hoisted(() => vi.fn());

vi.mock("./outbound.js", () => ({
  sendClickClackText: sendClickClackTextMock,
}));

// Only the reply-dispatch helper is stubbed; `resolveStableChannelMessageIngress`
// stays real so the allowlist assertions below exercise the actual ingress gate.
vi.mock("remoteclaw/plugin-sdk/clickclack", async (importOriginal) => ({
  ...(await importOriginal<typeof import("remoteclaw/plugin-sdk/clickclack")>()),
  dispatchInboundReplyWithBase: dispatchInboundReplyWithBaseMock,
}));

function createRuntime(): PluginRuntime {
  return createPluginRuntimeMock({
    channel: {
      routing: {
        resolveAgentRoute({
          accountId,
          peer,
        }: Parameters<PluginRuntime["channel"]["routing"]["resolveAgentRoute"]>[0]) {
          return {
            agentId: "test-agent",
            channel: "clickclack",
            accountId: accountId ?? "default",
            sessionKey: `agent:test-agent:clickclack:${peer?.kind ?? "channel"}:${peer?.id ?? "general"}`,
            mainSessionKey: "agent:test-agent:main",
            lastRoutePolicy: "session",
            matchedBy: "default",
          };
        },
        buildAgentSessionKey({
          agentId,
          channel,
          accountId,
          peer,
        }: Parameters<PluginRuntime["channel"]["routing"]["buildAgentSessionKey"]>[0]) {
          return `agent:${agentId}:${channel}:${accountId ?? "default"}:${peer?.kind ?? "channel"}:${peer?.id ?? "general"}`;
        },
      },
    },
  } as unknown as PluginRuntime);
}

function createAgentAccount(
  overrides: Partial<ResolvedClickClackAccount> = {},
): ResolvedClickClackAccount {
  const base = {
    accountId: "default",
    enabled: true,
    configured: true,
    baseUrl: "http://127.0.0.1:8080",
    token: "ccb_default",
    workspace: "wsp_1",
    defaultTo: "channel:general",
    allowFrom: ["*"],
    reconnectMs: 1_500,
    agentActivity: false,
    config: {
      allowFrom: ["*"],
    },
  } satisfies ResolvedClickClackAccount;

  return {
    ...base,
    ...overrides,
    config: {
      ...base.config,
      ...overrides.config,
    },
  };
}

function createMessage(overrides: Partial<ClickClackMessage> = {}): ClickClackMessage {
  return {
    id: "msg_1",
    workspace_id: "wsp_1",
    channel_id: "chn_1",
    author_id: "usr_owner",
    thread_root_id: "msg_1",
    body: "/fast on",
    body_format: "markdown",
    created_at: "2026-05-09T12:00:00.000Z",
    author: {
      id: "usr_owner",
      kind: "human",
      display_name: "Peter",
      handle: "steipete",
      avatar_url: "",
      created_at: "2026-05-09T12:00:00.000Z",
    },
    ...overrides,
  };
}

const cfg = {
  agents: {
    defaults: {
      model: "test-model",
    },
  },
} satisfies CoreConfig;

describe("handleClickClackInbound", () => {
  beforeEach(() => {
    sendClickClackTextMock.mockReset();
    dispatchInboundReplyWithBaseMock.mockReset();
  });

  it("marks agent turns command-authorized for allowlisted senders", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.channel.commands.shouldComputeCommandAuthorized).mockReturnValue(true);
    setClickClackRuntime(runtime);

    await handleClickClackInbound({
      account: createAgentAccount({
        allowFrom: ["usr_owner"],
        config: { allowFrom: ["usr_owner"] },
      }),
      config: cfg,
      message: createMessage(),
    });

    expect(dispatchInboundReplyWithBaseMock).toHaveBeenCalledTimes(1);
    expect(dispatchInboundReplyWithBaseMock.mock.calls[0]?.[0].ctxPayload.CommandAuthorized).toBe(
      true,
    );
  });

  it("propagates the account reply timeout into dispatch reply options", async () => {
    const runtime = createRuntime();
    setClickClackRuntime(runtime);

    await handleClickClackInbound({
      account: createAgentAccount({ timeoutSeconds: 42 }),
      config: cfg,
      message: createMessage(),
    });

    expect(dispatchInboundReplyWithBaseMock).toHaveBeenCalledTimes(1);
    expect(dispatchInboundReplyWithBaseMock.mock.calls[0]?.[0].replyOptions).toEqual({
      timeoutOverrideSeconds: 42,
    });
  });

  it("accepts ClickClack DM target syntax in allowFrom", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.channel.commands.shouldComputeCommandAuthorized).mockReturnValue(true);
    setClickClackRuntime(runtime);

    await handleClickClackInbound({
      account: createAgentAccount({
        allowFrom: ["dm:usr_owner"],
        config: { allowFrom: ["dm:usr_owner"] },
      }),
      config: cfg,
      message: createMessage({
        channel_id: undefined,
        direct_conversation_id: "dcn_1",
      }),
    });

    expect(dispatchInboundReplyWithBaseMock).toHaveBeenCalledTimes(1);
    expect(dispatchInboundReplyWithBaseMock.mock.calls[0]?.[0].ctxPayload.ChatType).toBe("direct");
    expect(dispatchInboundReplyWithBaseMock.mock.calls[0]?.[0].ctxPayload.CommandAuthorized).toBe(
      true,
    );
  });

  it("does not dispatch agent turns from senders outside allowFrom", async () => {
    const runtime = createRuntime();
    vi.mocked(runtime.channel.commands.shouldComputeCommandAuthorized).mockReturnValue(true);
    setClickClackRuntime(runtime);

    await handleClickClackInbound({
      account: createAgentAccount({
        allowFrom: ["usr_owner"],
        config: { allowFrom: ["usr_owner"] },
      }),
      config: cfg,
      message: createMessage({
        author_id: "usr_attacker",
        author: {
          id: "usr_attacker",
          kind: "human",
          display_name: "Attacker",
          handle: "attacker",
          avatar_url: "",
          created_at: "2026-05-09T12:00:00.000Z",
        },
      }),
    });

    expect(dispatchInboundReplyWithBaseMock).not.toHaveBeenCalled();
    expect(runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher).not.toHaveBeenCalled();
  });

  it("honors a caller-supplied denial without re-resolving access", async () => {
    // The gateway resolves access once and passes it down; `handleClickClackInbound`
    // must still refuse to dispatch on a denied admission even though the caller
    // reports the command itself as authorized.
    const runtime = createRuntime();
    setClickClackRuntime(runtime);

    await handleClickClackInbound({
      account: createAgentAccount(),
      config: cfg,
      message: createMessage(),
      access: { shouldDispatch: false, commandAuthorized: true },
    });

    expect(dispatchInboundReplyWithBaseMock).not.toHaveBeenCalled();
    expect(sendClickClackTextMock).not.toHaveBeenCalled();
  });
});
