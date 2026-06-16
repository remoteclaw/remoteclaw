import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveSessionAgentId: vi.fn(() => "agent-from-key"),
  consumeRestartSentinel: vi.fn(async () => ({
    payload: {
      sessionKey: "agent:main:main",
      deliveryContext: {
        channel: "whatsapp",
        to: "+15550002",
        accountId: "acct-2",
      },
    },
  })),
  formatRestartSentinelMessage: vi.fn(() => "restart message"),
  summarizeRestartSentinel: vi.fn(() => "restart summary"),
  resolveMainSessionKeyFromConfig: vi.fn(() => "agent:main:main"),
  parseSessionThreadInfo: vi.fn(() => ({ baseSessionKey: null, threadId: undefined })),
  loadSessionEntry: vi.fn(() => ({ cfg: {}, entry: {} })),
  resolveAnnounceTargetFromKey: vi.fn(() => null),
  deliveryContextFromSession: vi.fn(() => undefined),
  mergeDeliveryContext: vi.fn((a?: Record<string, unknown>, b?: Record<string, unknown>) => ({
    ...b,
    ...a,
  })),
  normalizeChannelId: vi.fn((channel: string) => channel),
  resolveOutboundTarget: vi.fn(() => ({ ok: true as const, to: "+15550002" })),
  deliverOutboundPayloads: vi.fn(async () => [{ channel: "whatsapp", messageId: "msg-1" }]),
  enqueueSystemEvent: vi.fn(),
}));

vi.mock("../agents/agent-scope.js", () => ({
  resolveSessionAgentId: mocks.resolveSessionAgentId,
  resolveAgentRuntime: () => "claude",
}));

vi.mock("../infra/restart-sentinel.js", () => ({
  consumeRestartSentinel: mocks.consumeRestartSentinel,
  formatRestartSentinelMessage: mocks.formatRestartSentinelMessage,
  summarizeRestartSentinel: mocks.summarizeRestartSentinel,
}));

vi.mock("../config/sessions.js", () => ({
  resolveMainSessionKeyFromConfig: mocks.resolveMainSessionKeyFromConfig,
}));

vi.mock("../config/sessions/delivery-info.js", () => ({
  parseSessionThreadInfo: mocks.parseSessionThreadInfo,
}));

vi.mock("./session-utils.js", () => ({
  loadSessionEntry: mocks.loadSessionEntry,
}));

vi.mock("../agents/tools/sessions-send-helpers.js", () => ({
  resolveAnnounceTargetFromKey: mocks.resolveAnnounceTargetFromKey,
}));

vi.mock("../utils/delivery-context.js", () => ({
  deliveryContextFromSession: mocks.deliveryContextFromSession,
  mergeDeliveryContext: mocks.mergeDeliveryContext,
}));

vi.mock("../channels/plugins/index.js", () => ({
  normalizeChannelId: mocks.normalizeChannelId,
}));

vi.mock("../infra/outbound/targets.js", () => ({
  resolveOutboundTarget: mocks.resolveOutboundTarget,
}));

vi.mock("../infra/outbound/deliver.js", () => ({
  deliverOutboundPayloads: mocks.deliverOutboundPayloads,
}));

vi.mock("../infra/system-events.js", () => ({
  enqueueSystemEvent: mocks.enqueueSystemEvent,
}));

const { scheduleRestartSentinelWake } = await import("./server-restart-sentinel.js");

describe("scheduleRestartSentinelWake", () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.consumeRestartSentinel.mockResolvedValue({
      payload: {
        sessionKey: "agent:main:main",
        deliveryContext: {
          channel: "whatsapp",
          to: "+15550002",
          accountId: "acct-2",
        },
      },
    });
    mocks.deliverOutboundPayloads.mockReset();
    mocks.deliverOutboundPayloads.mockResolvedValue([{ channel: "whatsapp", messageId: "msg-1" }]);
    mocks.enqueueSystemEvent.mockClear();
  });

  it("delivers the sentinel note via best-effort outbound when delivery context resolves", async () => {
    // The fork's restart-sentinel uses a single best-effort outbound delivery
    // (no delivery-queue, retry, ack/fail, or heartbeat-wake — those are an
    // upstream-only flow never ported here). On a successful delivery it does
    // NOT also enqueue a system event; that fallback fires only on failure.
    await scheduleRestartSentinelWake({ deps: {} as never });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        to: "+15550002",
        payloads: [{ text: "restart message" }],
        bestEffort: true,
      }),
    );
    expect(mocks.enqueueSystemEvent).not.toHaveBeenCalled();
  });

  it("falls back to a queued system event when outbound delivery throws", async () => {
    mocks.deliverOutboundPayloads.mockReset();
    mocks.deliverOutboundPayloads.mockRejectedValue(new Error("transport not ready"));

    await scheduleRestartSentinelWake({ deps: {} as never });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueSystemEvent).toHaveBeenCalledWith(
      expect.stringContaining("restart summary"),
      expect.objectContaining({ sessionKey: "agent:main:main" }),
    );
  });

  it("threads the top-level sentinel threadId into outbound routing", async () => {
    // Legacy or malformed sentinel JSON can still carry a nested threadId; the
    // top-level threadId must win for wake routing. The fork carries threadId
    // into the outbound delivery, not into a system-event fallback.
    mocks.consumeRestartSentinel.mockResolvedValue({
      payload: {
        sessionKey: "agent:main:main",
        deliveryContext: {
          channel: "whatsapp",
          to: "+15550002",
          accountId: "acct-2",
          threadId: "stale-thread",
        } as never,
        threadId: "fresh-thread",
      },
    } as Awaited<ReturnType<typeof mocks.consumeRestartSentinel>>);

    await scheduleRestartSentinelWake({ deps: {} as never });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        to: "+15550002",
        threadId: "fresh-thread",
      }),
    );
  });

  it("does not wake the main session when the sentinel has no sessionKey", async () => {
    mocks.consumeRestartSentinel.mockResolvedValue({
      payload: {
        message: "restart message",
      },
    } as unknown as Awaited<ReturnType<typeof mocks.consumeRestartSentinel>>);

    await scheduleRestartSentinelWake({ deps: {} as never });

    expect(mocks.enqueueSystemEvent).toHaveBeenCalledWith("restart message", {
      sessionKey: "agent:main:main",
    });
    expect(mocks.deliverOutboundPayloads).not.toHaveBeenCalled();
  });
});
