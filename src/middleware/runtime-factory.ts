import { ClaudeCliRuntime } from "./runtimes/claude.js";
import { CodexCliRuntime } from "./runtimes/codex.js";
import { GeminiCliRuntime } from "./runtimes/gemini.js";
import { OpenCodeCliRuntime } from "./runtimes/opencode.js";
import type { AgentRuntime } from "./types.js";

export const SUPPORTED_PROVIDERS = ["claude", "gemini", "codex", "opencode"] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Resolve the CLI runtime provider from config.
 *
 * Reads `agents.defaults.runtime` (set during onboarding) and throws when
 * unset.  This is the **CLI runtime** (which binary to spawn), NOT the
 * model-API provider (e.g. "anthropic").
 */
export function resolveCliRuntimeProvider(cfg?: {
  agents?: { defaults?: { runtime?: string } };
}): string {
  const runtime = cfg?.agents?.defaults?.runtime;
  if (!runtime) {
    throw new Error(
      `No runtime configured. Set agents.defaults.runtime to one of: ${SUPPORTED_PROVIDERS.join(", ")}`,
    );
  }
  return runtime;
}

/**
 * Resolve extra CLI runtime args from config.
 *
 * Reads `agents.defaults.runtimeArgs` — extra CLI flags appended to every
 * runtime invocation (e.g. `["--dangerously-skip-permissions"]`).
 */
export function resolveCliRuntimeArgs(cfg?: {
  agents?: { defaults?: { runtimeArgs?: string[] } };
}): string[] | undefined {
  return cfg?.agents?.defaults?.runtimeArgs;
}

export function createCliRuntime(provider: string): AgentRuntime {
  const normalized = provider.trim().toLowerCase();

  switch (normalized) {
    case "claude":
      return new ClaudeCliRuntime();
    case "gemini":
      return new GeminiCliRuntime();
    case "codex":
      return new CodexCliRuntime();
    case "opencode":
      return new OpenCodeCliRuntime();
    default:
      throw new Error(
        `Unknown runtime provider "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
      );
  }
}
