import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveSessionAgentId: vi.fn(() => "agent-from-key"),
  resolveSessionDeliveryTarget: vi.fn(() => ({
    channel: "whatsapp",
    to: "+15550001",
    accountId: "acct-1",
    threadId: "thread-1",
  })),
  normalizeMessageChannel: vi.fn((channel: string) => channel),
  isDeliverableMessageChannel: vi.fn(() => true),
  deliverOutboundPayloads: vi.fn(async () => []),
  enqueueSystemEvent: vi.fn(),
}));

type SessionMaintenanceWarningModule = typeof import("./session-maintenance-warning.js");

let deliverSessionMaintenanceWarning: SessionMaintenanceWarningModule["deliverSessionMaintenanceWarning"];

describe("deliverSessionMaintenanceWarning", () => {
  let prevVitest: string | undefined;
  let prevNodeEnv: string | undefined;

  beforeEach(async () => {
    prevVitest = process.env.VITEST;
    prevNodeEnv = process.env.NODE_ENV;
    delete process.env.VITEST;
    process.env.NODE_ENV = "development";
    vi.resetModules();
    mocks.resolveSessionAgentId.mockClear();
    mocks.resolveSessionDeliveryTarget.mockClear();
    mocks.normalizeMessageChannel.mockClear();
    mocks.isDeliverableMessageChannel.mockClear();
    mocks.deliverOutboundPayloads.mockClear();
    mocks.enqueueSystemEvent.mockClear();
    vi.doMock("../agents/agent-scope.js", () => ({
      resolveSessionAgentId: mocks.resolveSessionAgentId,
    }));
    vi.doMock("../utils/message-channel.js", () => ({
      normalizeMessageChannel: mocks.normalizeMessageChannel,
      isDeliverableMessageChannel: mocks.isDeliverableMessageChannel,
    }));
    vi.doMock("./outbound/targets.js", () => ({
      resolveSessionDeliveryTarget: mocks.resolveSessionDeliveryTarget,
    }));
    vi.doMock("./outbound/deliver.js", () => ({
      deliverOutboundPayloads: mocks.deliverOutboundPayloads,
    }));
    vi.doMock("./system-events.js", () => ({
      enqueueSystemEvent: mocks.enqueueSystemEvent,
    }));
    ({ deliverSessionMaintenanceWarning } = await import("./session-maintenance-warning.js"));
  });

  afterEach(() => {
    if (prevVitest === undefined) {
      delete process.env.VITEST;
    } else {
      process.env.VITEST = prevVitest;
    }
    if (prevNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = prevNodeEnv;
    }
  });

  it("forwards session context to outbound delivery", async () => {
    await deliverSessionMaintenanceWarning({
      cfg: {},
      sessionKey: "agent:main:main",
      entry: {} as never,
      warning: {
        activeSessionKey: "agent:main:main",
        pruneAfterMs: 1_000,
        maxEntries: 100,
        wouldPrune: true,
        wouldCap: false,
      } as never,
    });

    expect(mocks.deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        to: "+15550001",
        session: { key: "agent:main:main", agentId: "agent-from-key" },
      }),
    );
    expect(mocks.enqueueSystemEvent).not.toHaveBeenCalled();
  });
});
