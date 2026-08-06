import { describe, expect, it } from "vitest";
import { migrateLegacyConfig, readConfigFileSnapshot } from "./config.js";
import { applyLegacyMigrations } from "./legacy.js";
import { withTempHome, writeRemoteClawConfig } from "./test-helpers.js";
import { RemoteClawSchema } from "./zod-schema.js";

// The dead gateway.auth.trustedProxy.allowLoopback knob (#3131). It was declared in the TS
// type and the served JSON schema and documented as the way to run a same-host proxy, but no
// gateway code read it — authorizeTrustedProxy rejects loopback and Gateway-interface sources
// unconditionally. It was never in the zod schema, and the trustedProxy zod object is
// `.strict()`, so a persisted config carrying the key fails to load rather than being
// silently ignored.
//
// These tests drive the reachable repair path (readConfigFileSnapshot -> legacyIssues gate ->
// migrateLegacyConfig), not applyLegacyMigrations in isolation. Both repair call sites
// (src/gateway/server.impl.ts, src/commands/doctor-config-flow.ts) gate on
// snapshot.legacyIssues being non-empty, so a migration whose key has no LEGACY_CONFIG_RULES
// entry never runs. Asserting on legacyIssues is what pins that wiring.

const LEGACY_PATH = "gateway.auth.trustedProxy.allowLoopback";

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

describe("legacy migration: dead gateway.auth.trustedProxy.allowLoopback knob (#3131)", () => {
  it("strict schema rejects the legacy key (so the migration is required)", () => {
    // Both values fail — `.strict()` rejects on key presence, not on value. The documented
    // example used `false`, so even the conservative copy-paste failed to load.
    for (const value of [true, false]) {
      const result = RemoteClawSchema.safeParse(documentedExample(value));
      expect(result.success, `allowLoopback: ${value}`).toBe(false);
    }
  });

  it("a real config file carrying the key is reported as a legacy issue, not just invalid", async () => {
    // This is the gate input for both repair call sites. Without the LEGACY_CONFIG_RULES
    // entry this list is empty, the gate is false, and the migration never runs.
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, documentedExample(false));

      const snap = await readConfigFileSnapshot();

      expect(snap.legacyIssues.some((issue) => issue.path === LEGACY_PATH)).toBe(true);
      // The key also makes the file fail strict validation today, which is why the repair
      // has to happen before validation rather than being left to the operator.
      expect(snap.valid).toBe(false);
    });
  });

  it("the legacy-issue message names gateway.auth.password as the real alternative", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, documentedExample(true));

      const snap = await readConfigFileSnapshot();
      const issue = snap.legacyIssues.find((entry) => entry.path === LEGACY_PATH);

      expect(issue).toBeDefined();
      expect(issue?.message).toContain("gateway.auth.password");
    });
  });

  it("the server.impl.ts repair path strips the key and yields a loadable config", async () => {
    // Mirrors src/gateway/server.impl.ts: read snapshot, gate on legacyIssues, then migrate
    // snapshot.parsed and log the returned changes.
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, documentedExample(false));

      const snap = await readConfigFileSnapshot();
      expect(snap.legacyIssues.length).toBeGreaterThan(0);

      const { config: migrated, changes } = migrateLegacyConfig(snap.parsed);

      // config is non-null only when the migrated object passes full validation, so this
      // asserts the gateway would go on to start rather than throw.
      expect(migrated).not.toBeNull();
      expect(migrated?.gateway?.auth?.trustedProxy).toBeDefined();
      expect(
        Object.prototype.hasOwnProperty.call(
          migrated?.gateway?.auth?.trustedProxy ?? {},
          "allowLoopback",
        ),
      ).toBe(false);
      // Sibling keys survive untouched.
      expect(migrated?.gateway?.auth?.trustedProxy?.userHeader).toBe("x-forwarded-user");
      expect(migrated?.gateway?.auth?.trustedProxy?.allowUsers).toEqual([
        "nick@example.com",
        "admin@company.org",
      ]);
      expect(changes.some((entry) => entry.includes(LEGACY_PATH))).toBe(true);
      expect(changes.some((entry) => entry.includes("gateway.auth.password"))).toBe(true);
    });
  });

  it("migrated config then loads cleanly under the strict schema", () => {
    for (const value of [true, false]) {
      const { next } = applyLegacyMigrations(documentedExample(value));
      const result = RemoteClawSchema.safeParse(next);
      expect(result.success, `allowLoopback: ${value}`).toBe(true);
    }
  });

  it("a config without the key produces no legacy issue and no migration", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {
        gateway: {
          auth: { mode: "trusted-proxy", trustedProxy: { userHeader: "x-forwarded-user" } },
        },
      });

      const snap = await readConfigFileSnapshot();

      expect(snap.legacyIssues.some((issue) => issue.path === LEGACY_PATH)).toBe(false);
      const { next, changes } = applyLegacyMigrations(snap.parsed);
      expect(next).toBeNull();
      expect(changes.length).toBe(0);
    });
  });

  it("does not disturb unrelated trustedProxy-less gateway config", () => {
    const raw = { gateway: { bind: "loopback", auth: { mode: "token" } } };
    const { next, changes } = applyLegacyMigrations(raw);
    expect(next).toBeNull();
    expect(changes.length).toBe(0);
  });
});
