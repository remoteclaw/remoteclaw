import fs from "node:fs/promises";
import path from "node:path";

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
