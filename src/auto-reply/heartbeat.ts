import fs from "node:fs/promises";
import path from "node:path";
import { escapeRegExp } from "../utils.js";
import { HEARTBEAT_TOKEN } from "./tokens.js";

/** Non-configurable suffix appended by the middleware to every heartbeat prompt. */
export const HEARTBEAT_TOOL_SUFFIX = " Report the result using the heartbeat_report tool.";

export const DEFAULT_HEARTBEAT_EVERY = "30m";
export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;

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
      opts.workspaceDir && !path.isAbsolute(trimmedFile) ? path.join(opts.workspaceDir, trimmedFile) : trimmedFile;
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

export type StripHeartbeatMode = "heartbeat" | "message";

function stripTokenAtEdges(raw: string): { text: string; didStrip: boolean } {
  let text = raw.trim();
  if (!text) {
    return { text: "", didStrip: false };
  }

  const token = HEARTBEAT_TOKEN;
  const tokenAtEndWithOptionalTrailingPunctuation = new RegExp(`${escapeRegExp(token)}[^\\w]{0,4}$`);
  if (!text.includes(token)) {
    return { text, didStrip: false };
  }

  let didStrip = false;
  let changed = true;
  while (changed) {
    changed = false;
    const next = text.trim();
    if (next.startsWith(token)) {
      const after = next.slice(token.length).trimStart();
      text = after;
      didStrip = true;
      changed = true;
      continue;
    }
    // Strip the token when it appears at the end of the text.
    // Also strip up to 4 trailing non-word characters the model may have appended
    // (e.g. ".", "!!!", "---"). Keep trailing punctuation only when real
    // sentence text exists before the token.
    if (tokenAtEndWithOptionalTrailingPunctuation.test(next)) {
      const idx = next.lastIndexOf(token);
      const before = next.slice(0, idx).trimEnd();
      if (!before) {
        text = "";
      } else {
        const after = next.slice(idx + token.length).trimStart();
        text = `${before}${after}`.trimEnd();
      }
      didStrip = true;
      changed = true;
    }
  }

  const collapsed = text.replace(/\s+/g, " ").trim();
  return { text: collapsed, didStrip };
}

export function stripHeartbeatToken(raw?: string, opts: { mode?: StripHeartbeatMode; maxAckChars?: number } = {}) {
  if (!raw) {
    return { shouldSkip: true, text: "", didStrip: false };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { shouldSkip: true, text: "", didStrip: false };
  }

  const mode: StripHeartbeatMode = opts.mode ?? "message";
  const maxAckCharsRaw = opts.maxAckChars;
  const parsedAckChars = typeof maxAckCharsRaw === "string" ? Number(maxAckCharsRaw) : maxAckCharsRaw;
  const maxAckChars = Math.max(
    0,
    typeof parsedAckChars === "number" && Number.isFinite(parsedAckChars)
      ? parsedAckChars
      : DEFAULT_HEARTBEAT_ACK_MAX_CHARS,
  );

  // Normalize lightweight markup so HEARTBEAT_OK wrapped in HTML/Markdown
  // (e.g., <b>HEARTBEAT_OK</b> or **HEARTBEAT_OK**) still strips.
  const stripMarkup = (text: string) =>
    text
      // Drop HTML tags.
      .replace(/<[^>]*>/g, " ")
      // Decode common nbsp variant.
      .replace(/&nbsp;/gi, " ")
      // Remove markdown-ish wrappers at the edges.
      .replace(/^[*`~_]+/, "")
      .replace(/[*`~_]+$/, "");

  const trimmedNormalized = stripMarkup(trimmed);
  const hasToken = trimmed.includes(HEARTBEAT_TOKEN) || trimmedNormalized.includes(HEARTBEAT_TOKEN);
  if (!hasToken) {
    return { shouldSkip: false, text: trimmed, didStrip: false };
  }

  const strippedOriginal = stripTokenAtEdges(trimmed);
  const strippedNormalized = stripTokenAtEdges(trimmedNormalized);
  const picked = strippedOriginal.didStrip && strippedOriginal.text ? strippedOriginal : strippedNormalized;
  if (!picked.didStrip) {
    return { shouldSkip: false, text: trimmed, didStrip: false };
  }

  if (!picked.text) {
    return { shouldSkip: true, text: "", didStrip: true };
  }

  const rest = picked.text.trim();
  if (mode === "heartbeat") {
    if (rest.length <= maxAckChars) {
      return { shouldSkip: true, text: "", didStrip: true };
    }
  }

  return { shouldSkip: false, text: rest, didStrip: true };
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
