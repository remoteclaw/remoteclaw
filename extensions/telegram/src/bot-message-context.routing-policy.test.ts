import { afterEach, describe, expect, it } from "vitest";
import { clearRuntimeConfigSnapshot } from "../../../src/config/config.js";
import { buildTelegramMessageContextForTest } from "./bot-message-context.test-harness.js";

/**
 * Regression coverage for #2961 scenarios C and D on the INBOUND message path.
 *
 * Before the fix, `bot-message-context.ts` resolved routes with the bare
 * `resolveAgentRoute()`, which applies the `routing.unmatched` policy and then
 * *swallows* a drop verdict, falling back to the first configured agent tagged
 * `fallback.legacyRoute` (see the migration warning in src/routing/resolve-route.ts).
 * Every case below therefore FAILS against the pre-fix path: it delivered a context where
 * these assert `null`.
 *
 * The two drops are distinct and are pinned separately:
 *   - D fires when the route resolves to NOTHING (unmatched + no catch-all + no sole agent).
 *   - C fires when the route resolves FINE, but on a non-`binding.*` tier, for a
 *     named-account GROUP message. The catch-all fixtures below are what make C
 *     discriminating: the route is non-null there, so D cannot account for the drop.
 */

const GROUP_CHAT_ID = -1001234567890;
const GROUP_PEER_ID = String(GROUP_CHAT_ID);

const baseChannels = { telegram: { dmPolicy: "open", allowFrom: ["*"] } };
const baseMessages = { groupChat: { mentionPatterns: [] } };

/** Two agents (no sole-agent promotion), no bindings, no catch-all => unmatched => drop. */
const dropPolicyCfg = {
  agents: { list: [{ id: "alpha" }, { id: "beta" }] },
  channels: baseChannels,
  messages: baseMessages,
};

/** Same, but the drop policy is stated explicitly rather than relying on the default. */
const explicitRejectCfg = {
  ...dropPolicyCfg,
  routing: { unmatched: "reject" },
};

/** Nothing matches, but the operator designated a catch-all: the route RESOLVES. */
const catchAllCfg = {
  agents: { list: [{ id: "alpha" }, { id: "beta" }] },
  routing: { unmatched: { agent: "alpha" } },
  channels: baseChannels,
  messages: baseMessages,
};

/** A catch-all PLUS an explicit binding of the named account's group to an agent. */
const boundNamedAccountCfg = {
  ...catchAllCfg,
  bindings: [
    {
      agentId: "beta",
      match: { channel: "telegram", accountId: "work", peer: { kind: "group", id: GROUP_PEER_ID } },
    },
  ],
};

function groupMessage() {
  return {
    message_id: 1,
    chat: { id: GROUP_CHAT_ID, type: "supergroup" as const, title: "Test Group" },
    date: 1_700_000_000,
    text: "@bot hello",
    from: { id: 42, first_name: "Alice" },
  };
}

function dmMessage() {
  return {
    message_id: 1,
    chat: { id: 814912386, type: "private" as const },
    date: 1_700_000_000,
    text: "hello",
    from: { id: 814912386, first_name: "Alice" },
  };
}

async function buildGroupContext(params: { cfg: unknown; accountId?: string }) {
  return await buildTelegramMessageContextForTest({
    cfg: params.cfg as Record<string, unknown>,
    accountId: params.accountId,
    message: groupMessage(),
    options: { forceWasMentioned: true },
    resolveGroupActivation: () => true,
  });
}

afterEach(() => {
  clearRuntimeConfigSnapshot();
});

describe("#2961 scenario D — routing.unmatched drop policy on the inbound path", () => {
  it("drops an unmatched inbound group message when no catch-all is configured", async () => {
    const ctx = await buildGroupContext({ cfg: dropPolicyCfg });

    expect(ctx).toBeNull();
  });

  it("drops an unmatched inbound DM when no catch-all is configured", async () => {
    const ctx = await buildTelegramMessageContextForTest({
      cfg: dropPolicyCfg,
      message: dmMessage(),
    });

    expect(ctx).toBeNull();
  });

  it("drops an unmatched inbound message under an explicit reject policy", async () => {
    const ctx = await buildGroupContext({ cfg: explicitRejectCfg });

    expect(ctx).toBeNull();
  });

  it("delivers the message once an operator configures a catch-all", async () => {
    // Control: proves the drops above come from the policy, not from the resolver being
    // unable to route this message at all.
    const ctx = await buildGroupContext({ cfg: catchAllCfg });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.matchedBy).toBe("unmatched.catchAll");
    expect(ctx?.route.agentId).toBe("alpha");
  });
});

describe("#2961 scenario C — named-account group isolation", () => {
  it("drops a named-account group message that only matched via the catch-all", async () => {
    // DISCRIMINATING: the route resolves here (the catch-all supplies `alpha`), so the
    // scenario-D drop does NOT apply — the message is delivered under D and dropped only
    // by the named-account gate. The identical default-account case below is delivered.
    const ctx = await buildGroupContext({ cfg: catchAllCfg, accountId: "work" });

    expect(ctx).toBeNull();
  });

  it("delivers the same catch-all group message for the default account", async () => {
    // Control: pins the gate to NAMED accounts only.
    const ctx = await buildGroupContext({ cfg: catchAllCfg, accountId: "default" });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.matchedBy).toBe("unmatched.catchAll");
  });

  it("delivers a named-account group message that matched an explicit binding", async () => {
    // Control: pins that the gate drops only NON-binding tiers — an operator who binds
    // the named account's group explicitly still gets their traffic.
    const ctx = await buildGroupContext({ cfg: boundNamedAccountCfg, accountId: "work" });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.matchedBy).toBe("binding.peer");
    expect(ctx?.route.agentId).toBe("beta");
  });

  it("delivers a named-account DM that only matched via the catch-all", async () => {
    // Control: pins the gate to GROUP traffic — #2961 scopes the isolation boundary to
    // groups, so a named-account DM on a resolvable route is not gated.
    const ctx = await buildTelegramMessageContextForTest({
      cfg: catchAllCfg,
      accountId: "work",
      message: dmMessage(),
    });

    expect(ctx).not.toBeNull();
    expect(ctx?.route.matchedBy).toBe("unmatched.catchAll");
    expect(ctx?.route.accountId).toBe("work");
  });
});
