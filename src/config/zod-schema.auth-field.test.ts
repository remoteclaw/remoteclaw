import { describe, expect, it } from "vitest";
import { AgentDefaultsSchema } from "./zod-schema.agent-defaults.js";
import { AgentEntrySchema } from "./zod-schema.agent-runtime.js";

describe("per-agent fork-specific field schema validation", () => {
  describe("AgentEntrySchema — auth", () => {
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
      expect(((result.data ?? {}) as Record<string, unknown>)?.auth).toBeUndefined();
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

  describe("AgentEntrySchema — runtime", () => {
    it("accepts runtime: 'claude'", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtime: "claude" });
      expect(result.success).toBe(true);
    });

    it("accepts runtime: 'gemini'", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtime: "gemini" });
      expect(result.success).toBe(true);
    });

    it("accepts runtime: 'codex'", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtime: "codex" });
      expect(result.success).toBe(true);
    });

    it("accepts runtime: 'opencode'", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtime: "opencode" });
      expect(result.success).toBe(true);
    });

    it("accepts omitted runtime (undefined)", () => {
      const result = AgentEntrySchema.safeParse({ id: "main" });
      expect(result.success).toBe(true);
      expect(((result.data ?? {}) as Record<string, unknown>)?.runtime).toBeUndefined();
    });

    it("rejects runtime: 'unsupported'", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtime: "unsupported" });
      expect(result.success).toBe(false);
    });

    it("rejects runtime: number", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtime: 42 });
      expect(result.success).toBe(false);
    });
  });

  describe("AgentEntrySchema — runtimeArgs", () => {
    it("accepts runtimeArgs as a string array", () => {
      const result = AgentEntrySchema.safeParse({
        id: "main",
        runtimeArgs: ["--verbose", "--model", "sonnet"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts runtimeArgs as an empty array", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtimeArgs: [] });
      expect(result.success).toBe(true);
    });

    it("accepts omitted runtimeArgs (undefined)", () => {
      const result = AgentEntrySchema.safeParse({ id: "main" });
      expect(result.success).toBe(true);
      expect(((result.data ?? {}) as Record<string, unknown>)?.runtimeArgs).toBeUndefined();
    });

    it("rejects runtimeArgs: string (not array)", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtimeArgs: "--verbose" });
      expect(result.success).toBe(false);
    });

    it("rejects runtimeArgs: number array", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtimeArgs: [1, 2, 3] });
      expect(result.success).toBe(false);
    });
  });

  describe("AgentEntrySchema — runtimeEnv", () => {
    it("accepts runtimeEnv as a record of strings", () => {
      const result = AgentEntrySchema.safeParse({
        id: "main",
        runtimeEnv: { API_KEY: "sk-test", NODE_ENV: "production" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts runtimeEnv as an empty record", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtimeEnv: {} });
      expect(result.success).toBe(true);
    });

    it("accepts omitted runtimeEnv (undefined)", () => {
      const result = AgentEntrySchema.safeParse({ id: "main" });
      expect(result.success).toBe(true);
      expect(((result.data ?? {}) as Record<string, unknown>)?.runtimeEnv).toBeUndefined();
    });

    it("rejects runtimeEnv: array", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtimeEnv: ["KEY=val"] });
      expect(result.success).toBe(false);
    });

    it("rejects runtimeEnv with non-string values", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", runtimeEnv: { PORT: 3000 } });
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
