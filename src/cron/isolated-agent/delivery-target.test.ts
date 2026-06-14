import { describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../../config/config.js";

vi.mock("../../config/sessions.js", () => ({
  loadSessionStore: vi.fn().mockReturnValue({}),
  resolveAgentMainSessionKey: vi.fn().mockReturnValue("agent:test:main"),
  resolveStorePath: vi.fn().mockReturnValue("/tmp/test-store.json"),
}));

vi.mock("../../infra/outbound/channel-selection.js", () => ({
  resolveMessageChannelSelection: vi
    .fn()
    .mockResolvedValue({ channel: "alpha", configured: ["alpha"] }),
}));

vi.mock("../../infra/outbound/target-resolver.js", () => ({
  maybeResolveIdLikeTarget: vi.fn(),
}));

vi.mock("../../pairing/pairing-store.js", () => ({
  readChannelAllowFromStoreSync: vi.fn(() => []),
}));

vi.mock("../../../extensions/whatsapp/src/accounts.js", () => ({
  resolveWhatsAppAccount: vi.fn(() => ({ allowFrom: [] })),
}));

import { resolveWhatsAppAccount } from "../../../extensions/whatsapp/src/accounts.js";
import { loadSessionStore } from "../../config/sessions.js";
import { resolveMessageChannelSelection } from "../../infra/outbound/channel-selection.js";
import { maybeResolveIdLikeTarget } from "../../infra/outbound/target-resolver.js";
import { readChannelAllowFromStoreSync } from "../../pairing/pairing-store.js";
import { resolveDeliveryTarget } from "./delivery-target.js";

function makeCfg(overrides?: Partial<RemoteClawConfig>): RemoteClawConfig {
  return {
    bindings: [],
    channels: {},
    ...overrides,
  } as RemoteClawConfig;
}

function makeForumBoundCfg(accountId = "account-b"): RemoteClawConfig {
  return makeCfg({
    bindings: [
      {
        agentId: AGENT_ID,
        match: { channel: "forum", accountId },
      },
    ],
  });
}

const AGENT_ID = "agent-b";
const DEFAULT_TARGET = {
  channel: "forum" as const,
  to: "room:default",
};

type SessionStore = ReturnType<typeof loadSessionStore>;

function setMainSessionEntry(entry?: SessionStore[string]) {
  const store = entry ? ({ "agent:test:main": entry } as SessionStore) : ({} as SessionStore);
  vi.mocked(loadSessionStore).mockReturnValue(store);
}

function setLastSessionEntry(params: {
  sessionId: string;
  lastChannel: string;
  lastTo: string;
  lastThreadId?: string;
  lastAccountId?: string;
}) {
  setMainSessionEntry({
    sessionId: params.sessionId,
    updatedAt: 1000,
    lastChannel: params.lastChannel,
    lastTo: params.lastTo,
    ...(params.lastThreadId ? { lastThreadId: params.lastThreadId } : {}),
    ...(params.lastAccountId ? { lastAccountId: params.lastAccountId } : {}),
  });
}

function setWhatsAppAllowFrom(allowFrom: string[]) {
  vi.mocked(resolveWhatsAppAccount).mockReturnValue({
    allowFrom,
  } as unknown as ReturnType<typeof resolveWhatsAppAccount>);
}

function setStoredWhatsAppAllowFrom(allowFrom: string[]) {
  vi.mocked(readChannelAllowFromStoreSync).mockReturnValue(allowFrom);
}

async function resolveForAgent(params: {
  cfg: RemoteClawConfig;
  target?: { channel?: "last" | "forum" | "alpha"; to?: string };
}) {
  const channel = params.target ? params.target.channel : DEFAULT_TARGET.channel;
  const to = params.target && "to" in params.target ? params.target.to : DEFAULT_TARGET.to;
  return resolveDeliveryTarget(params.cfg, AGENT_ID, {
    channel,
    to,
  });
}

async function resolveLastTarget(cfg: RemoteClawConfig) {
  return resolveForAgent({
    cfg,
    target: { channel: "last", to: undefined },
  });
}

describe("resolveDeliveryTarget", () => {
  it("reroutes implicit delivery to an authorized allowFrom recipient", async () => {
    setLastSessionEntry({
      sessionId: "sess-w1",
      lastChannel: "alpha",
      lastTo: "room-denied",
    });
    setWhatsAppAllowFrom([]);
    setStoredWhatsAppAllowFrom(["+15550000001"]);

    const cfg = makeCfg({ bindings: [] });
    const result = await resolveLastTarget(cfg);

    expect(result.channel).toBe("alpha");
    expect(result.to).toBe("room-allowed");
  });

  it("applies allowFrom rerouting to dry-run delivery previews", async () => {
    setLastSessionEntry({
      sessionId: "sess-preview",
      lastChannel: "alpha",
      lastTo: "room-denied",
    });
    setStoredAlphaAllowFrom(["room-allowed"]);

    const cfg = makeCfg({ bindings: [], channels: { alpha: { allowFrom: [] } } });
    const result = await resolveDeliveryTarget(
      cfg,
      AGENT_ID,
      {
        channel: "last",
        to: undefined,
      },
      { dryRun: true },
    );

    expect(result.channel).toBe("alpha");
    expect(result.to).toBe("room-allowed");
  });

  it("keeps explicit delivery target unchanged", async () => {
    setLastSessionEntry({
      sessionId: "sess-w2",
      lastChannel: "alpha",
      lastTo: "room-denied",
    });
    setWhatsAppAllowFrom([]);
    setStoredWhatsAppAllowFrom(["+15550000001"]);

    const cfg = makeCfg({ bindings: [] });
    const result = await resolveDeliveryTarget(cfg, AGENT_ID, {
      channel: "alpha",
      to: "room-denied",
    });

    expect(result.to).toBe("room-denied");
  });

  it("falls back to bound accountId when session has no lastAccountId", async () => {
    setMainSessionEntry(undefined);
    const cfg = makeForumBoundCfg();
    const result = await resolveForAgent({ cfg });

    expect(result.accountId).toBe("account-b");
  });

  it("preserves binding order when peerless delivery falls back to a bound accountId", async () => {
    setMainSessionEntry(undefined);
    const cfg = makeCfg({
      bindings: [
        {
          agentId: AGENT_ID,
          match: {
            channel: "forum",
            peer: { kind: "channel", id: "room:default" },
            accountId: "peer-first",
          },
        },
        {
          agentId: AGENT_ID,
          match: { channel: "forum", accountId: "channel-second" },
        },
      ],
    });

    const result = await resolveForAgent({ cfg });

    expect(result.accountId).toBe("peer-first");
  });

  it("does not infer scoped bound accountId for peerless cron delivery", async () => {
    setMainSessionEntry(undefined);
    const cfg = makeCfg({
      bindings: [
        {
          agentId: AGENT_ID,
          match: {
            channel: "forum",
            guildId: "guild-1",
            accountId: "tenant-account",
          },
        },
      ],
    });

    const result = await resolveForAgent({ cfg });

    expect(result.accountId).toBeUndefined();
  });

  it("preserves session lastAccountId when present", async () => {
    setMainSessionEntry({
      sessionId: "sess-1",
      updatedAt: 1000,
      lastChannel: "forum",
      lastTo: "room:default",
      lastAccountId: "session-account",
    });

    const cfg = makeForumBoundCfg();
    const result = await resolveForAgent({ cfg });

    // Session-derived accountId should take precedence over binding
    expect(result.accountId).toBe("session-account");
  });

  it("returns undefined accountId when no binding and no session", async () => {
    setMainSessionEntry(undefined);

    const cfg = makeCfg({ bindings: [] });

    const result = await resolveForAgent({ cfg });

    expect(result.accountId).toBeUndefined();
  });

  it("applies id-like target normalization before returning delivery targets", async () => {
    setMainSessionEntry(undefined);
    vi.mocked(maybeResolveIdLikeTarget).mockClear();
    vi.mocked(maybeResolveIdLikeTarget).mockResolvedValueOnce({
      to: "user:123456789",
      kind: "user",
      source: "directory",
    });

    const result = await resolveDeliveryTarget(makeCfg({ bindings: [] }), AGENT_ID, {
      channel: "forum",
      to: "123456789",
    });

    expect(result.ok).toBe(true);
    expect(result.to).toBe("user:123456789");
    expect(maybeResolveIdLikeTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "forum",
        input: "123456789",
      }),
    );
  });

  it("selects correct binding when multiple agents have bindings", async () => {
    setMainSessionEntry(undefined);

    const cfg = makeCfg({
      bindings: [
        {
          agentId: "agent-a",
          match: { channel: "forum", accountId: "account-a" },
        },
        {
          agentId: "agent-b",
          match: { channel: "forum", accountId: "account-b" },
        },
      ],
    });

    const result = await resolveForAgent({ cfg });

    expect(result.accountId).toBe("account-b");
  });

  it("ignores bindings for different channels", async () => {
    setMainSessionEntry(undefined);

    const cfg = makeCfg({
      bindings: [
        {
          agentId: "agent-b",
          match: { channel: "alpha", accountId: "alpha-account" },
        },
      ],
    });

    const result = await resolveForAgent({ cfg });

    expect(result.accountId).toBeUndefined();
  });

  it("drops session threadId when destination does not match the previous recipient", async () => {
    setLastSessionEntry({
      sessionId: "sess-2",
      lastChannel: "forum",
      lastTo: "room:other",
      lastThreadId: "thread-1",
    });

    const result = await resolveForAgent({ cfg: makeCfg({ bindings: [] }) });
    expect(result.threadId).toBeUndefined();
  });

  it("keeps session threadId when destination matches the previous recipient", async () => {
    setLastSessionEntry({
      sessionId: "sess-3",
      lastChannel: "forum",
      lastTo: "room:default",
      lastThreadId: "thread-2",
    });

    const result = await resolveForAgent({ cfg: makeCfg({ bindings: [] }) });
    expect(result.threadId).toBe("thread-2");
  });

  it("uses single configured channel when neither explicit nor session channel exists", async () => {
    setMainSessionEntry(undefined);

    const result = await resolveLastTarget(makeCfg({ bindings: [] }));
    expect(result.channel).toBe("alpha");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected unresolved delivery target");
    }
    // resolveOutboundTarget provides the standard missing-target error when
    // no explicit target, no session lastTo, and no plugin resolveDefaultTo.
    expect(result.error.message).toContain("requires target");
  });

  it("returns an error when channel selection is ambiguous", async () => {
    setMainSessionEntry(undefined);
    vi.mocked(resolveMessageChannelSelection).mockRejectedValueOnce(
      new Error("Channel is required when multiple channels are configured: alpha, forum"),
    );

    const result = await resolveLastTarget(makeCfg({ bindings: [] }));
    expect(result.channel).toBeUndefined();
    expect(result.to).toBeUndefined();
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected ambiguous channel selection error");
    }
    expect(result.error.message).toContain("Channel is required");
  });

  it("uses sessionKey thread entry before main session entry", async () => {
    vi.mocked(loadSessionStore).mockReturnValue({
      "agent:test:main": {
        sessionId: "main-session",
        updatedAt: 1000,
        lastChannel: "forum",
        lastTo: "main-chat",
      },
      "agent:test:thread:42": {
        sessionId: "thread-session",
        updatedAt: 2000,
        lastChannel: "forum",
        lastTo: "thread-chat",
      },
    } as SessionStore);

    const result = await resolveDeliveryTarget(makeCfg({ bindings: [] }), AGENT_ID, {
      channel: "last",
      sessionKey: "agent:test:thread:42",
      to: undefined,
    });

    expect(result.channel).toBe("forum");
    expect(result.to).toBe("thread-chat");
  });

  it("uses main session channel when channel=last and session route exists", async () => {
    setLastSessionEntry({
      sessionId: "sess-4",
      lastChannel: "forum",
      lastTo: "room:default",
    });

    const result = await resolveLastTarget(makeCfg({ bindings: [] }));

    expect(result.channel).toBe("forum");
    expect(result.to).toBe("room:default");
    expect(result.ok).toBe(true);
  });

  it("explicit delivery.accountId overrides session-derived accountId", async () => {
    setLastSessionEntry({
      sessionId: "sess-5",
      lastChannel: "forum",
      lastTo: "room:ops",
      lastAccountId: "default",
    });

    const result = await resolveDeliveryTarget(makeCfg({ bindings: [] }), AGENT_ID, {
      channel: "forum",
      to: "room:ops",
      accountId: "bot-b",
    });

    expect(result.ok).toBe(true);
    expect(result.accountId).toBe("bot-b");
  });

  it("explicit delivery.accountId overrides bindings-derived accountId", async () => {
    setMainSessionEntry(undefined);
    const cfg = makeCfg({
      bindings: [{ agentId: AGENT_ID, match: { channel: "forum", accountId: "bound" } }],
    });

    const result = await resolveDeliveryTarget(cfg, AGENT_ID, {
      channel: "forum",
      to: "room:ops",
      accountId: "explicit",
    });

    expect(result.ok).toBe(true);
    expect(result.accountId).toBe("explicit");
  });
});
