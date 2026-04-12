import { describe, expect, it } from "vitest";
import { findLegacyConfigIssues } from "./legacy.js";
import { applyLegacyMigrations } from "./legacy.js";
import { AgentEntrySchema } from "./zod-schema.agent-runtime.js";

describe("deprecated agents.list[].default field (#1581)", () => {
  describe("zod schema acceptance", () => {
    it("accepts agent entry with default: true without parse error", () => {
      const result = AgentEntrySchema.safeParse({
        id: "main",
        workspace: "/tmp/main",
        default: true,
      });
      expect(result.success).toBe(true);
    });

    it("accepts agent entry with default: false without parse error", () => {
      const result = AgentEntrySchema.safeParse({
        id: "main",
        workspace: "/tmp/main",
        default: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts agent entry without default field", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", workspace: "/tmp/main" });
      expect(result.success).toBe(true);
    });
  });

  describe("legacy rule detection", () => {
    it("detects default: true on agent list entries", () => {
      const raw = {
        agents: { list: [{ id: "main", default: true }] },
      };
      const issues = findLegacyConfigIssues(raw);
      expect(issues.length).toBe(1);
      expect(issues[0].path).toBe("agents.list");
      expect(issues[0].message).toContain("default");
    });

    it("does not flag agents.list without default field", () => {
      const raw = {
        agents: { list: [{ id: "main" }] },
      };
      const issues = findLegacyConfigIssues(raw);
      expect(issues.length).toBe(0);
    });

    it("does not flag agents.list with default: false", () => {
      const raw = {
        agents: { list: [{ id: "main", default: false }] },
      };
      const issues = findLegacyConfigIssues(raw);
      expect(issues.length).toBe(0);
    });

    it("detects default: true when only some entries have it", () => {
      const raw = {
        agents: {
          list: [{ id: "main", default: true }, { id: "helper" }],
        },
      };
      const issues = findLegacyConfigIssues(raw);
      expect(issues.length).toBe(1);
    });
  });

  describe("legacy migration", () => {
    it("strips default field from agent entries", () => {
      const raw = {
        agents: { list: [{ id: "main", default: true }] },
      };
      const { next, changes } = applyLegacyMigrations(raw);
      expect(next).not.toBeNull();
      expect(changes.length).toBe(1);
      expect(changes[0]).toContain("default");
      const list = (next as Record<string, unknown>).agents as Record<string, unknown>;
      const entries = list.list as Array<Record<string, unknown>>;
      expect(entries[0].default).toBeUndefined();
      expect(entries[0].id).toBe("main");
    });

    it("strips default from multiple entries", () => {
      const raw = {
        agents: {
          list: [
            { id: "main", default: true },
            { id: "helper", default: false },
          ],
        },
      };
      const { next, changes } = applyLegacyMigrations(raw);
      expect(next).not.toBeNull();
      expect(changes.length).toBe(1);
      const list = (next as Record<string, unknown>).agents as Record<string, unknown>;
      const entries = list.list as Array<Record<string, unknown>>;
      expect(entries[0].default).toBeUndefined();
      expect(entries[1].default).toBeUndefined();
    });

    it("returns null when no default field present", () => {
      const raw = {
        agents: { list: [{ id: "main" }] },
      };
      const { next, changes } = applyLegacyMigrations(raw);
      expect(next).toBeNull();
      expect(changes.length).toBe(0);
    });
  });
});
