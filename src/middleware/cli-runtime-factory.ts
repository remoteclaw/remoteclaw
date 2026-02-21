import { findNormalizedProviderValue, normalizeProviderId } from "../agents/cli-routing.js";
import type { RemoteClawConfig } from "../config/config.js";
import { ClaudeCliRuntime } from "./claude-cli-runtime.js";
import type { CLIRuntimeBase } from "./cli-runtime-base.js";
import { CodexCliRuntime } from "./codex-cli-runtime.js";
import { GeminiCliRuntime } from "./gemini-cli-runtime.js";
import { OpenCodeCliRuntime } from "./opencode-cli-runtime.js";

/**
 * Resolve the correct CLI runtime for a given provider.
 *
 * - `"claude-cli"` always resolves (config is optional — defaults apply).
 * - `"opencode"` resolves with its own runtime (config is optional — defaults apply).
 * - `"google-gemini-cli"` always resolves (config is optional — defaults apply).
 * - `"codex-cli"` always resolves (config is optional — defaults apply).
 * - Custom providers resolve when a matching `cliBackends` entry exists.
 * - Unknown providers with no config throw.
 */
export function createCliRuntime(provider: string, cfg: RemoteClawConfig): CLIRuntimeBase {
  const backendConfig = findNormalizedProviderValue(cfg.agents?.defaults?.cliBackends, provider);

  const normalized = normalizeProviderId(provider);

  // Built-in providers — always valid, config is optional
  if (normalized === "claude-cli") {
    return new ClaudeCliRuntime(backendConfig);
  }
  if (normalized === "opencode") {
    return new OpenCodeCliRuntime(backendConfig);
  }
  if (normalized === "google-gemini-cli") {
    return new GeminiCliRuntime(backendConfig);
  }
  if (normalized === "codex-cli") {
    return new CodexCliRuntime(backendConfig);
  }

  // Custom CLI backend — must have a config entry in cliBackends
  if (backendConfig) {
    return new ClaudeCliRuntime(backendConfig);
  }

  throw new Error(`No CLI runtime registered for provider: ${provider}`);
}
