import { describe, expect, it } from "vitest";
import {
  getConfigValueAtPath,
  parseConfigPath,
  setConfigValueAtPath,
  unsetConfigValueAtPath,
} from "./config-paths.js";
import { migrateLegacyConfig, readConfigFileSnapshot, validateConfigObject } from "./config.js";
import {
  buildWebSearchProviderConfig,
  withTempHome,
  writeRemoteClawConfig,
} from "./test-helpers.js";
import { RemoteClawSchema } from "./zod-schema.js";

describe("$schema key in config (#14998)", () => {
  it("accepts config with $schema string", () => {
    const result = RemoteClawSchema.safeParse({
      $schema: "https://remoteclaw.org/config.json",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.$schema).toBe("https://remoteclaw.org/config.json");
    }
  });

  it("accepts config without $schema", () => {
    const result = RemoteClawSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects non-string $schema", () => {
    const result = RemoteClawSchema.safeParse({ $schema: 123 });
    expect(result.success).toBe(false);
  });
});

describe("plugins.slots.contextEngine", () => {
  it("accepts a contextEngine slot id", () => {
    const result = RemoteClawSchema.safeParse({
      plugins: {
        slots: {
          contextEngine: "my-context-engine",
        },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("ui.seamColor", () => {
  it("accepts hex colors", () => {
    const res = validateConfigObject({ ui: { seamColor: "#FF4500" } });
    expect(res.ok).toBe(true);
  });

  it("rejects non-hex colors", () => {
    const res = validateConfigObject({ ui: { seamColor: "lobster" } });
    expect(res.ok).toBe(false);
  });

  it("rejects invalid hex length", () => {
    const res = validateConfigObject({ ui: { seamColor: "#FF4500FF" } });
    expect(res.ok).toBe(false);
  });
});

describe("plugins.entries.*.hooks.allowPromptInjection", () => {
  it("accepts boolean values", () => {
    const result = RemoteClawSchema.safeParse({
      plugins: {
        entries: {
          "voice-call": {
            hooks: {
              allowPromptInjection: false,
            },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-boolean values", () => {
    const result = RemoteClawSchema.safeParse({
      plugins: {
        entries: {
          "voice-call": {
            hooks: {
              allowPromptInjection: "no",
            },
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });
});

describe("web search provider config", () => {
  it("accepts kimi provider and config", () => {
    const res = validateConfigObject(
      buildWebSearchProviderConfig({
        provider: "kimi",
        providerConfig: {
          apiKey: "test-key",
          baseUrl: "https://api.moonshot.ai/v1",
          model: "moonshot-v1-128k",
        },
      }),
    );

    expect(res.ok).toBe(true);
  });
});

describe("talk.voiceAliases", () => {
  it("accepts a string map of voice aliases", () => {
    const res = validateConfigObject({
      talk: {
        voiceAliases: {
          Clawd: "EXAVITQu4vr4xnSDxMaL",
          Roger: "CwhRBWXzGAHq8TQ4Fs17",
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects non-string voice alias values", () => {
    const res = validateConfigObject({
      talk: {
        voiceAliases: {
          Clawd: 123,
        },
      },
    });
    expect(res.ok).toBe(false);
  });
});

describe("gateway.remote.transport", () => {
  it("accepts direct transport", () => {
    const res = validateConfigObject({
      gateway: {
        remote: {
          transport: "direct",
          url: "wss://gateway.example.ts.net",
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects unknown transport", () => {
    const res = validateConfigObject({
      gateway: {
        remote: {
          transport: "udp",
        },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("gateway.remote.transport");
    }
  });
});

describe("gateway.tools config", () => {
  it("accepts gateway.tools allow and deny lists", () => {
    const res = validateConfigObject({
      gateway: {
        tools: {
          allow: ["gateway"],
          deny: ["sessions_spawn", "sessions_send"],
        },
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects invalid gateway.tools values", () => {
    const res = validateConfigObject({
      gateway: {
        tools: {
          allow: "gateway",
        },
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("gateway.tools.allow");
    }
  });
});

describe("gateway.channelHealthCheckMinutes", () => {
  it("accepts zero to disable monitor", () => {
    const res = validateConfigObject({
      gateway: {
        channelHealthCheckMinutes: 0,
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects negative intervals", () => {
    const res = validateConfigObject({
      gateway: {
        channelHealthCheckMinutes: -1,
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.issues[0]?.path).toBe("gateway.channelHealthCheckMinutes");
    }
  });
});

describe("cron webhook schema", () => {
  it("accepts cron.webhookToken and legacy cron.webhook", () => {
    const res = RemoteClawSchema.safeParse({
      cron: {
        enabled: true,
        webhook: "https://example.invalid/legacy-cron-webhook",
        webhookToken: "secret-token",
      },
    });

    expect(res.success).toBe(true);
  });

  it("accepts cron.webhookToken SecretRef values", () => {
    const res = RemoteClawSchema.safeParse({
      cron: {
        webhook: "https://example.invalid/legacy-cron-webhook",
        webhookToken: {
          source: "env",
          provider: "default",
          id: "CRON_WEBHOOK_TOKEN",
        },
      },
    });

    expect(res.success).toBe(true);
  });

  it("rejects non-http cron.webhook URLs", () => {
    const res = RemoteClawSchema.safeParse({
      cron: {
        webhook: "ftp://example.invalid/legacy-cron-webhook",
      },
    });

    expect(res.success).toBe(false);
  });

  it("accepts cron.retry config", () => {
    const res = RemoteClawSchema.safeParse({
      cron: {
        retry: {
          maxAttempts: 5,
          backoffMs: [60000, 120000, 300000],
          retryOn: ["rate_limit", "overloaded", "network"],
        },
      },
    });
    expect(res.success).toBe(true);
  });
});

describe("broadcast", () => {
  it("accepts a broadcast peer map with strategy", () => {
    const res = validateConfigObject({
      agents: {
        list: [
          { id: "alfred", workspace: "/tmp/alfred" },
          { id: "baerbel", workspace: "/tmp/baerbel" },
        ],
      },
      broadcast: {
        strategy: "parallel",
        "120363403215116621@g.us": ["alfred", "baerbel"],
      },
    });
    expect(res.ok).toBe(true);
  });

  it("rejects invalid broadcast strategy", () => {
    const res = validateConfigObject({
      broadcast: { strategy: "nope" },
    });
    expect(res.ok).toBe(false);
  });

  it("rejects non-array broadcast entries", () => {
    const res = validateConfigObject({
      broadcast: { "120363403215116621@g.us": 123 },
    });
    expect(res.ok).toBe(false);
  });
});

describe("agents.defaults.embeddedPi legacy field (#2479)", () => {
  // The Pi orchestrator was replaced by AgentRuntime; the config stub was removed.
  // These tests guard the rule+migration channel that lets pre-gut configs still load.
  it("flags agents.defaults.embeddedPi as a legacy issue", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {
        agents: {
          list: [{ id: "pi" }],
          defaults: { embeddedPi: { projectSettingsPolicy: "sanitize" } },
        },
      });

      const snap = await readConfigFileSnapshot();

      expect(snap.legacyIssues.some((i) => i.path === "agents.defaults.embeddedPi")).toBe(true);
    });
  });

  it("auto-migration strips agents.defaults.embeddedPi and the migrated config validates", () => {
    const res = migrateLegacyConfig({
      agents: {
        list: [{ id: "pi", workspace: "/tmp/pi" }],
        defaults: { embeddedPi: { projectSettingsPolicy: "sanitize" } },
      },
    });

    expect(res.changes).toContain(
      "Stripped obsolete agents.defaults.embeddedPi field — the Pi orchestrator was replaced by AgentRuntime.",
    );
    expect(res.config).not.toBeNull();
    expect(
      (res.config?.agents?.defaults as { embeddedPi?: unknown } | undefined)?.embeddedPi,
    ).toBeUndefined();
  });
});

describe("thinking-level legacy fields (#2480)", () => {
  // The thinkingLevel/thinkingDefault/subagents.thinking input pipeline was removed;
  // CLI runtimes own reasoning depth. These tests guard the rule+migration channel
  // that lets pre-gut configs still load (strict zod schemas would otherwise reject
  // unknown keys).
  it("flags agents.defaults.thinkingDefault and agents.defaults.subagents.thinking as legacy issues", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {
        agents: {
          list: [{ id: "ops" }],
          defaults: {
            thinkingDefault: "high",
            subagents: { thinking: "medium" },
          },
        },
      });

      const snap = await readConfigFileSnapshot();
      const paths = snap.legacyIssues.map((i) => i.path);
      expect(paths).toContain("agents.defaults.thinkingDefault");
      expect(paths).toContain("agents.defaults.subagents.thinking");
    });
  });

  it("auto-migration strips top-level and subagents thinking fields", () => {
    const res = migrateLegacyConfig({
      agents: {
        list: [
          {
            id: "ops",
            workspace: "/tmp/ops",
            subagents: { thinking: "low" },
          },
        ],
        defaults: {
          thinkingDefault: "high",
          subagents: { thinking: "medium" },
        },
      },
    });

    expect(res.changes).toContain(
      "Stripped obsolete agents.defaults.thinkingDefault field — CLI runtimes own reasoning depth.",
    );
    expect(res.changes).toContain(
      "Stripped obsolete agents.defaults.subagents.thinking field — CLI runtimes own reasoning depth.",
    );
    expect(res.changes).toContain(
      "Stripped obsolete agents.list[].subagents.thinking field(s) — CLI runtimes own reasoning depth.",
    );
    expect(res.config).not.toBeNull();
    const defaults = res.config?.agents?.defaults as
      | { thinkingDefault?: unknown; subagents?: { thinking?: unknown } }
      | undefined;
    expect(defaults?.thinkingDefault).toBeUndefined();
    expect(defaults?.subagents?.thinking).toBeUndefined();
    const list = res.config?.agents?.list as
      | Array<{ subagents?: { thinking?: unknown } }>
      | undefined;
    expect(list?.[0]?.subagents?.thinking).toBeUndefined();
  });

  it("auto-migration strips hooks.mappings[].thinking", () => {
    const res = migrateLegacyConfig({
      agents: { list: [{ id: "ops", workspace: "/tmp/ops" }] },
      hooks: {
        mappings: [{ id: "m1", match: { path: "/x" }, action: "wake", thinking: "high" }],
      },
    });

    expect(res.changes).toContain(
      "Stripped obsolete hooks.mappings[].thinking field(s) — CLI runtimes own reasoning depth.",
    );
    expect(res.config).not.toBeNull();
    const mappings = (res.config?.hooks as { mappings?: Array<{ thinking?: unknown }> } | undefined)
      ?.mappings;
    expect(mappings?.[0]?.thinking).toBeUndefined();
  });
});

describe("agent params bag legacy fields (#2481)", () => {
  // Per-agent and per-model params bags were placeholders for LLM request
  // parameters (temperature, cacheRetention, etc.) that the middleware never
  // read — CLI runtimes own those knobs. These tests guard the rule+migration
  // channel that lets pre-gut configs still load (strict zod schemas would
  // otherwise reject unknown keys).
  it("flags agents.list[].params and agents.defaults.models[<id>].params as legacy issues", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {
        agents: {
          list: [{ id: "ops", params: { temperature: 0.7 } }],
          defaults: {
            models: {
              "gpt-4o": { alias: "gpt4o", params: { thinking: "medium" } },
            },
          },
        },
      });

      const snap = await readConfigFileSnapshot();
      const paths = snap.legacyIssues.map((i) => i.path);
      expect(paths).toContain("agents.list");
      expect(paths).toContain("agents.defaults.models");
    });
  });

  it("auto-migration strips per-agent and per-model params fields", () => {
    const res = migrateLegacyConfig({
      agents: {
        list: [
          {
            id: "ops",
            workspace: "/tmp/ops",
            params: { temperature: 0.7, cacheRetention: "5m" },
          },
        ],
        defaults: {
          models: {
            "gpt-4o": { alias: "gpt4o", params: { thinking: "medium" } },
            "claude-4-5": { params: { reasoning: "high" } },
          },
        },
      },
    });

    expect(res.changes).toContain(
      "Stripped obsolete agents.list[].params field(s) — LLM request parameters are the CLI runtime's concern.",
    );
    expect(res.changes).toContain(
      "Stripped obsolete agents.defaults.models[<id>].params field(s) — LLM request parameters are the CLI runtime's concern.",
    );
    expect(res.config).not.toBeNull();
    const list = res.config?.agents?.list as Array<{ params?: unknown }> | undefined;
    expect(list?.[0]?.params).toBeUndefined();
    const models = (
      res.config?.agents?.defaults as { models?: Record<string, { params?: unknown }> }
    )?.models;
    expect(models?.["gpt-4o"]?.params).toBeUndefined();
    expect(models?.["claude-4-5"]?.params).toBeUndefined();
  });
});

describe("config paths", () => {
  it("rejects empty and blocked paths", () => {
    expect(parseConfigPath("")).toEqual({
      ok: false,
      error: "Invalid path. Use dot notation (e.g. foo.bar).",
    });
    expect(parseConfigPath("__proto__.polluted").ok).toBe(false);
    expect(parseConfigPath("constructor.polluted").ok).toBe(false);
    expect(parseConfigPath("prototype.polluted").ok).toBe(false);
  });

  it("sets, gets, and unsets nested values", () => {
    const root: Record<string, unknown> = {};
    const parsed = parseConfigPath("foo.bar");
    if (!parsed.ok || !parsed.path) {
      throw new Error("path parse failed");
    }
    setConfigValueAtPath(root, parsed.path, 123);
    expect(getConfigValueAtPath(root, parsed.path)).toBe(123);
    expect(unsetConfigValueAtPath(root, parsed.path)).toBe(true);
    expect(getConfigValueAtPath(root, parsed.path)).toBeUndefined();
  });
});

describe("config strict validation", () => {
  it("rejects unknown fields", async () => {
    const res = validateConfigObject({
      agents: { list: [{ id: "pi" }] },
      customUnknownField: { nested: "value" },
    });
    expect(res.ok).toBe(false);
  });

  it("flags legacy config entries without auto-migrating", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {
        agents: { list: [{ id: "pi" }] },
        routing: { allowFrom: ["+15555550123"] },
      });

      const snap = await readConfigFileSnapshot();

      expect(snap.valid).toBe(false);
      expect(snap.legacyIssues).not.toHaveLength(0);
    });
  });

  it("does not mark resolved-only gateway.bind aliases as auto-migratable legacy", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {
        gateway: { bind: "${REMOTECLAW_BIND}" },
      });

      const prev = process.env.REMOTECLAW_BIND;
      process.env.REMOTECLAW_BIND = "0.0.0.0";
      try {
        const snap = await readConfigFileSnapshot();
        expect(snap.valid).toBe(false);
        expect(snap.legacyIssues).toHaveLength(0);
        expect(snap.issues.some((issue) => issue.path === "gateway.bind")).toBe(true);
      } finally {
        if (prev === undefined) {
          delete process.env.REMOTECLAW_BIND;
        } else {
          process.env.REMOTECLAW_BIND = prev;
        }
      }
    });
  });

  it("still marks literal gateway.bind host aliases as legacy", async () => {
    await withTempHome(async (home) => {
      await writeRemoteClawConfig(home, {
        gateway: { bind: "0.0.0.0" },
      });

      const snap = await readConfigFileSnapshot();
      expect(snap.valid).toBe(false);
      expect(snap.legacyIssues.some((issue) => issue.path === "gateway.bind")).toBe(true);
    });
  });
});

describe("gutted LLM-platform fields are rejected (#2489)", () => {
  it("rejects top-level memory backend config", () => {
    const result = RemoteClawSchema.safeParse({
      memory: { backend: "builtin" },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /Unrecognized key.*memory/.test(i.message))).toBe(
        true,
      );
    }
  });

  it("rejects agents.defaults.memorySearch", () => {
    const result = RemoteClawSchema.safeParse({
      agents: {
        list: [{ id: "main", workspace: "/tmp/main" }],
        defaults: {
          memorySearch: { provider: "mistral" },
        },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /Unrecognized key.*memorySearch/.test(i.message)),
      ).toBe(true);
    }
  });

  it("rejects per-agent memorySearch on agents.list[]", () => {
    const result = RemoteClawSchema.safeParse({
      agents: {
        list: [
          {
            id: "main",
            workspace: "/tmp/main",
            memorySearch: { provider: "openai" },
          },
        ],
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => /Unrecognized key.*memorySearch/.test(i.message)),
      ).toBe(true);
    }
  });

  it("rejects agents.defaults.pdfModel and pdf limits", () => {
    const result = RemoteClawSchema.safeParse({
      agents: {
        list: [{ id: "main", workspace: "/tmp/main" }],
        defaults: {
          pdfModel: { primary: "openai/gpt-5-mini" },
          pdfMaxBytesMb: 10,
          pdfMaxPages: 20,
        },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join("\n");
      expect(/Unrecognized key.*pdfModel/.test(messages)).toBe(true);
    }
  });

  it("rejects api and compat on a model definition", () => {
    const result = RemoteClawSchema.safeParse({
      models: {
        providers: {
          openai: {
            baseUrl: "https://api.openai.com",
            models: [
              {
                id: "gpt-4",
                name: "GPT-4",
                api: "openai-completions",
                compat: { supportsTools: true },
              },
            ],
          },
        },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join("\n");
      expect(/Unrecognized key.*(api|compat)/.test(messages)).toBe(true);
    }
  });

  it("rejects api on a model provider", () => {
    const result = RemoteClawSchema.safeParse({
      models: {
        providers: {
          openai: {
            baseUrl: "https://api.openai.com",
            api: "openai-completions",
            models: [],
          },
        },
      },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => /Unrecognized key.*api/.test(i.message))).toBe(true);
    }
  });
});
