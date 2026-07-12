import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { normalizeCompatibilityConfigValues } from "./doctor-legacy-config.js";

// Regression coverage for remoteclaw/remoteclaw#2097 (security): the single→multi-account
// promotion (`seedMissingDefaultAccountsFromSingleAccountBase`) moved channel-top-level access
// policy into `accounts.default` but silently STRIPPED those shared defaults from existing named
// accounts. Because the top-level keys acted as inherited defaults, a stripped named account could
// flip from allowlist-gated to OPEN. The fix inherits the moved policy keys onto every named
// account that does not already define its own value. Adapted from upstream commit 7b461676072.
//
// NOTE: `src/commands/**` is currently excluded from every CI vitest lane (`vitest.unit.config.ts`
// excludes it, and no other config includes it), so this suite is verified locally rather than in
// CI. Colocated per repo convention; run it with:
//   node ./node_modules/vitest/vitest.mjs run --config vitest.config.ts src/commands/doctor-legacy-config.test.ts

type AccountsByChannel = Record<string, { accounts?: Record<string, unknown> }>;

const accountsOf = (
  config: RemoteClawConfig,
  channelId: string,
): Record<string, unknown> | undefined =>
  (config.channels as AccountsByChannel | undefined)?.[channelId]?.accounts;

describe("normalizeCompatibilityConfigValues — single-account promotion policy inheritance (#2097)", () => {
  it.each(["slack", "discord", "telegram", "signal"])(
    "preserves inherited %s access policy on existing named accounts when seeding accounts.default",
    (channelId) => {
      const res = normalizeCompatibilityConfigValues({
        channels: {
          [channelId]: {
            dmPolicy: "allowlist",
            allowFrom: ["sender-1"],
            groupPolicy: "allowlist",
            groupAllowFrom: ["group-sender-1"],
            accounts: {
              work: { enabled: true },
            },
          },
        },
      } as unknown as RemoteClawConfig);

      const accounts = accountsOf(res.config, channelId);

      // accounts.default still receives the moved values (existing behavior, unchanged).
      expect(accounts?.default).toEqual({
        dmPolicy: "allowlist",
        allowFrom: ["sender-1"],
        groupPolicy: "allowlist",
        groupAllowFrom: ["group-sender-1"],
      });
      // The regression: the existing named account must RETAIN the inherited policy, not lose it.
      expect(accounts?.work).toEqual({
        enabled: true,
        dmPolicy: "allowlist",
        allowFrom: ["sender-1"],
        groupPolicy: "allowlist",
        groupAllowFrom: ["group-sender-1"],
      });
      expect(res.changes).toContain(
        `Moved channels.${channelId} single-account top-level values into channels.${channelId}.accounts.default.`,
      );
    },
  );

  it("keeps a named account's own policy overrides while inheriting only the rest", () => {
    const res = normalizeCompatibilityConfigValues({
      channels: {
        discord: {
          dmPolicy: "allowlist",
          allowFrom: ["top-dm"],
          groupPolicy: "allowlist",
          groupAllowFrom: ["top-group"],
          accounts: {
            work: {
              token: "work-token",
              allowFrom: ["work-dm"],
              groupPolicy: "disabled",
            },
          },
        },
      },
    } as unknown as RemoteClawConfig);

    // allowFrom + groupPolicy are the account's own values (never clobbered); dmPolicy +
    // groupAllowFrom are inherited because the account did not define them.
    expect(accountsOf(res.config, "discord")?.work).toEqual({
      token: "work-token",
      dmPolicy: "allowlist",
      allowFrom: ["work-dm"],
      groupPolicy: "disabled",
      groupAllowFrom: ["top-group"],
    });
  });

  it("moves defaultTo into accounts.default but does NOT inherit it onto named accounts", () => {
    const res = normalizeCompatibilityConfigValues({
      channels: {
        slack: {
          defaultTo: "work",
          groupPolicy: "allowlist",
          groupAllowFrom: ["group-sender-1"],
          accounts: {
            work: { token: "work-token" },
          },
        },
      },
    } as unknown as RemoteClawConfig);

    const accounts = accountsOf(res.config, "slack");
    // accounts.default receives every moved key, including the routing default `defaultTo`.
    expect(accounts?.default).toEqual({
      defaultTo: "work",
      groupPolicy: "allowlist",
      groupAllowFrom: ["group-sender-1"],
    });
    // The named account inherits access-policy keys only — `defaultTo` is a routing default,
    // not an access policy, and must not be duplicated onto each account (caller-confirmed).
    expect(accounts?.work).toEqual({
      token: "work-token",
      groupPolicy: "allowlist",
      groupAllowFrom: ["group-sender-1"],
    });
  });

  it("preserves inherited policy across multiple named accounts, cloning object values independently", () => {
    const res = normalizeCompatibilityConfigValues({
      channels: {
        discord: {
          groupPolicy: "allowlist",
          groupAllowFrom: ["group-sender-1"],
          accounts: {
            work: { token: "work-token" },
            research: { token: "research-token" },
          },
        },
      },
    } as unknown as RemoteClawConfig);

    const accounts = accountsOf(res.config, "discord");
    expect(accounts?.work).toEqual({
      token: "work-token",
      groupPolicy: "allowlist",
      groupAllowFrom: ["group-sender-1"],
    });
    expect(accounts?.research).toEqual({
      token: "research-token",
      groupPolicy: "allowlist",
      groupAllowFrom: ["group-sender-1"],
    });
    // Inherited array values must be independent clones, not shared references across accounts.
    const work = accounts?.work as { groupAllowFrom: string[] };
    const research = accounts?.research as { groupAllowFrom: string[] };
    expect(work.groupAllowFrom).not.toBe(research.groupAllowFrom);
  });
});
