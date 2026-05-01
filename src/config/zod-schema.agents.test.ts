import { describe, expect, it } from "vitest";
import { RemoteClawSchema } from "./zod-schema.js";

describe("agents schema — regression for #2308 (explicit agent config)", () => {
  describe("agents.list minimum entry count", () => {
    it("accepts a single valid agent entry", () => {
      const result = RemoteClawSchema.safeParse({
        agents: {
          list: [{ id: "assistant", workspace: "/tmp/assistant" }],
        },
      });
      expect(result.success).toBe(true);
    });

    it("accepts multiple valid agent entries", () => {
      const result = RemoteClawSchema.safeParse({
        agents: {
          list: [
            { id: "alpha", workspace: "/tmp/alpha" },
            { id: "ops", workspace: "/tmp/ops" },
          ],
        },
      });
      expect(result.success).toBe(true);
    });

    it("rejects agents.list with zero entries (.min(1))", () => {
      const result = RemoteClawSchema.safeParse({
        agents: { list: [] },
      });
      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("expected schema validation failure");
      }
      const messages = result.error.issues.map((iss) => iss.message).join("\n");
      expect(messages).toContain("agents.list must contain at least one entry");
      const tooSmallIssue = result.error.issues.find((iss) => iss.path.join(".") === "agents.list");
      expect(tooSmallIssue).toBeDefined();
    });
  });

  describe("agents.list[].workspace required and non-empty", () => {
    it("rejects an agent entry missing the workspace field", () => {
      const result = RemoteClawSchema.safeParse({
        agents: {
          list: [{ id: "assistant" }],
        },
      });
      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("expected schema validation failure");
      }
      const workspaceIssue = result.error.issues.find((iss) => iss.path.join(".") === "agents.list.0.workspace");
      expect(workspaceIssue).toBeDefined();
    });

    it("rejects an agent entry with empty-string workspace", () => {
      const result = RemoteClawSchema.safeParse({
        agents: {
          list: [{ id: "assistant", workspace: "" }],
        },
      });
      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("expected schema validation failure");
      }
      const workspaceIssue = result.error.issues.find((iss) => iss.path.join(".") === "agents.list.0.workspace");
      expect(workspaceIssue).toBeDefined();
      expect(workspaceIssue?.message).toContain("non-empty string");
    });

    it("rejects an agent entry with whitespace-only workspace (trim check)", () => {
      const result = RemoteClawSchema.safeParse({
        agents: {
          list: [{ id: "assistant", workspace: "   " }],
        },
      });
      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("expected schema validation failure");
      }
      const workspaceIssue = result.error.issues.find((iss) => iss.path.join(".") === "agents.list.0.workspace");
      expect(workspaceIssue).toBeDefined();
    });

    it("reports the offending agent index in the error path for multi-entry lists", () => {
      const result = RemoteClawSchema.safeParse({
        agents: {
          list: [{ id: "alpha", workspace: "/tmp/alpha" }, { id: "ops" }],
        },
      });
      expect(result.success).toBe(false);
      if (result.success) {
        throw new Error("expected schema validation failure");
      }
      const workspaceIssue = result.error.issues.find((iss) => iss.path.join(".") === "agents.list.1.workspace");
      expect(workspaceIssue).toBeDefined();
    });
  });
});
