// Builds platform shell argv for Node-driven command execution.
import { normalizeLowercaseStringOrEmpty } from "@remoteclaw/normalization-core/string-coerce";
import { resolveWindowsCmdExePath } from "./windows-system-paths.js";

// Node shell command construction keeps platform shell flags centralized for
// system.run and related command execution paths.
/** Build argv for running a command through the platform default shell. */
export function buildNodeShellCommand(command: string, platform?: string | null) {
  const normalized = normalizeLowercaseStringOrEmpty((platform ?? "").trim());
  if (normalized.startsWith("win")) {
    return [resolveWindowsCmdExePath(), "/d", "/s", "/c", command];
  }
  return ["/bin/sh", "-lc", command];
}
