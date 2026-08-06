import { describe, expect, it } from "vitest";
import { applyLegacyMigrations } from "./legacy.js";
import { RemoteClawSchema } from "./zod-schema.js";

// The dead gateway.auth.trustedProxy.allowLoopback knob (#3128). It was declared in the TS
// type and the served JSON schema and documented as the way to run a same-host proxy, but no
// gateway code read it — authorizeTrustedProxy rejects loopback sources unconditionally. It
// was never in the zod schema, and the trustedProxy object is `.strict()`, so a persisted
// config carrying the key fails to load rather than being silently ignored.

/** The trusted-proxy config block exactly as docs/gateway/trusted-proxy-auth.md documented it. */
function documentedExample(allowLoopback: boolean): Record<string, unknown> {
  return {
    gateway: {
      bind: "lan",
      trustedProxies: ["10.0.0.1", "172.17.0.1"],
      auth: {
        mode: "trusted-proxy",
        trustedProxy: {
          userHeader: "x-forwarded-user",
          requiredHeaders: ["x-forwarded-proto", "x-forwarded-host"],
          allowUsers: ["nick@example.com", "admin@company.org"],
          allowLoopback,
        },
      },
    },
  };
}

describe("legacy migration: dead gateway.auth.trustedProxy.allowLoopback knob (#3128)", () => {
  it("strict schema rejects the legacy key (so the migration is required)", () => {
    // Both values fail — `.strict()` rejects on key presence, not on value. The documented
    // example used `false`, so even the conservative copy-paste failed to load.
    for (const value of [true, false]) {
      const result = RemoteClawSchema.safeParse(documentedExample(value));
      expect(result.success, `allowLoopback: ${value}`).toBe(false);
    }
  });

  it("strips the legacy key from raw config and records a change message", () => {
    const { next, changes } = applyLegacyMigrations(documentedExample(true));
    expect(next).not.toBeNull();
    const gateway = (next as Record<string, unknown>).gateway as Record<string, unknown>;
    const auth = gateway.auth as Record<string, unknown>;
    const trustedProxy = auth.trustedProxy as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(trustedProxy, "allowLoopback")).toBe(false);
    // Sibling keys survive untouched.
    expect(trustedProxy.userHeader).toBe("x-forwarded-user");
    expect(trustedProxy.allowUsers).toEqual(["nick@example.com", "admin@company.org"]);
    expect(changes.some((c) => c.includes("gateway.auth.trustedProxy.allowLoopback"))).toBe(true);
  });

  it("migrated config then loads cleanly under the strict schema", () => {
    for (const value of [true, false]) {
      const { next } = applyLegacyMigrations(documentedExample(value));
      const result = RemoteClawSchema.safeParse(next);
      expect(result.success, `allowLoopback: ${value}`).toBe(true);
    }
  });

  it("is a no-op when the legacy key is absent", () => {
    const raw = {
      gateway: {
        auth: { mode: "trusted-proxy", trustedProxy: { userHeader: "x-forwarded-user" } },
      },
    };
    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).toBeNull();
    expect(changes.length).toBe(0);
  });

  it("does not disturb unrelated trustedProxy-less gateway config", () => {
    const raw = { gateway: { bind: "loopback", auth: { mode: "token" } } };
    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).toBeNull();
    expect(changes.length).toBe(0);
  });
});
