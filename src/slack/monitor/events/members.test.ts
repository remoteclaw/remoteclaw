import { describe, expect, it, vi } from "vitest";
import { registerSlackMemberEvents } from "./members.js";
import {
  createSlackSystemEventTestHarness as initSlackHarness,
  type SlackSystemEventTestOverrides as MemberOverrides,
} from "./system-event-test-harness.js";

const memberMocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  readAllow: vi.fn(),
}));

vi.mock("../../../infra/system-events.js", () => ({
  enqueueSystemEvent: memberMocks.enqueue,
}));

vi.mock("../../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: memberMocks.readAllow,
}));

type MemberHandler = (args: { event: Record<string, unknown>; body: unknown }) => Promise<void>;

type MemberCaseArgs = {
  event?: Record<string, unknown>;
  body?: unknown;
  overrides?: MemberOverrides;
  handler?: "joined" | "left";
  shouldDropMismatchedSlackEvent?: (body: unknown) => boolean;
};

function makeMemberEvent(overrides?: { channel?: string; user?: string }) {
  return {
    type: "member_joined_channel",
    user: overrides?.user ?? "U1",
    channel: overrides?.channel ?? "D1",
    event_ts: "123.456",
  };
}

function getMemberHandlers(params: {
  overrides?: MemberOverrides;
  shouldDropMismatchedSlackEvent?: (body: unknown) => boolean;
}) {
  const harness = initSlackHarness(params.overrides);
  if (params.shouldDropMismatchedSlackEvent) {
    harness.ctx.shouldDropMismatchedSlackEvent = params.shouldDropMismatchedSlackEvent;
  }
  registerSlackMemberEvents({ ctx: harness.ctx });
  return {
    joined: harness.getHandler("member_joined_channel") as MemberHandler | null,
    left: harness.getHandler("member_left_channel") as MemberHandler | null,
  };
}

async function runMemberCase(args: MemberCaseArgs = {}): Promise<void> {
  memberMocks.enqueue.mockClear();
  memberMocks.readAllow.mockReset().mockResolvedValue([]);
  const handlers = getMemberHandlers({
    overrides: args.overrides,
    shouldDropMismatchedSlackEvent: args.shouldDropMismatchedSlackEvent,
  });
  const key = args.handler ?? "joined";
  const handler = handlers[key];
  expect(handler).toBeTruthy();
  await handler!({
    event: (args.event ?? makeMemberEvent()) as Record<string, unknown>,
    body: args.body ?? {},
  });
}

describe("registerSlackMemberEvents", () => {
  it.each([
    {
      name: "enqueues DM member events when dmPolicy is open",
      args: { overrides: { dmPolicy: "open" as const } },
      calls: 1,
    },
    {
      name: "blocks DM member events when dmPolicy is disabled",
      args: { overrides: { dmPolicy: "disabled" as const } },
      calls: 0,
    },
    {
      name: "blocks DM member events for unauthorized senders in allowlist mode",
      args: {
        overrides: { dmPolicy: "allowlist" as const, allowFrom: ["U2"] },
        event: makeMemberEvent({ user: "U1" }),
      },
      calls: 0,
    },
    {
      name: "allows DM member events for authorized senders in allowlist mode",
      args: {
        handler: "left" as const,
        overrides: { dmPolicy: "allowlist" as const, allowFrom: ["U1"] },
        event: { ...makeMemberEvent({ user: "U1" }), type: "member_left_channel" },
      },
      calls: 1,
    },
    {
      name: "blocks channel member events for users outside channel users allowlist",
      args: {
        overrides: {
          dmPolicy: "open" as const,
          channelType: "channel" as const,
          channelUsers: ["U_OWNER"],
        },
        event: makeMemberEvent({ channel: "C1", user: "U_ATTACKER" }),
      },
      calls: 0,
    },
  ])("$name", async ({ args, calls }) => {
    await runMemberCase(args);
    expect(memberMocks.enqueue).toHaveBeenCalledTimes(calls);
  });

  it("drops mismatched events", async () => {
    await runMemberCase({
      shouldDropMismatchedSlackEvent: () => true,
      body: { api_app_id: "A_OTHER" },
    });

    expect(memberMocks.enqueue).not.toHaveBeenCalled();
  });
});
