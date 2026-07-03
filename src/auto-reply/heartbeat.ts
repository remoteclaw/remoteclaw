import fs from "node:fs/promises";
import path from "node:path";

// Browser-safe token-stripping primitives live in ./heartbeat-token.js (no
// node:fs/node:path, no node-coupled transitive deps) so the Control UI bundle
// can import them via ./heartbeat-filter.js. Re-exported here to preserve the
// historical ./heartbeat.js import surface for server-side callers. See #2770.
export {
  DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  stripHeartbeatToken,
  type StripHeartbeatMode,
} from "./heartbeat-token.js";

/** Non-configurable suffix appended by the middleware to every heartbeat prompt. */
export const HEARTBEAT_TOOL_SUFFIX = " Report the result using the heartbeat_report tool.";

export const DEFAULT_HEARTBEAT_EVERY = "30m";

/**
 * Resolve the heartbeat prompt from config.
 *
 * Resolution order:
 * - `prompt` takes precedence if set (non-empty after trim)
 * - `file` is read at runtime (path relative to workspaceDir)
 * - Returns empty string when neither is configured (caller should skip heartbeat)
 */
export async function resolveHeartbeatPrompt(opts: {
  prompt?: string;
  file?: string;
  workspaceDir?: string;
}): Promise<string> {
  const trimmedPrompt = opts.prompt?.trim();
  if (trimmedPrompt) {
    return trimmedPrompt;
  }

  const trimmedFile = opts.file?.trim();
  if (trimmedFile) {
    const filePath =
      opts.workspaceDir && !path.isAbsolute(trimmedFile)
        ? path.join(opts.workspaceDir, trimmedFile)
        : trimmedFile;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const trimmedContent = content.trim();
      if (trimmedContent) {
        return trimmedContent;
      }
    } catch {
      // File missing or unreadable — treat as unconfigured.
    }
  }

  return "";
}

/**
 * Returns true when the HEARTBEAT.md content is effectively empty —
 * only contains headings, blank lines, and whitespace with no actionable items.
 */
export function isHeartbeatContentEffectivelyEmpty(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) {
    return true;
  }
  // Strip markdown headings, horizontal rules, and whitespace-only lines.
  // If nothing remains, the file is effectively empty.
  const stripped = trimmed
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t && !t.startsWith("#") && !/^-{3,}$/.test(t) && !/^\*{3,}$/.test(t);
    })
    .join("")
    .trim();
  return stripped.length === 0;
}

// Gutted in RemoteClaw fork (Middleware Boundary Principle)
export const HEARTBEAT_PROMPT = "";
export const DEFAULT_HEARTBEAT_FILENAME = "HEARTBEAT.md";
