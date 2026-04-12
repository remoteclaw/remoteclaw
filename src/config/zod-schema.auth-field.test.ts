import { describe, expect, it } from "vitest";
import { AgentDefaultsSchema } from "./zod-schema.agent-defaults.js";
import { AgentEntrySchema } from "./zod-schema.agent-runtime.js";

describe("per-agent fork-specific field schema validation", () => {
  const baseAgent = { id: "main", workspace: "/tmp/main" };

  describe("AgentEntrySchema — auth", () => {
    it("accepts auth: false", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, auth: false });
      expect(result.success).toBe(true);
    });

    it("accepts auth as a string", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, auth: "anthropic:default" });
      expect(result.success).toBe(true);
    });

    it("accepts auth as a string array", () => {
      const result = AgentEntrySchema.safeParse({
        ...baseAgent,
        auth: ["anthropic:key1", "anthropic:key2"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts omitted auth (undefined)", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent });
      expect(result.success).toBe(true);
      expect(((result.data ?? {}) as Record<string, unknown>)?.auth).toBeUndefined();
    });

    it("rejects auth: true", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, auth: true });
      expect(result.success).toBe(false);
    });

    it("rejects auth: number", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, auth: 42 });
      expect(result.success).toBe(false);
    });

    it("rejects auth: object", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, auth: { profile: "x" } });
      expect(result.success).toBe(false);
    });

    it("rejects missing workspace", () => {
      const result = AgentEntrySchema.safeParse({ id: "main" });
      expect(result.success).toBe(false);
    });

    it("rejects empty-string workspace", () => {
      const result = AgentEntrySchema.safeParse({ id: "main", workspace: "   " });
      expect(result.success).toBe(false);
    });
  });

  describe("AgentEntrySchema — runtime", () => {
    it("accepts runtime: 'claude'", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtime: "claude" });
      expect(result.success).toBe(true);
    });

    it("accepts runtime: 'gemini'", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtime: "gemini" });
      expect(result.success).toBe(true);
    });

    it("accepts runtime: 'codex'", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtime: "codex" });
      expect(result.success).toBe(true);
    });

    it("accepts runtime: 'opencode'", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtime: "opencode" });
      expect(result.success).toBe(true);
    });

    it("accepts omitted runtime (undefined)", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent });
      expect(result.success).toBe(true);
      expect(((result.data ?? {}) as Record<string, unknown>)?.runtime).toBeUndefined();
    });

    it("rejects runtime: 'unsupported'", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtime: "unsupported" });
      expect(result.success).toBe(false);
    });

    it("rejects runtime: number", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtime: 42 });
      expect(result.success).toBe(false);
    });
  });

  describe("AgentEntrySchema — runtimeArgs", () => {
    it("accepts runtimeArgs as a string array", () => {
      const result = AgentEntrySchema.safeParse({
        ...baseAgent,
        runtimeArgs: ["--verbose", "--model", "sonnet"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts runtimeArgs as an empty array", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtimeArgs: [] });
      expect(result.success).toBe(true);
    });

    it("accepts omitted runtimeArgs (undefined)", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent });
      expect(result.success).toBe(true);
      expect(((result.data ?? {}) as Record<string, unknown>)?.runtimeArgs).toBeUndefined();
    });

    it("rejects runtimeArgs: string (not array)", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtimeArgs: "--verbose" });
      expect(result.success).toBe(false);
    });

    it("rejects runtimeArgs: number array", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtimeArgs: [1, 2, 3] });
      expect(result.success).toBe(false);
    });
  });

  describe("AgentEntrySchema — runtimeEnv", () => {
    it("accepts runtimeEnv as a record of strings", () => {
      const result = AgentEntrySchema.safeParse({
        ...baseAgent,
        runtimeEnv: { API_KEY: "sk-test", NODE_ENV: "production" },
      });
      expect(result.success).toBe(true);
    });

    it("accepts runtimeEnv as an empty record", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtimeEnv: {} });
      expect(result.success).toBe(true);
    });

    it("accepts omitted runtimeEnv (undefined)", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent });
      expect(result.success).toBe(true);
      expect(((result.data ?? {}) as Record<string, unknown>)?.runtimeEnv).toBeUndefined();
    });

    it("rejects runtimeEnv: array", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtimeEnv: ["KEY=val"] });
      expect(result.success).toBe(false);
    });

    it("rejects runtimeEnv with non-string values", () => {
      const result = AgentEntrySchema.safeParse({ ...baseAgent, runtimeEnv: { PORT: 3000 } });
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
