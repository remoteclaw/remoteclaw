import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMatrixMonitorTestRuntime } from "../../test-runtime.js";
import type { MatrixClient } from "../sdk.js";
import {
  createMatrixRoomMessageHandler,
  resolveMatrixBaseRouteSession,
  shouldOverrideMatrixDmToGroup,
} from "./handler.js";
import { EventType, type MatrixRawEvent } from "./types.js";

describe("createMatrixRoomMessageHandler inbound body formatting", () => {
  beforeEach(() => {
    installMatrixMonitorTestRuntime({
      matchesMentionPatterns: () => false,
      saveMediaBuffer: vi.fn(),
    });
  });

    const runtime = {
      error: vi.fn(),
    } as unknown as RuntimeEnv;
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    } as unknown as RuntimeLogger;
    const logVerboseMessage = vi.fn();

    const client = {
      getUserId: vi.fn().mockResolvedValue("@bot:matrix.example.org"),
    } as unknown as MatrixClient;

    const handler = createMatrixRoomMessageHandler({
      client,
      core,
      cfg: {},
      runtime,
      logger,
      logVerboseMessage,
      allowFrom: [],
      roomsConfig: undefined,
      mentionRegexes: [],
      groupPolicy: "open",
      replyToMode: "first",
      threadReplies: "inbound",
      dmEnabled: true,
      dmPolicy: "open",
      textLimit: 4000,
      mediaMaxBytes: 5 * 1024 * 1024,
      startupMs: Date.now(),
      startupGraceMs: 60_000,
      directTracker: {
        isDirectMessage: vi.fn().mockResolvedValue(false),
      },
      getRoomInfo: vi.fn().mockResolvedValue({
        name: "Dev Room",
        canonicalAlias: "#dev:matrix.example.org",
        altAliases: [],
      }),
      getMemberDisplayName: vi.fn().mockResolvedValue("Bu"),
      accountId: undefined,
    });

    const event = {
      type: EventType.RoomMessage,
      event_id: "$event1",
      sender: "@bu:matrix.example.org",
      origin_server_ts: Date.now(),
      content: {
        msgtype: "m.text",
        body: "show me my commits",
        "m.mentions": { user_ids: ["@bot:matrix.example.org"] },
        "m.relates_to": {
          rel_type: "m.thread",
          event_id: "$thread-root",
        },
      },
    } as unknown as MatrixRawEvent;

    await handler("!room:example.org", event);

    expect(formatInboundEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        chatType: "channel",
        senderLabel: "Bu (bu)",
      }),
    );
    expect(recordInboundSession).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: expect.objectContaining({
          ChatType: "thread",
          BodyForAgent: "Bu (bu): show me my commits",
        }),
      }),
    );
  });

  it("uses room-scoped session keys for DM rooms matched via parentPeer binding", () => {
    const buildAgentSessionKey = vi
      .fn()
      .mockReturnValue("agent:main:matrix:channel:!dmroom:example.org");

    const resolved = resolveMatrixBaseRouteSession({
      buildAgentSessionKey,
      baseRoute: {
        agentId: "main",
        sessionKey: "agent:main:main",
        mainSessionKey: "agent:main:main",
        matchedBy: "binding.peer.parent",
      },
      isDirectMessage: true,
      roomId: "!dmroom:example.org",
      accountId: undefined,
    });

    expect(buildAgentSessionKey).toHaveBeenCalledWith({
      agentId: "main",
      channel: "matrix",
      accountId: undefined,
      peer: { kind: "channel", id: "!dmroom:example.org" },
    });
    expect(resolved).toEqual({
      sessionKey: "agent:main:matrix:channel:!dmroom:example.org",
      lastRoutePolicy: "session",
    });
  });

  it("does not override DMs to groups for explicit allow:false room config", () => {
    expect(
      shouldOverrideMatrixDmToGroup({
        isDirectMessage: true,
        roomConfigInfo: {
          config: { allow: false },
          allowed: false,
          matchSource: "direct",
        },
      }),
    ).toBe(false);
  });
});
