import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetValidationCache, createCliRuntime, SUPPORTED_PROVIDERS } from "./runtime-factory.js";
import { ClaudeCliRuntime } from "./runtimes/claude.js";
import { CodexCliRuntime } from "./runtimes/codex.js";
import { GeminiCliRuntime } from "./runtimes/gemini.js";
import { OpenCodeCliRuntime } from "./runtimes/opencode.js";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

beforeEach(() => {
  _resetValidationCache();
  mockedExecFileSync.mockReset();
});

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

  // ── Executable validation ─────────────────────────────────────────────

  describe("executable validation", () => {
    it("calls which to validate the binary exists on PATH", () => {
      createCliRuntime("claude");
      expect(mockedExecFileSync).toHaveBeenCalledWith("which", ["claude"], { stdio: "ignore" });
    });

    it("throws a clear error when binary is not found", () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error("not found");
      });
      expect(() => createCliRuntime("claude")).toThrow(
        "Runtime 'claude' is configured but the 'claude' binary was not found on PATH",
      );
    });

    it("includes alternative suggestion in error message", () => {
      mockedExecFileSync.mockImplementation(() => {
        throw new Error("not found");
      });
      expect(() => createCliRuntime("gemini")).toThrow(
        "set agents.defaults.runtime to a different provider",
      );
    });

    it("caches validation per command — which is called only once", () => {
      createCliRuntime("claude");
      createCliRuntime("claude");
      createCliRuntime("claude");
      expect(mockedExecFileSync).toHaveBeenCalledTimes(1);
    });

    it("validates each provider independently", () => {
      createCliRuntime("claude");
      createCliRuntime("gemini");
      expect(mockedExecFileSync).toHaveBeenCalledTimes(2);
      expect(mockedExecFileSync).toHaveBeenCalledWith("which", ["claude"], { stdio: "ignore" });
      expect(mockedExecFileSync).toHaveBeenCalledWith("which", ["gemini"], { stdio: "ignore" });
    });

    it("does not call which for unknown providers", () => {
      expect(() => createCliRuntime("foo")).toThrow("Unknown runtime provider");
      expect(mockedExecFileSync).not.toHaveBeenCalled();
    });

    it("validates all four supported providers", () => {
      for (const provider of SUPPORTED_PROVIDERS) {
        createCliRuntime(provider);
      }
      expect(mockedExecFileSync).toHaveBeenCalledTimes(4);
    });
  });
});
