import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { resolveAuthProfileOrder } from "./order.js";
import type { AuthProfileStore } from "./types.js";
import { isProfileInCooldown } from "./usage.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ANTHROPIC_STORE: AuthProfileStore = {
  version: 1,
  profiles: {
    "anthropic:default": {
      type: "api_key",
      provider: "anthropic",
      key: "sk-default",
    },
    "anthropic:work": {
      type: "api_key",
      provider: "anthropic",
      key: "sk-work",
    },
  },
};

const ANTHROPIC_CFG: RemoteClawConfig = {
  auth: {
    profiles: {
      "anthropic:default": { provider: "anthropic", mode: "api_key" },
      "anthropic:work": { provider: "anthropic", mode: "api_key" },
    },
  },
};

// ---------------------------------------------------------------------------
// resolveAuthProfileOrder — basic ordering
// ---------------------------------------------------------------------------

describe("resolveAuthProfileOrder", () => {
  const store = ANTHROPIC_STORE;
  const cfg = ANTHROPIC_CFG;

  function resolveWithAnthropicOrderAndUsage(params: {
    orderSource: "store" | "config";
    usageStats: NonNullable<AuthProfileStore["usageStats"]>;
  }) {
    const configuredOrder = { anthropic: ["anthropic:default", "anthropic:work"] };
    return resolveAuthProfileOrder({
      cfg:
        params.orderSource === "config"
          ? {
              auth: {
                order: configuredOrder,
                profiles: cfg.auth?.profiles,
              },
            }
          : undefined,
      store:
        params.orderSource === "store"
          ? { ...store, order: configuredOrder, usageStats: params.usageStats }
          : { ...store, usageStats: params.usageStats },
      provider: "anthropic",
    });
  }

  it("does not prioritize lastGood over round-robin ordering", () => {
    const order = resolveAuthProfileOrder({
      cfg,
      store: {
        ...store,
        lastGood: { anthropic: "anthropic:work" },
        usageStats: {
          "anthropic:default": { lastUsed: 100 },
          "anthropic:work": { lastUsed: 200 },
        },
      },
      provider: "anthropic",
    });
    expect(order[0]).toBe("anthropic:default");
  });

  it("uses explicit profiles when order is missing", () => {
    const order = resolveAuthProfileOrder({
      cfg,
      store,
      provider: "anthropic",
    });
    expect(order).toEqual(["anthropic:default", "anthropic:work"]);
  });

  it("uses configured order when provided", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          order: { anthropic: ["anthropic:work", "anthropic:default"] },
          profiles: cfg.auth?.profiles,
        },
      },
      store,
      provider: "anthropic",
    });
    expect(order).toEqual(["anthropic:work", "anthropic:default"]);
  });

  it("prefers store order over config order", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          order: { anthropic: ["anthropic:default", "anthropic:work"] },
          profiles: cfg.auth?.profiles,
        },
      },
      store: {
        ...store,
        order: { anthropic: ["anthropic:work", "anthropic:default"] },
      },
      provider: "anthropic",
    });
    expect(order).toEqual(["anthropic:work", "anthropic:default"]);
  });

  it.each(["store", "config"] as const)(
    "pushes cooldown profiles to the end even with %s order",
    (orderSource) => {
      const now = Date.now();
      const order = resolveWithAnthropicOrderAndUsage({
        orderSource,
        usageStats: {
          "anthropic:default": { cooldownUntil: now + 60_000 },
          "anthropic:work": { lastUsed: 1 },
        },
      });
      expect(order).toEqual(["anthropic:work", "anthropic:default"]);
    },
  );

  it.each(["store", "config"] as const)(
    "pushes disabled profiles to the end even with %s order",
    (orderSource) => {
      const now = Date.now();
      const order = resolveWithAnthropicOrderAndUsage({
        orderSource,
        usageStats: {
          "anthropic:default": {
            disabledUntil: now + 60_000,
            disabledReason: "billing",
          },
          "anthropic:work": { lastUsed: 1 },
        },
      });
      expect(order).toEqual(["anthropic:work", "anthropic:default"]);
    },
  );

  it.each(["store", "config"] as const)(
    "keeps OpenRouter explicit order even when cooldown fields exist (%s)",
    (orderSource) => {
      const now = Date.now();
      const explicitOrder = ["openrouter:default", "openrouter:work"];
      const order = resolveAuthProfileOrder({
        cfg:
          orderSource === "config"
            ? {
                auth: {
                  order: { openrouter: explicitOrder },
                },
              }
            : undefined,
        store: {
          version: 1,
          ...(orderSource === "store" ? { order: { openrouter: explicitOrder } } : {}),
          profiles: {
            "openrouter:default": {
              type: "api_key",
              provider: "openrouter",
              key: "sk-or-default",
            },
            "openrouter:work": {
              type: "api_key",
              provider: "openrouter",
              key: "sk-or-work",
            },
          },
          usageStats: {
            "openrouter:default": {
              cooldownUntil: now + 60_000,
              disabledUntil: now + 120_000,
              disabledReason: "billing",
            },
          },
        },
        provider: "openrouter",
      });

      expect(order).toEqual(explicitOrder);
    },
  );
});

// ---------------------------------------------------------------------------
// resolveAuthProfileOrder — stored profiles fallback
// ---------------------------------------------------------------------------

describe("resolveAuthProfileOrder — stored profiles", () => {
  const store = ANTHROPIC_STORE;
  const cfg = ANTHROPIC_CFG;

  it("uses stored profiles when no config exists", () => {
    const order = resolveAuthProfileOrder({
      store,
      provider: "anthropic",
    });
    expect(order).toEqual(["anthropic:default", "anthropic:work"]);
  });

  it("prioritizes preferred profiles", () => {
    const order = resolveAuthProfileOrder({
      cfg,
      store,
      provider: "anthropic",
      preferredProfile: "anthropic:work",
    });
    expect(order[0]).toBe("anthropic:work");
    expect(order).toContain("anthropic:default");
  });

  it("drops explicit order entries that are missing from the store", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          order: {
            minimax: ["minimax:default", "minimax:prod"],
          },
        },
      },
      store: {
        version: 1,
        profiles: {
          "minimax:prod": {
            type: "api_key",
            provider: "minimax",
            key: "sk-prod",
          },
        },
      },
      provider: "minimax",
    });
    expect(order).toEqual(["minimax:prod"]);
  });

  it("falls back to stored provider profiles when config profile ids drift", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          profiles: {
            "openai-codex:default": {
              provider: "openai-codex",
              mode: "token",
            },
          },
          order: {
            "openai-codex": ["openai-codex:default"],
          },
        },
      },
      store: {
        version: 1,
        profiles: {
          "openai-codex:user@example.com": {
            type: "token",
            provider: "openai-codex",
            token: "access-token",
            expires: Date.now() + 60_000,
          },
        },
      },
      provider: "openai-codex",
    });
    expect(order).toEqual(["openai-codex:user@example.com"]);
  });

  it("does not bypass explicit ids when the configured profile exists but is invalid", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          profiles: {
            "openai-codex:default": {
              provider: "openai-codex",
              mode: "token",
            },
          },
          order: {
            "openai-codex": ["openai-codex:default"],
          },
        },
      },
      store: {
        version: 1,
        profiles: {
          "openai-codex:default": {
            type: "token",
            provider: "openai-codex",
            token: "expired-token",
            expires: Date.now() - 1_000,
          },
          "openai-codex:user@example.com": {
            type: "token",
            provider: "openai-codex",
            token: "access-token",
            expires: Date.now() + 60_000,
          },
        },
      },
      provider: "openai-codex",
    });
    expect(order).toEqual([]);
  });

  it("drops explicit order entries that belong to another provider", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          order: {
            minimax: ["openai:default", "minimax:prod"],
          },
        },
      },
      store: {
        version: 1,
        profiles: {
          "openai:default": {
            type: "api_key",
            provider: "openai",
            key: "sk-openai",
          },
          "minimax:prod": {
            type: "api_key",
            provider: "minimax",
            key: "sk-mini",
          },
        },
      },
      provider: "minimax",
    });
    expect(order).toEqual(["minimax:prod"]);
  });

  it.each([
    {
      caseName: "drops token profiles with empty credentials",
      profile: {
        type: "token" as const,
        provider: "minimax" as const,
        token: "   ",
      },
    },
    {
      caseName: "drops token profiles that are already expired",
      profile: {
        type: "token" as const,
        provider: "minimax" as const,
        token: "sk-minimax",
        expires: Date.now() - 1000,
      },
    },
  ])("$caseName", ({ profile }) => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          order: {
            minimax: ["minimax:default"],
          },
        },
      },
      store: {
        version: 1,
        profiles: {
          "minimax:default": profile,
        },
      },
      provider: "minimax",
    });
    expect(order).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveAuthProfileOrder — lastUsed ordering
// ---------------------------------------------------------------------------

describe("resolveAuthProfileOrder — lastUsed ordering", () => {
  it("orders by lastUsed when no explicit order exists", () => {
    const order = resolveAuthProfileOrder({
      store: {
        version: 1,
        profiles: {
          "anthropic:a": {
            type: "token",
            provider: "anthropic",
            token: "access-token",
            expires: Date.now() + 60_000,
          },
          "anthropic:b": {
            type: "api_key",
            provider: "anthropic",
            key: "sk-b",
          },
          "anthropic:c": {
            type: "api_key",
            provider: "anthropic",
            key: "sk-c",
          },
        },
        usageStats: {
          "anthropic:a": { lastUsed: 200 },
          "anthropic:b": { lastUsed: 100 },
          "anthropic:c": { lastUsed: 300 },
        },
      },
      provider: "anthropic",
    });
    // token type has higher priority, then sorted by lastUsed within type
    expect(order).toEqual(["anthropic:a", "anthropic:b", "anthropic:c"]);
  });

  it("pushes cooldown profiles to the end, ordered by cooldown expiry", () => {
    const now = Date.now();
    const order = resolveAuthProfileOrder({
      store: {
        version: 1,
        profiles: {
          "anthropic:ready": {
            type: "api_key",
            provider: "anthropic",
            key: "sk-ready",
          },
          "anthropic:cool1": {
            type: "token",
            provider: "anthropic",
            token: "access-token",
            expires: now + 60_000,
          },
          "anthropic:cool2": {
            type: "api_key",
            provider: "anthropic",
            key: "sk-cool",
          },
        },
        usageStats: {
          "anthropic:ready": { lastUsed: 50 },
          "anthropic:cool1": { cooldownUntil: now + 5_000 },
          "anthropic:cool2": { cooldownUntil: now + 1_000 },
        },
      },
      provider: "anthropic",
    });
    expect(order).toEqual(["anthropic:ready", "anthropic:cool2", "anthropic:cool1"]);
  });
});

// ---------------------------------------------------------------------------
// resolveAuthProfileOrder — alias normalization
// ---------------------------------------------------------------------------

describe("resolveAuthProfileOrder — alias normalization", () => {
  function makeApiKeyStore(provider: string, profileIds: string[]): AuthProfileStore {
    return {
      version: 1,
      profiles: Object.fromEntries(
        profileIds.map((profileId) => [
          profileId,
          {
            type: "api_key" as const,
            provider,
            key: profileId.endsWith(":work") ? "sk-work" : "sk-default",
          },
        ]),
      ),
    };
  }

  function makeApiKeyProfilesByProvider(
    providerByProfileId: Record<string, string>,
  ): Record<string, { provider: string; mode: "api_key" }> {
    return Object.fromEntries(
      Object.entries(providerByProfileId).map(([profileId, provider]) => [
        profileId,
        { provider, mode: "api_key" as const },
      ]),
    );
  }

  it("normalizes provider casing in auth.order keys", () => {
    const order = resolveAuthProfileOrder({
      cfg: {
        auth: {
          order: { OpenAI: ["openai:work", "openai:default"] },
          profiles: makeApiKeyProfilesByProvider({
            "openai:default": "openai",
            "openai:work": "openai",
          }),
        },
      },
      store: makeApiKeyStore("openai", ["openai:default", "openai:work"]),
      provider: "openai",
    });
    expect(order).toEqual(["openai:work", "openai:default"]);
  });
});

// ---------------------------------------------------------------------------
// resolveAuthProfileOrder — cooldown auto-expiry
// ---------------------------------------------------------------------------

describe("resolveAuthProfileOrder — cooldown auto-expiry", () => {
  function makeStoreWithProfiles(): AuthProfileStore {
    return {
      version: 1,
      profiles: {
        "anthropic:default": { type: "api_key", provider: "anthropic", key: "sk-1" },
        "anthropic:secondary": { type: "api_key", provider: "anthropic", key: "sk-2" },
        "openai:default": { type: "api_key", provider: "openai", key: "sk-oi" },
      },
      usageStats: {},
    };
  }

  it("places profile with expired cooldown in available list (round-robin path)", () => {
    const store = makeStoreWithProfiles();
    store.usageStats = {
      "anthropic:default": {
        cooldownUntil: Date.now() - 10_000,
        errorCount: 4,
        failureCounts: { rate_limit: 4 },
        lastFailureAt: Date.now() - 70_000,
      },
    };

    const order = resolveAuthProfileOrder({ store, provider: "anthropic" });

    expect(order).toContain("anthropic:default");
    expect(isProfileInCooldown(store, "anthropic:default")).toBe(false);
    expect(store.usageStats?.["anthropic:default"]?.errorCount).toBe(0);
    expect(store.usageStats?.["anthropic:default"]?.cooldownUntil).toBeUndefined();
  });

  it("places profile with expired cooldown in available list (explicit-order path)", () => {
    const store = makeStoreWithProfiles();
    store.order = { anthropic: ["anthropic:secondary", "anthropic:default"] };
    store.usageStats = {
      "anthropic:default": {
        cooldownUntil: Date.now() - 5_000,
        errorCount: 3,
      },
    };

    const order = resolveAuthProfileOrder({ store, provider: "anthropic" });

    expect(order[0]).toBe("anthropic:secondary");
    expect(order).toContain("anthropic:default");
    expect(store.usageStats?.["anthropic:default"]?.cooldownUntil).toBeUndefined();
    expect(store.usageStats?.["anthropic:default"]?.errorCount).toBe(0);
  });

  it("keeps profile with active cooldown in cooldown list", () => {
    const futureMs = Date.now() + 300_000;
    const store = makeStoreWithProfiles();
    store.usageStats = {
      "anthropic:default": {
        cooldownUntil: futureMs,
        errorCount: 3,
      },
    };

    const order = resolveAuthProfileOrder({ store, provider: "anthropic" });

    expect(order).toContain("anthropic:default");
    expect(isProfileInCooldown(store, "anthropic:default")).toBe(true);
    expect(store.usageStats?.["anthropic:default"]?.errorCount).toBe(3);
  });

  it("expired cooldown resets error count — prevents escalation on next failure", () => {
    const store = makeStoreWithProfiles();
    store.usageStats = {
      "anthropic:default": {
        cooldownUntil: Date.now() - 1_000,
        errorCount: 4,
        failureCounts: { rate_limit: 4 },
        lastFailureAt: Date.now() - 3_700_000,
      },
    };

    resolveAuthProfileOrder({ store, provider: "anthropic" });

    expect(store.usageStats?.["anthropic:default"]?.errorCount).toBe(0);
    expect(store.usageStats?.["anthropic:default"]?.failureCounts).toBeUndefined();
  });

  it("mixed active and expired cooldowns across profiles", () => {
    const store = makeStoreWithProfiles();
    store.usageStats = {
      "anthropic:default": {
        cooldownUntil: Date.now() - 1_000,
        errorCount: 3,
      },
      "anthropic:secondary": {
        cooldownUntil: Date.now() + 300_000,
        errorCount: 2,
      },
    };

    const order = resolveAuthProfileOrder({ store, provider: "anthropic" });

    expect(store.usageStats?.["anthropic:default"]?.cooldownUntil).toBeUndefined();
    expect(store.usageStats?.["anthropic:default"]?.errorCount).toBe(0);

    expect(store.usageStats?.["anthropic:secondary"]?.cooldownUntil).toBeGreaterThan(Date.now());
    expect(store.usageStats?.["anthropic:secondary"]?.errorCount).toBe(2);

    expect(order[0]).toBe("anthropic:default");
  });

  it("does not affect profiles from other providers", () => {
    const store = makeStoreWithProfiles();
    store.usageStats = {
      "anthropic:default": {
        cooldownUntil: Date.now() - 1_000,
        errorCount: 4,
      },
      "openai:default": {
        cooldownUntil: Date.now() - 1_000,
        errorCount: 3,
      },
    };

    // Resolve only anthropic
    resolveAuthProfileOrder({ store, provider: "anthropic" });

    // Both should be cleared since clearExpiredCooldowns sweeps all profiles
    // in the store — this is intentional for correctness.
    expect(store.usageStats?.["anthropic:default"]?.errorCount).toBe(0);
    expect(store.usageStats?.["openai:default"]?.errorCount).toBe(0);
  });
});
