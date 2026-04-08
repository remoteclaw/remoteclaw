import { escapeRegExp } from "../utils.js";
import { HEARTBEAT_TOKEN } from "./tokens.js";

/** Non-configurable suffix appended by the middleware to every heartbeat prompt. */
export const HEARTBEAT_TOOL_SUFFIX = " Report the result using the heartbeat_report tool.";

export const DEFAULT_HEARTBEAT_EVERY = "30m";
export const DEFAULT_HEARTBEAT_ACK_MAX_CHARS = 300;

/**
 * Resolve the heartbeat prompt from a raw config value.
 * Returns the trimmed prompt or empty string if not configured.
 */
export function resolveHeartbeatPrompt(raw?: string): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed;
}

export type StripHeartbeatMode = "heartbeat" | "message";

function stripTokenAtEdges(raw: string): { text: string; didStrip: boolean } {
  let text = raw.trim();
  if (!text) {
    return { text: "", didStrip: false };
  }

  const token = HEARTBEAT_TOKEN;
  const tokenAtEndWithOptionalTrailingPunctuation = new RegExp(
    `${escapeRegExp(token)}[^\\w]{0,4}$`,
  );
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

export function stripHeartbeatToken(
  raw?: string,
  opts: { mode?: StripHeartbeatMode; maxAckChars?: number } = {},
) {
  if (!raw) {
    return { shouldSkip: true, text: "", didStrip: false };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { shouldSkip: true, text: "", didStrip: false };
  }

  const mode: StripHeartbeatMode = opts.mode ?? "message";
  const maxAckCharsRaw = opts.maxAckChars;
  const parsedAckChars =
    typeof maxAckCharsRaw === "string" ? Number(maxAckCharsRaw) : maxAckCharsRaw;
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
  const picked =
    strippedOriginal.didStrip && strippedOriginal.text ? strippedOriginal : strippedNormalized;
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

// Gutted in RemoteClaw fork — stub export for upstream compat
export function isHeartbeatContentEffectivelyEmpty(_content: string): boolean {
  return false;
}
