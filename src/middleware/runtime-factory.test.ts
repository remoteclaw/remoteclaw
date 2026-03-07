import { describe, expect, it } from "vitest";
import {
  createCliRuntime,
  resolveCliRuntimeProvider,
  SUPPORTED_PROVIDERS,
} from "./runtime-factory.js";
import { ClaudeCliRuntime } from "./runtimes/claude.js";
import { CodexCliRuntime } from "./runtimes/codex.js";
import { GeminiCliRuntime } from "./runtimes/gemini.js";
import { OpenCodeCliRuntime } from "./runtimes/opencode.js";

// ── Provider mapping ──────────────────────────────────────────────────────

describe("createCliRuntime", () => {
  describe("provider mapping", () => {
    it("returns ClaudeCliRuntime for 'claude'", () => {
      const runtime = createCliRuntime("claude");
      expect(runtime).toBeInstanceOf(ClaudeCliRuntime);
    });

    it("returns GeminiCliRuntime for 'gemini'", () => {
      const runtime = createCliRuntime("gemini");
      expect(runtime).toBeInstanceOf(GeminiCliRuntime);
    });

    it("returns CodexCliRuntime for 'codex'", () => {
      const runtime = createCliRuntime("codex");
      expect(runtime).toBeInstanceOf(CodexCliRuntime);
    });

    it("returns OpenCodeCliRuntime for 'opencode'", () => {
      const runtime = createCliRuntime("opencode");
      expect(runtime).toBeInstanceOf(OpenCodeCliRuntime);
    });

    it("returns instances that satisfy AgentRuntime interface", () => {
      for (const provider of SUPPORTED_PROVIDERS) {
        const runtime = createCliRuntime(provider);
        expect(runtime).toHaveProperty("execute");
        expect(typeof runtime.execute).toBe("function");
      }
    });
  });

  // ── Input normalization ───────────────────────────────────────────────

  describe("input normalization", () => {
    it("handles case-insensitive input", () => {
      expect(createCliRuntime("Claude")).toBeInstanceOf(ClaudeCliRuntime);
      expect(createCliRuntime("GEMINI")).toBeInstanceOf(GeminiCliRuntime);
      expect(createCliRuntime("Codex")).toBeInstanceOf(CodexCliRuntime);
    });

    it("trims whitespace", () => {
      expect(createCliRuntime(" claude ")).toBeInstanceOf(ClaudeCliRuntime);
    });

    it("handles mixed case and whitespace", () => {
      expect(createCliRuntime(" OpenCode ")).toBeInstanceOf(OpenCodeCliRuntime);
    });
  });

  // ── Error handling ────────────────────────────────────────────────────

  describe("error handling", () => {
    it("throws Error with descriptive message for unknown provider", () => {
      expect(() => createCliRuntime("foo")).toThrow('Unknown runtime provider "foo"');
    });

    it("includes all supported providers in error message", () => {
      expect.assertions(4);
      try {
        createCliRuntime("unknown");
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain("claude");
        expect(message).toContain("gemini");
        expect(message).toContain("codex");
        expect(message).toContain("opencode");
      }
    });
  });

  // ── Instance freshness ────────────────────────────────────────────────

  describe("instance freshness", () => {
    it("returns distinct instances for consecutive calls", () => {
      const a = createCliRuntime("claude");
      const b = createCliRuntime("claude");
      expect(a).not.toBe(b);
    });
  });

  // ── SUPPORTED_PROVIDERS export ────────────────────────────────────────

  describe("SUPPORTED_PROVIDERS", () => {
    it("contains exactly the four supported provider names", () => {
      expect([...SUPPORTED_PROVIDERS]).toEqual(["claude", "gemini", "codex", "opencode"]);
    });
  });
});

// ── resolveCliRuntimeProvider ─────────────────────────────────────────────

describe("resolveCliRuntimeProvider", () => {
  it("returns agents.defaults.runtime when set", () => {
    expect(resolveCliRuntimeProvider({ agents: { defaults: { runtime: "gemini" } } })).toBe(
      "gemini",
    );
  });

  it("falls back to 'claude' when runtime is undefined", () => {
    expect(resolveCliRuntimeProvider({ agents: { defaults: {} } })).toBe("claude");
  });

  it("falls back to 'claude' when defaults is undefined", () => {
    expect(resolveCliRuntimeProvider({ agents: {} })).toBe("claude");
  });

  it("falls back to 'claude' when agents is undefined", () => {
    expect(resolveCliRuntimeProvider({})).toBe("claude");
  });

  it("falls back to 'claude' when config is undefined", () => {
    expect(resolveCliRuntimeProvider(undefined)).toBe("claude");
  });
});
