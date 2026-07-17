import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recordInboundSessionMock = vi.fn().mockResolvedValue(undefined);
// Mock path repaired (#2961): "../channels/session.js" predates the src/telegram/ ->
// extensions/telegram/src/ move and resolved to a module that does not exist, so
// recordInboundSession was never actually mocked here.
vi.mock("../../../src/channels/session.js", () => ({
  recordInboundSession: (...args: unknown[]) => recordInboundSessionMock(...args),
}));

let buildTelegramMessageContextForTest: typeof import("./bot-message-context.test-harness.js").buildTelegramMessageContextForTest;
let clearRuntimeConfigSnapshot: typeof import("../../../src/config/config.js").clearRuntimeConfigSnapshot;

/**
 * No `agents.list`, no bindings: nothing matches, so `routing.unmatched` drops (its
 * default action). This is the fixture the upstream "named-account DM fallback" cases
 * were written against, back when an unmatched route silently landed on a phantom
 * "default" agent.
 */
const unmatchedCfg = {
  agents: { defaults: { model: "anthropic/claude-opus-4-5", workspace: "/tmp/remoteclaw" } },
  channels: { telegram: {} },
  messages: { groupChat: { mentionPatterns: [] } },
};

/**
 * Exactly one configured agent, so sole-agent promotion resolves the route
 * (`matchedBy: "fallback.soleAgent"`) — what an ordinary single-agent deployment does.
 */
const soleAgentCfg = {
  ...unmatchedCfg,
  agents: {
    list: [{ id: "main" }],
    defaults: { model: "anthropic/claude-opus-4-5", workspace: "/tmp/remoteclaw" },
  },
};

function buildNamedAccountDmMessage(messageId = 1) {
  return {
    message_id: messageId,
    chat: { id: 814912386, type: "private" as const },
    date: 1700000000 + messageId - 1,
    text: "hello",
    from: { id: 814912386, first_name: "Alice" },
  };
}

describe("buildTelegramMessageContext named-account routing", () => {
  afterEach(() => {
    clearRuntimeConfigSnapshot();
    recordInboundSessionMock.mockClear();
  });

  beforeEach(async () => {
    vi.resetModules();
    ({ clearRuntimeConfigSnapshot } = await import("../../../src/config/config.js"));
    ({ buildTelegramMessageContextForTest } =
      await import("./bot-message-context.test-harness.js"));
  });

  // Fork inversion of the upstream "allows DM through for a named account with no
  // explicit binding" case (see the skipped describe below). Upstream let this DM pass
  // through on the phantom "default" tier; this fork has no such tier, so the route is
  // unmatched and `routing.unmatched` drops it. Before #2961 the inbound path called the
  // bare resolveAgentRoute(), which swallowed that drop and fail-open delivered the DM
  // via `fallback.legacyRoute` — the vulnerability #2961 scenario D names.
  it("drops an unbound named-account DM when nothing matches (fail-closed)", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      cfg: unmatchedCfg,
      accountId: "atlas",
      message: buildNamedAccountDmMessage(),
    });

    expect(ctx).toBeNull();
  });

  it("still drops named-account group messages without an explicit binding", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      cfg: unmatchedCfg,
      accountId: "atlas",
      options: { forceWasMentioned: true },
      resolveGroupActivation: () => true,
      message: {
        message_id: 1,
        chat: { id: -1001234567890, type: "supergroup", title: "Test Group" },
        date: 1700000000,
        text: "@bot hello",
        from: { id: 814912386, first_name: "Alice" },
      },
    });

    expect(ctx).toBeNull();
  });

  // Guards the ordinary single-agent path against the #2961 drop: a resolvable route must
  // still be delivered, and DMs must still collapse onto the main session key.
  it("does not change the default-account DM session key", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      cfg: soleAgentCfg,
      message: {
        message_id: 1,
        chat: { id: 42, type: "private" },
        date: 1700000000,
        text: "hello",
        from: { id: 42, first_name: "Alice" },
      },
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.matchedBy).toBe("fallback.soleAgent");
    expect(ctx?.ctxPayload?.SessionKey).toBe("agent:main:main");
  });

  // The named-account gate is scoped to GROUP traffic (#2961 scenario C), so a
  // named-account DM on a resolvable route is delivered, not dropped.
  it("delivers a named-account DM when the route resolves", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      cfg: soleAgentCfg,
      accountId: "atlas",
      message: buildNamedAccountDmMessage(),
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.accountId).toBe("atlas");
  });
});

/**
 * GUT-PINNED (#2961) — these cases encode UPSTREAM semantics this fork deliberately removed.
 *
 * They assert that an unbound named-account DM passes through on `matchedBy: "default"`
 * and receives a per-account DM fallback session key
 * (`agent:main:telegram:atlas:direct:<peer>`). Both halves are unreachable here:
 *
 *  1. The "default" tier does not exist. `MatchedByTier` (src/routing/resolve-route.ts)
 *     enumerates only `binding.*`, `fallback.soleAgent`, `fallback.legacyRoute` and
 *     `unmatched.catchAll`. The fork deleted the phantom default-agent fallback and
 *     replaced it with sole-agent promotion — the comment on that promotion in
 *     resolve-route.ts is explicit that it exists "without reintroducing the phantom
 *     'default' agent fallback", and test/default-agent-elimination.test.ts pins that
 *     contract. Pre-fix these cases observed `fallback.legacyRoute` (the fail-open
 *     #2961 removes), never `default`.
 *  2. The per-account DM key requires `session.dmScope: "per-account-channel-peer"`.
 *     Under the default `dmScope: "main"`, buildAgentPeerSessionKey collapses every DM
 *     to `agent:<id>:main` regardless of account, so no fork tier can produce
 *     `agent:main:telegram:atlas:direct:...` from this fixture.
 *
 * The fork's posture is drop-by-default: an unbound named-account DM is DROPPED
 * (fail-closed), which the live "drops an unbound named-account DM" case above pins.
 * Do NOT un-skip these — re-adding the behavior they describe would reintroduce exactly
 * the phantom-default fallback the fork removed. They are kept, rather than deleted, as a
 * greppable record of the upstream/fork divergence.
 */
describe.skip("upstream named-account DM fallback (removed in this fork)", () => {
  it("allows DM through for a named account with no explicit binding", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      cfg: unmatchedCfg,
      accountId: "atlas",
      message: buildNamedAccountDmMessage(),
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.matchedBy).toBe("default");
    expect(ctx?.route.accountId).toBe("atlas");
  });

  it("uses a per-account session key for named-account DMs", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      cfg: unmatchedCfg,
      accountId: "atlas",
      message: buildNamedAccountDmMessage(),
    });

    expect(ctx?.ctxPayload?.SessionKey).toBe("agent:main:telegram:atlas:direct:814912386");
  });

  it("keeps named-account fallback lastRoute on the isolated DM session", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      cfg: unmatchedCfg,
      accountId: "atlas",
      message: buildNamedAccountDmMessage(),
    });
    const updateLastRoute = (
      recordInboundSessionMock.mock.calls.at(-1)?.[0] as {
        updateLastRoute?: { sessionKey?: string };
      }
    )?.updateLastRoute;

    expect(ctx?.ctxPayload?.SessionKey).toBe("agent:main:telegram:atlas:direct:814912386");
    expect(updateLastRoute?.sessionKey).toBe("agent:main:telegram:atlas:direct:814912386");
  });

  it("isolates sessions between named accounts that share the default agent", async () => {
    const atlas = await buildTelegramMessageContextForTest({
      cfg: unmatchedCfg,
      accountId: "atlas",
      message: buildNamedAccountDmMessage(1),
    });
    const skynet = await buildTelegramMessageContextForTest({
      cfg: unmatchedCfg,
      accountId: "skynet",
      message: buildNamedAccountDmMessage(2),
    });

    expect(atlas?.ctxPayload?.SessionKey).toBe("agent:main:telegram:atlas:direct:814912386");
    expect(skynet?.ctxPayload?.SessionKey).toBe("agent:main:telegram:skynet:direct:814912386");
    expect(atlas?.ctxPayload?.SessionKey).not.toBe(skynet?.ctxPayload?.SessionKey);
  });

  it("keeps identity-linked peer canonicalization in the named-account fallback path", async () => {
    const cfg = {
      ...unmatchedCfg,
      session: { identityLinks: { "alice-shared": ["telegram:814912386"] } },
    };

    const ctx = await buildTelegramMessageContextForTest({
      cfg,
      accountId: "atlas",
      message: {
        message_id: 1,
        chat: { id: 999999999, type: "private" },
        date: 1700000000,
        text: "hello",
        from: { id: 814912386, first_name: "Alice" },
      },
    });

    expect(ctx?.ctxPayload?.SessionKey).toBe("agent:main:telegram:atlas:direct:alice-shared");
  });
});
