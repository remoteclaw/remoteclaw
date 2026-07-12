import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearChannelBotPairLoopGuardForTests,
  recordChannelBotPairLoopAndCheckSuppression,
  type ChannelBotLoopProtectionFacts,
} from "./bot-loop-protection.js";

// Acceptance test for remoteclaw#2868: the botLoopProtection guard is wired into
// the bot-capable adapters' inbound preflight and short-circuits (drops, does NOT
// dispatch) once a single {scope, conversation, sender, receiver} pair exceeds its
// event budget. This models the exact decision the discord/googlechat/slack adapters
// perform: assemble facts -> record+check -> if suppressed, return before dispatch.

const MAX = 3;
const WINDOW_SECONDS = 60;
const COOLDOWN_SECONDS = 60;

const BASE_FACTS: Omit<ChannelBotLoopProtectionFacts, "nowMs"> = {
  scopeId: "account-1",
  conversationId: "channel-1",
  senderId: "bot-sender",
  receiverId: "our-bot",
  config: {
    enabled: true,
    maxEventsPerWindow: MAX,
    windowSeconds: WINDOW_SECONDS,
    cooldownSeconds: COOLDOWN_SECONDS,
  },
  defaultsConfig: undefined,
  defaultEnabled: true,
};

describe("botLoopProtection adapter wiring (remoteclaw#2868)", () => {
  beforeEach(() => {
    // The guard is a module singleton — isolate every test.
    clearChannelBotPairLoopGuardForTests();
  });

  /**
   * Models an adapter inbound preflight: record the bot-authored event, and if the
   * guard reports suppression, short-circuit before the dispatch call.
   */
  function simulateInboundBotMessage(dispatch: () => void, nowMs: number) {
    const result = recordChannelBotPairLoopAndCheckSuppression({ ...BASE_FACTS, nowMs });
    if (result.suppressed) {
      return result; // adapter drops the message: dispatch is NOT invoked
    }
    dispatch();
    return result;
  }

  it("dispatches the first N bot events then suppresses the (N+1)th for one pair", () => {
    const dispatch = vi.fn();
    const start = 1_000;

    // First N events (all within the window) dispatch normally.
    for (let i = 0; i < MAX; i++) {
      const result = simulateInboundBotMessage(dispatch, start + i);
      expect(result.suppressed).toBe(false);
    }
    expect(dispatch).toHaveBeenCalledTimes(MAX);

    // The (N+1)th event within the same window is suppressed and NOT dispatched.
    const suppressed = simulateInboundBotMessage(dispatch, start + MAX);
    expect(suppressed.suppressed).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(MAX); // unchanged: no dispatch
    if (!suppressed.suppressed) {
      throw new Error("expected suppression");
    }
    // cooldownUntilMs = the (N+1)th event time + cooldown window.
    expect(suppressed.cooldownUntilMs).toBe(start + MAX + COOLDOWN_SECONDS * 1_000);
  });

  it("keeps suppressing while nowMs is before cooldownUntilMs", () => {
    const dispatch = vi.fn();
    const start = 1_000;
    for (let i = 0; i <= MAX; i++) {
      simulateInboundBotMessage(dispatch, start + i);
    }
    expect(dispatch).toHaveBeenCalledTimes(MAX);

    // A further event still inside the cooldown window stays suppressed.
    const cooldownUntilMs = start + MAX + COOLDOWN_SECONDS * 1_000;
    const during = simulateInboundBotMessage(dispatch, cooldownUntilMs - 1);
    expect(during.suppressed).toBe(true);
    expect(dispatch).toHaveBeenCalledTimes(MAX); // still no dispatch
  });

  it("clears suppression and resumes dispatch once nowMs passes cooldownUntilMs", () => {
    const dispatch = vi.fn();
    const start = 1_000;
    for (let i = 0; i <= MAX; i++) {
      simulateInboundBotMessage(dispatch, start + i);
    }
    expect(dispatch).toHaveBeenCalledTimes(MAX);
    const cooldownUntilMs = start + MAX + COOLDOWN_SECONDS * 1_000;

    // Advance past cooldownUntilMs (and outside the sliding window): dispatch resumes.
    const resumed = simulateInboundBotMessage(dispatch, cooldownUntilMs + 1);
    expect(resumed.suppressed).toBe(false);
    expect(dispatch).toHaveBeenCalledTimes(MAX + 1); // dispatched again
  });

  it("never suppresses (always dispatches) when protection is disabled", () => {
    const dispatch = vi.fn();
    const disabledFacts: ChannelBotLoopProtectionFacts = {
      ...BASE_FACTS,
      config: { ...BASE_FACTS.config, enabled: false },
    };
    // Far exceed the budget; a disabled guard must admit every event.
    for (let i = 0; i < MAX + 5; i++) {
      const result = recordChannelBotPairLoopAndCheckSuppression({
        ...disabledFacts,
        nowMs: 1_000 + i,
      });
      expect(result.suppressed).toBe(false);
      if (!result.suppressed) {
        dispatch();
      }
    }
    expect(dispatch).toHaveBeenCalledTimes(MAX + 5);
  });

  it("scopes the budget per pair — a different sender is tracked independently", () => {
    const dispatch = vi.fn();
    const start = 1_000;
    // Trip suppression for bot-sender.
    for (let i = 0; i <= MAX; i++) {
      simulateInboundBotMessage(dispatch, start + i);
    }
    const other = recordChannelBotPairLoopAndCheckSuppression({
      ...BASE_FACTS,
      senderId: "different-bot",
      nowMs: start + MAX,
    });
    // A distinct sender pair is not affected by the tripped pair.
    expect(other.suppressed).toBe(false);
  });
});
