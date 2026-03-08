import { describe, expect, it } from "vitest";
import { AgentDefaultsSchema } from "./zod-schema.agent-defaults.js";
import { AgentEntrySchema } from "./zod-schema.agent-runtime.js";

describe("auth field schema validation", () => {
  describe("AgentEntrySchema", () => {
    it("accepts auth: false", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", auth: false });
      expect(result.success).toBe(true);
    });

    it("accepts auth as a string", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", auth: "anthropic:default" });
      expect(result.success).toBe(true);
    });

    it("accepts auth as a string array", () => {
      const result = AgentEntrySchema.safeParse({
        id: "main",
        auth: ["anthropic:key1", "anthropic:key2"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts omitted auth (undefined)", () => {
      const result = AgentEntrySchema.safeParse({ id: "main" });
      expect(result.success).toBe(true);
      expect(result.data?.auth).toBeUndefined();
    });

    it("rejects auth: true", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", auth: true });
      expect(result.success).toBe(false);
    });

    it("rejects auth: number", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", auth: 42 });
      expect(result.success).toBe(false);
    });

    it("rejects auth: object", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", auth: { profile: "x" } });
      expect(result.success).toBe(false);
    });
  });

  describe("AgentDefaultsSchema", () => {
    it("accepts auth: false", () => {
      const result = AgentDefaultsSchema.safeParse({ auth: false });
      expect(result.success).toBe(true);
    });

    it("accepts auth as a string", () => {
      const result = AgentDefaultsSchema.safeParse({ auth: "anthropic:default" });
      expect(result.success).toBe(true);
    });

    it("accepts auth as a string array", () => {
      const result = AgentDefaultsSchema.safeParse({
        auth: ["anthropic:key1", "anthropic:key2"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts omitted auth (undefined)", () => {
      const result = AgentDefaultsSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("rejects auth: true", () => {
      const result = AgentDefaultsSchema.safeParse({ auth: true });
      expect(result.success).toBe(false);
    });
  });
});
