import { describe, expect, it } from "vitest";
import {
  enqueueSystemEventSpy,
  getLoadConfigMock,
  getOnHandler,
  onSpy,
} from "./bot.create-telegram-bot.test-harness.js";
import { createTelegramBot } from "./bot.js";

/**
 * #3001 gap A — named-account group isolation on the REACTION surface.
 *
 * NECROPSY. Before the fix, the reaction handler resolved its target session with the bare
 * `resolveAgentRoute()`, which fails OPEN to `fallback.legacyRoute` on a policy drop and never
 * applied the named-account group gate the inbound MESSAGE path
 * enforces (`shouldDropNamedAccountGroupMessage`, #2961 scenario C). A reaction added in a
 * named-account group matched only via the operator catch-all — a non-`binding.*` tier —
 * therefore routed a "reaction added" system event into the first agent's session: the same
 * cross-account isolation loss #2961 closed on the message path.
 *
 * The first case is DISCRIMINATING: the catch-all supplies a route (`alpha`), so a scenario-D
 * null-drop cannot account for the isolation — only the named-account gate can, and the
 * pre-fix reaction path did not apply it, so it enqueued the event and this case FAILED. The
 * reaction-auth layer does not save it: `TELEGRAM_EVENT_AUTH_RULES.reaction` sets
 * `enforceGroupAllowlistAuthorization: false`, so an open group passes the auth layer and the
 * drop must come from the named-account gate. The two controls pin the gate to named accounts
 * (not the default account) and to non-binding tiers (an explicit binding still delivers).
 */

const GROUP_CHAT_ID = -1001234567890;
const GROUP_PEER_ID = String(GROUP_CHAT_ID);

const loadConfig = getLoadConfigMock();

/** Two agents (no sole-agent promotion) + a catch-all: the route RESOLVES on a non-binding tier. */
const catchAllCfg = {
  agents: { list: [{ id: "alpha" }, { id: "beta" }] },
  routing: { unmatched: { agent: "alpha" } },
  channels: { telegram: { dmPolicy: "open", allowFrom: ["*"], reactionNotifications: "all" } },
  messages: { groupChat: { mentionPatterns: [] } },
};

/** Same, PLUS an explicit binding of the named account's group -> a `binding.*` tier. */
const boundNamedAccountCfg = {
  ...catchAllCfg,
  bindings: [
    {
      agentId: "beta",
      match: { channel: "telegram", accountId: "work", peer: { kind: "group", id: GROUP_PEER_ID } },
    },
  ],
};

function groupReaction() {
  return {
    chat: { id: GROUP_CHAT_ID, type: "supergroup", title: "Test Group" },
    message_id: 42,
    user: { id: 7, first_name: "Alice", username: "alice" },
    date: 1_700_000_000,
    old_reaction: [],
    new_reaction: [{ type: "emoji", emoji: "👍" }],
  };
}

async function fireGroupReaction(params: { cfg: unknown; accountId?: string }) {
  onSpy.mockClear();
  enqueueSystemEventSpy.mockClear();
  loadConfig.mockReturnValue(params.cfg);
  createTelegramBot({ token: "tok", accountId: params.accountId });
  const handler = getOnHandler("message_reaction") as (
    ctx: Record<string, unknown>,
  ) => Promise<void>;
  await handler({ update: { update_id: 900 }, messageReaction: groupReaction() });
}

describe("#3001 reaction surface — named-account group isolation", () => {
  it("drops a named-account group reaction that only matched via the catch-all", async () => {
    // DISCRIMINATING necropsy: the route resolves (catch-all -> alpha, `unmatched.catchAll`),
    // so scenario-D does NOT apply — only the named-account gate drops it. FAILS pre-fix.
    await fireGroupReaction({ cfg: catchAllCfg, accountId: "work" });

    expect(enqueueSystemEventSpy).not.toHaveBeenCalled();
  });

  it("delivers the same catch-all group reaction for the default account", async () => {
    // Control: pins the gate to NAMED accounts only. Also the canary that the open group
    // passes the reaction-auth layer, so the discriminating drop above is the gate, not auth.
    await fireGroupReaction({ cfg: catchAllCfg, accountId: "default" });

    expect(enqueueSystemEventSpy).toHaveBeenCalledTimes(1);
  });

  it("delivers a named-account group reaction that matched an explicit binding", async () => {
    // Control: pins the gate to NON-binding tiers — an operator who binds the named account's
    // group explicitly still gets their reaction traffic.
    await fireGroupReaction({ cfg: boundNamedAccountCfg, accountId: "work" });

    expect(enqueueSystemEventSpy).toHaveBeenCalledTimes(1);
  });
});
