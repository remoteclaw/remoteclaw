import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { ClaudeCliRuntime } from "./claude-cli-runtime.js";
import { createCliRuntime } from "./cli-runtime-factory.js";
import { CodexCliRuntime } from "./codex-cli-runtime.js";
import { GeminiCliRuntime } from "./gemini-cli-runtime.js";
import { OpenCodeCliRuntime } from "./opencode-cli-runtime.js";

function makeCfg(
  cliBackends?: Record<string, { command?: string; args?: string[] }>,
): RemoteClawConfig {
  return {
    agents: {
      defaults: {
        cliBackends,
      },
    },
  } as RemoteClawConfig;
}

describe("createCliRuntime", () => {
  it("returns ClaudeCliRuntime for claude-cli without config", () => {
    const runtime = createCliRuntime("claude-cli", makeCfg());
    expect(runtime).toBeInstanceOf(ClaudeCliRuntime);
    expect(runtime.name).toBe("claude-cli");
  });

  it("returns ClaudeCliRuntime for claude-cli with config", () => {
    const runtime = createCliRuntime(
      "claude-cli",
      makeCfg({ "claude-cli": { command: "/opt/claude" } }),
    );
    expect(runtime).toBeInstanceOf(ClaudeCliRuntime);
  });

  it("normalizes provider id for built-in lookup", () => {
    const runtime = createCliRuntime("Claude-CLI", makeCfg());
    expect(runtime).toBeInstanceOf(ClaudeCliRuntime);
  });

  it("returns CodexCliRuntime for codex-cli without config", () => {
    const runtime = createCliRuntime("codex-cli", makeCfg());
    expect(runtime).toBeInstanceOf(CodexCliRuntime);
    expect(runtime.name).toBe("codex-cli");
  });

  it("returns CodexCliRuntime for codex-cli with config", () => {
    const runtime = createCliRuntime(
      "codex-cli",
      makeCfg({ "codex-cli": { command: "/usr/local/bin/codex" } }),
    );
    expect(runtime).toBeInstanceOf(CodexCliRuntime);
  });

  it("normalizes provider id for codex-cli lookup", () => {
    const runtime = createCliRuntime("Codex-CLI", makeCfg());
    expect(runtime).toBeInstanceOf(CodexCliRuntime);
  });

  it("returns runtime for custom CLI backend with config", () => {
    const runtime = createCliRuntime(
      "my-backend",
      makeCfg({ "my-backend": { command: "my-cli", args: ["--json"] } }),
    );
    expect(runtime).toBeInstanceOf(ClaudeCliRuntime);
  });

  it("throws for unknown provider without config", () => {
    expect(() => createCliRuntime("unknown-provider", makeCfg())).toThrow(
      "No CLI runtime registered for provider: unknown-provider",
    );
  });

  it("throws for unknown provider with empty cliBackends", () => {
    expect(() => createCliRuntime("nonexistent", makeCfg({}))).toThrow(
      "No CLI runtime registered for provider: nonexistent",
    );
  });

  it("handles normalized provider lookup in cliBackends", () => {
    const runtime = createCliRuntime(
      "My-Backend",
      makeCfg({ "my-backend": { command: "custom-cli" } }),
    );
    expect(runtime).toBeInstanceOf(ClaudeCliRuntime);
  });

  it("returns OpenCodeCliRuntime for opencode without config", () => {
    const runtime = createCliRuntime("opencode", makeCfg());
    expect(runtime).toBeInstanceOf(OpenCodeCliRuntime);
    expect(runtime.name).toBe("opencode");
  });

  it("returns OpenCodeCliRuntime for opencode with config", () => {
    const runtime = createCliRuntime(
      "opencode",
      makeCfg({ opencode: { command: "/usr/local/bin/opencode" } }),
    );
    expect(runtime).toBeInstanceOf(OpenCodeCliRuntime);
  });

  it("normalizes opencode-zen to opencode provider", () => {
    const runtime = createCliRuntime("opencode-zen", makeCfg());
    expect(runtime).toBeInstanceOf(OpenCodeCliRuntime);
    expect(runtime.name).toBe("opencode");
  });

  it("returns GeminiCliRuntime for google-gemini-cli without config", () => {
    const runtime = createCliRuntime("google-gemini-cli", makeCfg());
    expect(runtime).toBeInstanceOf(GeminiCliRuntime);
    expect(runtime.name).toBe("google-gemini-cli");
  });

  it("returns GeminiCliRuntime for google-gemini-cli with config", () => {
    const runtime = createCliRuntime(
      "google-gemini-cli",
      makeCfg({ "google-gemini-cli": { command: "/opt/gemini" } }),
    );
    expect(runtime).toBeInstanceOf(GeminiCliRuntime);
  });

  it("normalizes provider id for google-gemini-cli lookup", () => {
    const runtime = createCliRuntime("Google-Gemini-CLI", makeCfg());
    expect(runtime).toBeInstanceOf(GeminiCliRuntime);
  });
});
