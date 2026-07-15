import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelBotLoopProtectionFacts } from "../../../src/channels/turn/bot-loop-protection.js";

// Regression coverage for the Google Chat bot-loop guard wiring (#2873 item 1).
//
// The guard facts are assembled inline in `processMessageWithPipeline` and the
// guard is called BEFORE `dispatchReplyWithBufferedBlockDispatcher`. That pipeline
// is module-private, reachable only through the event processor that `monitor.js`
// registers at import time. We capture that processor by mocking
// `setGoogleChatWebhookEventProcessor`, then invoke it directly — exercising the
// REAL assembly + short-circuit while mocking only the guard (capture facts +
// control verdict), the dispatch fn (a `core` method), and the access policy.
// Non-vacuous: swapping sender/receiver (or scope/conversation) in the assembly
// makes the id assertions fail.

const guardMock = vi.hoisted(() => vi.fn());
const dispatchReplySpy = vi.hoisted(() => vi.fn(async () => {}));
const processorHolder = vi.hoisted(
  () =>
    ({ current: undefined }) as {
      current?: (event: unknown, target: unknown) => Promise<void>;
    },
);

vi.mock("./monitor-routing.js", () => ({
  setGoogleChatWebhookEventProcessor: (fn: (event: unknown, target: unknown) => Promise<void>) => {
    processorHolder.current = fn;
  },
  registerGoogleChatWebhookTarget: vi.fn(() => () => {}),
  handleGoogleChatWebhookRequest: vi.fn(),
}));

vi.mock("./monitor-access.js", () => ({
  applyGoogleChatInboundAccessPolicy: vi.fn(async () => ({
    ok: true,
    commandAuthorized: false,
    effectiveWasMentioned: false,
    groupSystemPrompt: undefined,
  })),
  isSenderAllowed: vi.fn(() => true),
}));

vi.mock("remoteclaw/plugin-sdk/googlechat", () => ({
  recordChannelBotPairLoopAndCheckSuppression: guardMock,
  createWebhookInFlightLimiter: vi.fn(),
  createReplyPrefixOptions: vi.fn(() => ({})),
  registerWebhookTargetWithPluginRoute: vi.fn(),
  resolveInboundRouteEnvelopeBuilderWithRuntime: vi.fn(),
  resolveWebhookPath: vi.fn(),
}));

// Importing the monitor registers `processGoogleChatEvent` via the mocked setter.
await import("./monitor.js");

const ACCOUNT_ID = "gc-acct";
const SPACE_ID = "spaces/AAA";
const SENDER_BOT = "users/other-bot";
const SELF_APP_USER = "users/self-app";

function createBotMessageEvent() {
  return {
    type: "MESSAGE",
    eventTime: "2026-03-02T00:00:00.000Z",
    space: { name: SPACE_ID, type: "SPACE", displayName: "Test Space" },
    message: {
      name: `${SPACE_ID}/messages/1`,
      text: "hello from a peer bot",
      sender: { name: SENDER_BOT, displayName: "Other Bot", type: "BOT" },
    },
  };
}

function createTarget() {
  return {
    account: { accountId: ACCOUNT_ID, config: { allowBots: true, botUser: SELF_APP_USER } },
    config: { channels: { defaults: {} } },
    runtime: { log: vi.fn(), error: vi.fn() },
    core: {
      logging: { shouldLogVerbose: () => false },
      channel: {
        reply: {
          dispatchReplyWithBufferedBlockDispatcher: dispatchReplySpy,
          finalizeInboundContext: vi.fn(),
        },
      },
    },
    statusSink: vi.fn(),
    mediaMaxMb: 20,
  };
}

describe("googlechat processMessageWithPipeline bot-loop protection", () => {
  beforeEach(() => {
    guardMock.mockReset();
    dispatchReplySpy.mockReset();
    dispatchReplySpy.mockResolvedValue(undefined);
  });

  it("registered a processor at import time", () => {
    expect(typeof processorHolder.current).toBe("function");
  });

  it("assembles the four guard ids from the inbound Google Chat message", async () => {
    guardMock.mockReturnValue({ suppressed: true, cooldownUntilMs: 1_700_000_060_000 });

    await processorHolder.current?.(createBotMessageEvent(), createTarget());

    expect(guardMock).toHaveBeenCalledTimes(1);
    const facts = guardMock.mock.calls[0][0] as ChannelBotLoopProtectionFacts;
    // scopeId <- account.accountId, conversationId <- space.name,
    // senderId <- message.sender.name (the peer bot),
    // receiverId <- appUserId (account.config.botUser, else "users/app").
    expect(facts.scopeId).toBe(ACCOUNT_ID);
    expect(facts.conversationId).toBe(SPACE_ID);
    expect(facts.senderId).toBe(SENDER_BOT);
    expect(facts.receiverId).toBe(SELF_APP_USER);
  });

  it("short-circuits before dispatch when the guard suppresses", async () => {
    guardMock.mockReturnValue({ suppressed: true, cooldownUntilMs: 1_700_000_060_000 });

    await processorHolder.current?.(createBotMessageEvent(), createTarget());

    expect(guardMock).toHaveBeenCalledTimes(1);
    expect(dispatchReplySpy).not.toHaveBeenCalled();
  });
});
