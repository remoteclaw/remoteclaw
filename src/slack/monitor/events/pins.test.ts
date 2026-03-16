import { describe, expect, it, vi } from "vitest";
import { registerSlackPinEvents } from "./pins.js";
import {
  createSlackSystemEventTestHarness as buildPinHarness,
  type SlackSystemEventTestOverrides as PinOverrides,
} from "./system-event-test-harness.js";

const pinEnqueueMock = vi.hoisted(() => vi.fn());
const pinAllowMock = vi.hoisted(() => vi.fn());

vi.mock("../../../infra/system-events.js", () => {
  return { enqueueSystemEvent: pinEnqueueMock };
});
vi.mock("../../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: pinAllowMock,
}));

type PinHandler = (args: { event: Record<string, unknown>; body: unknown }) => Promise<void>;

type PinCase = {
  body?: unknown;
  event?: Record<string, unknown>;
  handler?: "added" | "removed";
  overrides?: PinOverrides;
  shouldDropMismatchedSlackEvent?: (body: unknown) => boolean;
};

function makePinEvent(overrides?: { channel?: string; user?: string }) {
  return {
    type: "pin_added",
    user: overrides?.user ?? "U1",
    channel_id: overrides?.channel ?? "D1",
    event_ts: "123.456",
    item: {
      type: "message",
      message: { ts: "123.456" },
    },
  };
}

function installPinHandlers(args: {
  overrides?: PinOverrides;
  shouldDropMismatchedSlackEvent?: (body: unknown) => boolean;
}) {
  const harness = buildPinHarness(args.overrides);
  if (args.shouldDropMismatchedSlackEvent) {
    harness.ctx.shouldDropMismatchedSlackEvent = args.shouldDropMismatchedSlackEvent;
  }
  registerSlackPinEvents({ ctx: harness.ctx });
  return {
    added: harness.getHandler("pin_added") as PinHandler | null,
    removed: harness.getHandler("pin_removed") as PinHandler | null,
  };
}

async function runPinCase(input: PinCase = {}): Promise<void> {
  pinEnqueueMock.mockClear();
  pinAllowMock.mockReset().mockResolvedValue([]);
  const { added, removed } = installPinHandlers({
    overrides: input.overrides,
    shouldDropMismatchedSlackEvent: input.shouldDropMismatchedSlackEvent,
  });
  const handlerKey = input.handler ?? "added";
  const handler = handlerKey === "removed" ? removed : added;
  expect(handler).toBeTruthy();
  const event = (input.event ?? makePinEvent()) as Record<string, unknown>;
  const body = input.body ?? {};
  await handler!({
    body,
    event,
  });
}

describe("registerSlackPinEvents", () => {
  it.each([
    [
      "enqueues DM pin system events when dmPolicy is open",
      { overrides: { dmPolicy: "open" as const } },
      1,
    ],
    [
      "blocks DM pin system events when dmPolicy is disabled",
      { overrides: { dmPolicy: "disabled" as const } },
      0,
    ],
    [
      "blocks DM pin system events for unauthorized senders in allowlist mode",
      {
        overrides: { dmPolicy: "allowlist" as const, allowFrom: ["U2"] },
        event: makePinEvent({ user: "U1" }),
      },
      0,
    ],
    [
      "allows DM pin system events for authorized senders in allowlist mode",
      {
        overrides: { dmPolicy: "allowlist" as const, allowFrom: ["U1"] },
        event: makePinEvent({ user: "U1" }),
      },
      1,
    ],
    [
      "blocks channel pin events for users outside channel users allowlist",
      {
        overrides: {
          dmPolicy: "open" as const,
          channelType: "channel" as const,
          channelUsers: ["U_OWNER"],
        },
        event: makePinEvent({ channel: "C1", user: "U_ATTACKER" }),
      },
      0,
    ],
  ])("%s", async (_name, args: PinCase, expectedCalls: number) => {
    await runPinCase(args);
    expect(pinEnqueueMock).toHaveBeenCalledTimes(expectedCalls);
  });

  it("drops mismatched events", async () => {
    await runPinCase({
      shouldDropMismatchedSlackEvent: () => true,
      body: { api_app_id: "A_OTHER" },
    });

    expect(pinEnqueueMock).not.toHaveBeenCalled();
  });
});
