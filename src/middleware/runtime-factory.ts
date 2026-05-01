import { execFileSync } from "node:child_process";
import { logDebug } from "../logger.js";
import { ClaudeCliRuntime } from "./runtimes/claude.js";
import { CodexCliRuntime } from "./runtimes/codex.js";
import { GeminiCliRuntime } from "./runtimes/gemini.js";
import { OpenCodeCliRuntime } from "./runtimes/opencode.js";
import type { AgentRuntime } from "./types.js";

export const SUPPORTED_PROVIDERS = ["claude", "gemini", "codex", "opencode"] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

// ── Executable validation ─────────────────────────────────────────────────

const validatedCommands = new Set<string>();

/**
 * Verify that a CLI binary exists on PATH.
 *
 * Results are cached per process lifetime so the `which` lookup runs at most
 * once per command.
 */
function validateExecutable(command: string): void {
  if (validatedCommands.has(command)) {
    logDebug(`[runtime-factory] executable already validated: ${command}`);
    return;
  }
  try {
    execFileSync("which", [command], { stdio: "ignore" });
    logDebug(`[runtime-factory] executable validated: ${command}`);
    validatedCommands.add(command);
  } catch {
    throw new Error(
      `Runtime '${command}' is configured but the '${command}' binary was not found on PATH. ` +
        `Install it or set agents.defaults.runtime to a different provider.`,
    );
  }
}

/** @internal — exposed for tests only. */
export function _resetValidationCache(): void {
  validatedCommands.clear();
}

export function createCliRuntime(provider: string): AgentRuntime {
  const normalized = provider.trim().toLowerCase();
  logDebug(`[runtime-factory] creating runtime: provider=${normalized}`);

  switch (normalized) {
    case "claude":
      validateExecutable(normalized);
      return new ClaudeCliRuntime();
    case "gemini":
      validateExecutable(normalized);
      return new GeminiCliRuntime();
    case "codex":
      validateExecutable(normalized);
      return new CodexCliRuntime();
    case "opencode":
      validateExecutable(normalized);
      return new OpenCodeCliRuntime();
    default:
      throw new Error(
        `Unknown runtime provider "${provider}". Supported providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
      );
  }
}
