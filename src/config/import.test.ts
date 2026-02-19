import { describe, expect, it } from "vitest";
import { importConfig } from "./import.js";
import type { ImportResult } from "./import.js";

function findImported(result: ImportResult, key: string) {
  return result.imported.find((s) => s.key === key);
}

function findDropped(result: ImportResult, key: string) {
  return result.dropped.find((s) => s.key === key);
}

describe("importConfig", () => {
  describe("section partitioning", () => {
    it("imports known sections", () => {
      const source = {
        channels: { telegram: { enabled: true } },
        agents: { list: [{ id: "main" }] },
        gateway: { port: 18789 },
      };
      const result = importConfig(source, null, "overwrite");

      expect(result.config).toHaveProperty("channels");
      expect(result.config).toHaveProperty("agents");
      expect(result.config).toHaveProperty("gateway");
      expect(result.imported).toHaveLength(3);
    });

    it("drops skills with reason", () => {
      const source = { skills: { load: {} } };
      const result = importConfig(source, null, "overwrite");

      expect(result.config).not.toHaveProperty("skills");
      const dropped = findDropped(result, "skills");
      expect(dropped).toBeDefined();
      expect(dropped?.reason).toContain("~/.claude/");
    });

    it("drops plugins with reason", () => {
      const source = { plugins: { enabled: true } };
      const result = importConfig(source, null, "overwrite");

      expect(result.config).not.toHaveProperty("plugins");
      expect(findDropped(result, "plugins")?.reason).toContain("marketplace removed");
    });

    it("drops models with reason", () => {
      const source = { models: { defaults: {} } };
      const result = importConfig(source, null, "overwrite");

      expect(result.config).not.toHaveProperty("models");
      expect(findDropped(result, "models")?.reason).toContain("agents.defaults.model");
    });

    it("drops wizard with reason", () => {
      const source = { wizard: { lastRunAt: "2024-01-01" } };
      const result = importConfig(source, null, "overwrite");

      expect(result.config).not.toHaveProperty("wizard");
      expect(findDropped(result, "wizard")?.reason).toContain("Session-specific");
    });

    it("drops update with reason", () => {
      const source = { update: { channel: "stable" } };
      const result = importConfig(source, null, "overwrite");

      expect(result.config).not.toHaveProperty("update");
      expect(findDropped(result, "update")?.reason).toContain("update channel");
    });

    it("drops unknown sections", () => {
      const source = { unknownThing: { foo: 1 } };
      const result = importConfig(source, null, "overwrite");

      expect(result.config).not.toHaveProperty("unknownThing");
      const dropped = findDropped(result, "unknownThing");
      expect(dropped?.reason).toContain("Unknown section");
    });

    it("excludes $schema and meta", () => {
      const source = {
        $schema: "https://example.com/schema.json",
        meta: { lastTouchedVersion: "1.0.0" },
        channels: { telegram: {} },
      };
      const result = importConfig(source, null, "overwrite");

      expect(result.config).not.toHaveProperty("$schema");
      expect(result.config).not.toHaveProperty("meta");
      expect(result.config).toHaveProperty("channels");
      // $schema and meta should not appear in imported or dropped lists
      expect(findImported(result, "$schema")).toBeUndefined();
      expect(findDropped(result, "$schema")).toBeUndefined();
      expect(findImported(result, "meta")).toBeUndefined();
      expect(findDropped(result, "meta")).toBeUndefined();
    });

    it("imports all supported sections", () => {
      const allImportable = [
        "auth",
        "env",
        "diagnostics",
        "logging",
        "browser",
        "ui",
        "nodeHost",
        "agents",
        "tools",
        "bindings",
        "broadcast",
        "audio",
        "media",
        "messages",
        "commands",
        "approvals",
        "session",
        "web",
        "channels",
        "cron",
        "hooks",
        "discovery",
        "canvasHost",
        "talk",
        "gateway",
        "memory",
      ];
      const source: Record<string, unknown> = {};
      for (const key of allImportable) {
        source[key] = { enabled: true };
      }

      const result = importConfig(source, null, "overwrite");

      for (const key of allImportable) {
        expect(result.config).toHaveProperty(key);
      }
      expect(result.imported).toHaveLength(allImportable.length);
      expect(result.dropped).toHaveLength(0);
    });
  });

  describe("mode: overwrite", () => {
    it("uses only imported config, ignores existing", () => {
      const source = { channels: { telegram: {} } };
      const existing = { channels: { discord: {} }, agents: { list: [] } };
      const result = importConfig(source, existing, "overwrite");

      expect(result.config.channels).toEqual({ telegram: {} });
      expect(result.config).not.toHaveProperty("agents");
    });
  });

  describe("mode: error", () => {
    it("behaves like overwrite in the pure function", () => {
      const source = { channels: { telegram: {} } };
      const result = importConfig(source, null, "error");

      expect(result.config.channels).toEqual({ telegram: {} });
    });
  });

  describe("mode: merge", () => {
    it("existing values win on conflict", () => {
      const source = {
        gateway: { port: 18789, auth: { token: "old-token" } },
      };
      const existing = {
        gateway: { port: 9999, auth: { token: "existing-token" } },
      };
      const result = importConfig(source, existing, "merge");

      const gw = result.config.gateway as Record<string, unknown>;
      expect(gw.port).toBe(9999);
      expect((gw.auth as Record<string, unknown>).token).toBe("existing-token");
    });

    it("preserves existing sections not in source", () => {
      const source = { channels: { telegram: {} } };
      const existing = { agents: { list: [{ id: "default" }] } };
      const result = importConfig(source, existing, "merge");

      expect(result.config).toHaveProperty("channels");
      expect(result.config).toHaveProperty("agents");
    });

    it("imports source sections not in existing", () => {
      const source = { hooks: { enabled: true } };
      const existing = { channels: { discord: {} } };
      const result = importConfig(source, existing, "merge");

      expect(result.config).toHaveProperty("hooks");
      expect(result.config).toHaveProperty("channels");
    });

    it("deep-merges nested objects", () => {
      const source = {
        gateway: { port: 18789, auth: { token: "src" } },
      };
      const existing = {
        gateway: { auth: { password: "existing-pw" } },
      };
      const result = importConfig(source, existing, "merge");

      const gw = result.config.gateway as Record<string, unknown>;
      // port comes from source (not present in existing.gateway)
      expect(gw.port).toBe(18789);
      // auth is deep-merged; existing wins on token, password from existing
      const auth = gw.auth as Record<string, unknown>;
      expect(auth.password).toBe("existing-pw");
      // token from source since existing.gateway.auth has no token
      expect(auth.token).toBe("src");
    });

    it("skips meta from existing during merge", () => {
      const source = { channels: { telegram: {} } };
      const existing = { meta: { lastTouchedVersion: "1.0" }, channels: { discord: {} } };
      const result = importConfig(source, existing, "merge");

      expect(result.config).not.toHaveProperty("meta");
    });

    it("handles null existing as overwrite", () => {
      const source = { channels: { telegram: {} } };
      const result = importConfig(source, null, "merge");

      expect(result.config.channels).toEqual({ telegram: {} });
    });
  });

  describe("source isolation", () => {
    it("does not mutate the source object", () => {
      const source = { channels: { telegram: { enabled: true } } };
      const sourceJson = JSON.stringify(source);
      importConfig(source, null, "overwrite");
      expect(JSON.stringify(source)).toBe(sourceJson);
    });

    it("imported config is a deep clone", () => {
      const inner = { enabled: true };
      const source = { channels: { telegram: inner } };
      const result = importConfig(source, null, "overwrite");

      const imported = (result.config.channels as Record<string, unknown>).telegram;
      expect(imported).not.toBe(inner);
      expect(imported).toEqual(inner);
    });
  });

  describe("session note", () => {
    it("always includes session migration note", () => {
      const result = importConfig({}, null, "overwrite");
      expect(result.sessionNote).toContain("Sessions not migrated");
      expect(result.sessionNote).toContain("channel history");
    });
  });

  describe("section summaries", () => {
    it("summarizes channels with adapter names", () => {
      const source = {
        channels: {
          telegram: { enabled: true },
          slack: { enabled: true },
          discord: { enabled: true },
        },
      };
      const result = importConfig(source, null, "overwrite");
      const section = findImported(result, "channels");
      expect(section?.summary).toContain("3 adapters");
      expect(section?.summary).toContain("telegram");
    });

    it("summarizes agents with count", () => {
      const source = { agents: { list: [{ id: "a" }, { id: "b" }] } };
      const result = importConfig(source, null, "overwrite");
      expect(findImported(result, "agents")?.summary).toBe("2 agents");
    });

    it("summarizes gateway with port and token", () => {
      const source = {
        gateway: { port: 18789, auth: { token: "secret" } },
      };
      const result = importConfig(source, null, "overwrite");
      const summary = findImported(result, "gateway")?.summary ?? "";
      expect(summary).toContain("port 18789");
      expect(summary).toContain("token ******");
      expect(summary).not.toContain("secret");
    });

    it("summarizes hooks with mapping count", () => {
      const source = { hooks: { mappings: [{ path: "/a" }, { path: "/b" }] } };
      const result = importConfig(source, null, "overwrite");
      expect(findImported(result, "hooks")?.summary).toBe("2 hooks");
    });

    it("summarizes generic section with key count", () => {
      const source = { auth: { profiles: {}, order: {} } };
      const result = importConfig(source, null, "overwrite");
      expect(findImported(result, "auth")?.summary).toBe("2 keys");
    });
  });

  describe("mixed scenario", () => {
    it("handles a realistic full import", () => {
      const source = {
        $schema: "https://example.com",
        meta: { lastTouchedVersion: "1.0.0" },
        channels: { telegram: {}, slack: {} },
        agents: { list: [{ id: "main" }] },
        gateway: { port: 18789 },
        skills: { load: {} },
        plugins: { enabled: true },
        models: { defaults: {} },
        wizard: { lastRunAt: "2024" },
        update: { channel: "stable" },
        session: { scope: "per-sender" },
        hooks: { enabled: true },
        cron: { enabled: true },
        memory: { enabled: true },
        customExtension: { foo: true },
      };

      const result = importConfig(source, null, "overwrite");

      // Imported
      expect(result.imported.map((s) => s.key).toSorted()).toEqual([
        "agents",
        "channels",
        "cron",
        "gateway",
        "hooks",
        "memory",
        "session",
      ]);

      // Dropped with reasons
      expect(result.dropped.map((s) => s.key).toSorted()).toEqual([
        "customExtension",
        "models",
        "plugins",
        "skills",
        "update",
        "wizard",
      ]);

      // Config has only imported keys
      expect(Object.keys(result.config).toSorted()).toEqual([
        "agents",
        "channels",
        "cron",
        "gateway",
        "hooks",
        "memory",
        "session",
      ]);
    });
  });
});
