import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelBotLoopProtectionFacts } from "../../../../src/channels/turn/bot-loop-protection.js";

// Regression coverage for the Discord bot-loop guard short-circuit (#2873 item 1).
//
// Discord's guard facts are assembled in `preflightDiscordMessage` and consumed
// here by `processDiscordMessage`, which calls the shared guard and MUST `return`
// before `dispatchInboundMessage` on a suppressed result. This test drives the
// REAL consumer with the assembled facts and mocks only the guard (capture facts
// + control verdict) and the dispatch fn (to prove the short-circuit).
//
// NOTE ON ASSEMBLY COVERAGE: unlike Slack/Google Chat — whose assembly is
// reachable through a callable seam — Discord's field mapping lives at the very
// end of `preflightDiscordMessage`, behind ~30 admission gates that currently
// drop bot-authored messages in this environment (see the pre-existing failures
// in the quarantined `message-handler.preflight.test.ts`). Driving that path
// would require either a red test or an out-of-scope source change, so this test
// asserts the short-circuit + the four-id forwarding contract at the consumer
// boundary. The preflight assembly's per-field mapping is documented at
// `message-handler.preflight.ts` (scopeId<-accountId, conversationId<-channelId,
// senderId<-author.id, receiverId<-botUserId).

const guardMock = vi.hoisted(() => vi.fn());
const dispatchSpy = vi.hoisted(() =>
  vi.fn(async () => ({ queuedFinal: false, counts: { final: 0, tool: 0, block: 0 } })),
);

vi.mock("../../../../src/channels/turn/bot-loop-protection.js", () => ({
  recordChannelBotPairLoopAndCheckSuppression: guardMock,
}));

vi.mock("../../../../src/auto-reply/dispatch.js", () => ({
  dispatchInboundMessage: dispatchSpy,
}));

const { processDiscordMessage } = await import("./message-handler.process.js");

const ACCOUNT_ID = "default";
const CHANNEL_ID = "c1";
const SENDER_BOT_ID = "other-bot-999";
const SELF_BOT_ID = "remoteclaw-bot";

function createBotCtx(): Parameters<typeof processDiscordMessage>[0] {
  const botLoopProtection: ChannelBotLoopProtectionFacts = {
    scopeId: ACCOUNT_ID,
    conversationId: CHANNEL_ID,
    senderId: SENDER_BOT_ID,
    receiverId: SELF_BOT_ID,
    defaultEnabled: true,
  };
  // Minimal context: only the fields the guarded short-circuit reads. On a
  // suppressed result `processDiscordMessage` returns before touching any of the
  // heavier dispatch machinery.
  return { botLoopProtection } as never;
}

describe("discord processDiscordMessage bot-loop protection", () => {
  beforeEach(() => {
    guardMock.mockReset();
    dispatchSpy.mockReset();
    dispatchSpy.mockResolvedValue({ queuedFinal: false, counts: { final: 0, tool: 0, block: 0 } });
  });

  it("forwards the four assembled guard ids to the shared guard", async () => {
    guardMock.mockReturnValue({ suppressed: true, cooldownUntilMs: 1_700_000_060_000 });

    await processDiscordMessage(createBotCtx());

    expect(guardMock).toHaveBeenCalledTimes(1);
    const facts = guardMock.mock.calls[0][0] as ChannelBotLoopProtectionFacts;
    expect(facts.scopeId).toBe(ACCOUNT_ID);
    expect(facts.conversationId).toBe(CHANNEL_ID);
    expect(facts.senderId).toBe(SENDER_BOT_ID);
    expect(facts.receiverId).toBe(SELF_BOT_ID);
  });

  it("short-circuits before dispatch when the guard suppresses", async () => {
    guardMock.mockReturnValue({ suppressed: true, cooldownUntilMs: 1_700_000_060_000 });

    await processDiscordMessage(createBotCtx());

    expect(guardMock).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).not.toHaveBeenCalled();
  });
});
