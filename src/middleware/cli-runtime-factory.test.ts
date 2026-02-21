import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { ClaudeCliRuntime } from "./claude-cli-runtime.js";
import { createCliRuntime } from "./cli-runtime-factory.js";

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
});
