import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelBotLoopProtectionFacts } from "../../../../../src/channels/turn/bot-loop-protection.js";

// Regression coverage for the Slack bot-loop guard wiring (#2873 item 1).
//
// `dispatchPreparedSlackMessage` assembles `ChannelBotLoopProtectionFacts` from
// the inbound Slack message (via `resolveSlackBotLoopProtection`) and calls the
// shared guard BEFORE `dispatchInboundMessage`. On a suppressed result it must
// short-circuit before dispatch. This test drives the REAL assembly + guard call
// and mocks only the guard (to capture the facts + control the verdict) and the
// dispatch fn (to prove the short-circuit). It is non-vacuous: swapping
// sender/receiver (or scope/conversation) in `resolveSlackBotLoopProtection`
// makes the id assertions fail.

const guardMock = vi.hoisted(() => vi.fn());
const dispatchSpy = vi.hoisted(() =>
  vi.fn(async () => ({ queuedFinal: false, counts: { final: 0, tool: 0, block: 0 } })),
);

vi.mock("../../../../../src/channels/turn/bot-loop-protection.js", () => ({
  recordChannelBotPairLoopAndCheckSuppression: guardMock,
}));

vi.mock("../../../../../src/auto-reply/dispatch.js", () => ({
  dispatchInboundMessage: dispatchSpy,
}));

const { dispatchPreparedSlackMessage } = await import("./dispatch.js");

const RECEIVER_BOT_ID = "B_SELF";
const RECEIVER_BOT_USER_ID = "U_SELF";
const SENDER_BOT_ID = "B_OTHER";

function createPreparedBotMessage(): Parameters<typeof dispatchPreparedSlackMessage>[0] {
  return {
    ctx: {
      cfg: { channels: { defaults: {} } },
      runtime: { error: vi.fn() },
      botId: RECEIVER_BOT_ID,
      botUserId: RECEIVER_BOT_USER_ID,
    },
    account: { accountId: "acct-1", config: {} },
    message: {
      channel: "C123",
      bot_id: SENDER_BOT_ID,
      user: "U_OTHER",
      ts: "1700000000.000100",
    },
    route: { accountId: "acct-1" },
    channelConfig: null,
  } as never;
}

describe("slack dispatchPreparedSlackMessage bot-loop protection", () => {
  beforeEach(() => {
    guardMock.mockReset();
    dispatchSpy.mockReset();
    dispatchSpy.mockResolvedValue({ queuedFinal: false, counts: { final: 0, tool: 0, block: 0 } });
  });

  it("assembles the four guard ids from the inbound Slack message", async () => {
    guardMock.mockReturnValue({ suppressed: true, cooldownUntilMs: 1_700_000_060_000 });

    await dispatchPreparedSlackMessage(createPreparedBotMessage());

    expect(guardMock).toHaveBeenCalledTimes(1);
    const facts = guardMock.mock.calls[0][0] as ChannelBotLoopProtectionFacts;
    // scopeId <- route.accountId, conversationId <- message.channel,
    // senderId <- message.bot_id (the peer bot), receiverId <- ctx.botId (self).
    expect(facts.scopeId).toBe("acct-1");
    expect(facts.conversationId).toBe("C123");
    expect(facts.senderId).toBe(SENDER_BOT_ID);
    expect(facts.receiverId).toBe(RECEIVER_BOT_ID);
  });

  it("short-circuits before dispatch when the guard suppresses", async () => {
    guardMock.mockReturnValue({ suppressed: true, cooldownUntilMs: 1_700_000_060_000 });

    await dispatchPreparedSlackMessage(createPreparedBotMessage());

    expect(guardMock).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
