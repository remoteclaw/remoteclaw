import { ClaudeCliRuntime } from "./runtimes/claude.js";
import { CodexCliRuntime } from "./runtimes/codex.js";
import { GeminiCliRuntime } from "./runtimes/gemini.js";
import { OpenCodeCliRuntime } from "./runtimes/opencode.js";
import type { AgentRuntime } from "./types.js";

export const SUPPORTED_PROVIDERS = ["claude", "gemini", "codex", "opencode"] as const;

export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

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
