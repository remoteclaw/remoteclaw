import { describe, expect, it, vi } from "vitest";
import { validateConfigObjectRaw } from "./validation.js";

vi.mock("../channels/plugins/legacy-config.js", () => ({
  collectChannelLegacyConfigRules: () => [],
}));

vi.mock("../plugins/doctor-contract-registry.js", () => ({
  collectRelevantDoctorPluginIds: () => [],
  listPluginDoctorLegacyConfigRules: () => [],
}));

vi.mock("../secrets/unsupported-surface-policy.js", async () => {
  const { isRecord } = await import("../utils.js");

  return {
    collectUnsupportedSecretRefConfigCandidates: (raw: unknown) => {
      if (!isRecord(raw)) {
        return [];
      }
      const candidates: Array<{ path: string; value: unknown }> = [];

      const hooks = isRecord(raw.hooks) ? raw.hooks : null;
      if (hooks) {
        candidates.push({ path: "hooks.token", value: hooks.token });
      }

      const channels = isRecord(raw.channels) ? raw.channels : null;
      const discord = channels && isRecord(channels.discord) ? channels.discord : null;
      const threadBindings =
        discord && isRecord(discord.threadBindings) ? discord.threadBindings : null;
      if (threadBindings) {
        candidates.push({
          path: "channels.discord.threadBindings.webhookToken",
          value: threadBindings.webhookToken,
        });
      }

      return candidates;
    },
  };
});

// NOTE (RemoteClaw fork): upstream's SecretRef "unsupported surface" / "legacy
// secretref-env marker" config-validation policy is NOT adopted in this fork — its
// dependency modules (src/secrets/unsupported-surface-policy.ts,
// src/secrets/legacy-secretref-env-marker.ts, and the generated
// bundled-channel-config-metadata) were not ported and cascade to further absent
// modules. The five policy-guidance tests below are skipped pending a dedicated
// feature port (keep-layer follow-up FU-12). The two baseline validateConfigObjectRaw
// tests remain active.
describe("config validation SecretRef policy guards", () => {
  it.skip("surfaces a policy error for hooks.token SecretRef objects", () => {
    const result = validateConfigObjectRaw({
      hooks: {
        token: {
          source: "env",
          provider: "default",
          id: "HOOK_TOKEN",
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((entry) => entry.path === "hooks.token");
      expect(issue).toBeDefined();
      expect(issue?.message).toContain("SecretRef objects are not supported at hooks.token");
      expect(issue?.message).toContain(
        "https://docs.remoteclaw.org/reference/secretref-credential-surface",
      );
      expect(
        result.issues.some(
          (entry) =>
            entry.path === "hooks.token" &&
            entry.message.includes("Invalid input: expected string, received object"),
        ),
      ).toBe(false);
    }
  });

  it("keeps standard schema errors for non-SecretRef objects", () => {
    const result = validateConfigObjectRaw({
      hooks: {
        token: {
          unexpected: "value",
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((entry) => entry.path === "hooks.token");
      expect(issue).toBeDefined();
      expect(issue?.message).toBe("Invalid input: expected string, received object");
    }
  });

  it("allows env-template strings on unsupported mutable paths", () => {
    const result = validateConfigObjectRaw({
      hooks: {
        token: "${HOOK_TOKEN}",
      },
    });

    expect(result.ok).toBe(true);
  });

  it.skip("rejects legacy secretref-env markers on supported SecretRef credential paths", () => {
    const result = validateConfigObjectRaw({
      secrets: {
        defaults: {
          env: "gateway-env",
        },
      },
      channels: {
        discord: {
          token: "secretref-env:DISCORD_BOT_TOKEN",
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((entry) => entry.path === "channels.discord.token");
      expect(issue).toBeDefined();
      expect(issue?.message).toContain(
        '"secretref-env:DISCORD_BOT_TOKEN" is a legacy SecretRef marker',
      );
      expect(issue?.message).toContain(
        '{"source":"env","provider":"gateway-env","id":"DISCORD_BOT_TOKEN"}',
      );
      expect(issue?.message).toContain('Run "remoteclaw doctor --fix"');
    }
  });

  it.skip("rejects invalid legacy secretref-env markers that doctor cannot migrate", () => {
    const result = validateConfigObjectRaw({
      channels: {
        discord: {
          token: "secretref-env:not-valid",
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const issue = result.issues.find((entry) => entry.path === "channels.discord.token");
      expect(issue?.message).toContain('"secretref-env:not-valid" is a legacy SecretRef marker');
      expect(issue?.message).toContain('{"source":"env","provider":"default","id":"ENV_VAR"}');
    }
  });

  it.skip("replaces derived unrecognized-key errors with policy guidance for discord thread binding webhookToken", () => {
    const result = validateConfigObjectRaw({
      channels: {
        discord: {
          threadBindings: {
            webhookToken: {
              source: "env",
              provider: "default",
              id: "DISCORD_THREAD_BINDING_WEBHOOK_TOKEN",
            },
          },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      const policyIssue = result.issues.find(
        (entry) => entry.path === "channels.discord.threadBindings.webhookToken",
      );
      expect(policyIssue).toBeDefined();
      expect(policyIssue?.message).toContain(
        "SecretRef objects are not supported at channels.discord.threadBindings.webhookToken",
      );
      expect(
        result.issues.some(
          (entry) =>
            entry.path === "channels.discord.threadBindings" &&
            entry.message.includes('Unrecognized key: "webhookToken"'),
        ),
      ).toBe(false);
    }
  });

  it.skip("preserves unrelated unknown-key errors when policy and typos coexist", () => {
    const result = validateConfigObjectRaw({
      channels: {
        discord: {
          threadBindings: {
            webhookToken: {
              source: "env",
              provider: "default",
              id: "DISCORD_THREAD_BINDING_WEBHOOK_TOKEN",
            },
            webhookTokne: "typo",
          },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (entry) =>
            entry.path === "channels.discord.threadBindings.webhookToken" &&
            entry.message.includes("SecretRef objects are not supported"),
        ),
      ).toBe(true);
      expect(
        result.issues.some(
          (entry) =>
            entry.path === "channels.discord.threadBindings" &&
            entry.message.includes("webhookTokne"),
        ),
      ).toBe(true);
    }
  });
});
