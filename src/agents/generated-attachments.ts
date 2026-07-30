/**
 * Formats generated attachment references for agent-visible output.
 */
import { basenameFromAnyPath } from "@remoteclaw/media-core/file-name";
import { normalizeOptionalString } from "@remoteclaw/normalization-core/string-coerce";
import { uniqueStrings } from "@remoteclaw/normalization-core/string-normalization";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  mediaUrlsFromGeneratedAttachments: "live",
  formatGeneratedAttachmentLines: "live",
} as const;

// Shared helpers for generated media/file attachments returned by tools or
// subagents. They normalize paths/URLs for prompt text and delivery routing.
export type AgentGeneratedAttachment = {
  type?: "image" | "audio" | "video" | "file";
  path?: string;
  url?: string;
  mediaUrl?: string;
  filePath?: string;
  mimeType?: string;
  name?: string;
};

function generatedAttachmentReference(attachment: AgentGeneratedAttachment): string | undefined {
  return normalizeOptionalString(
    attachment.path ?? attachment.url ?? attachment.mediaUrl ?? attachment.filePath,
  );
}

/** Return unique media URLs/paths from generated attachments. */
export function mediaUrlsFromGeneratedAttachments(
  attachments: readonly AgentGeneratedAttachment[] | undefined,
): string[] {
  return uniqueStrings(
    attachments?.flatMap((attachment) => generatedAttachmentReference(attachment) ?? []) ?? [],
  );
}

function nameFromGeneratedAttachment(attachment: AgentGeneratedAttachment): string | undefined {
  return (
    normalizeOptionalString(attachment.name) ??
    basenameFromAnyPath(generatedAttachmentReference(attachment) ?? "")
  );
}

/** Format generated attachment metadata as prompt-safe text lines. */
export function formatGeneratedAttachmentLines(
  attachments: readonly AgentGeneratedAttachment[] | undefined,
): string[] {
  if (!attachments?.length) {
    return [];
  }
  const lines = ["Attachments:"];
  for (const [index, attachment] of attachments.entries()) {
    const parts = [`${index + 1}.`];
    const type = normalizeOptionalString(attachment.type);
    const name = nameFromGeneratedAttachment(attachment);
    const mimeType = normalizeOptionalString(attachment.mimeType);
    const path = normalizeOptionalString(attachment.path ?? attachment.filePath);
    const url = normalizeOptionalString(attachment.url ?? attachment.mediaUrl);
    if (type) {
      parts.push(`type=${type}`);
    }
    if (name) {
      parts.push(`name=${JSON.stringify(name)}`);
    }
    if (mimeType) {
      parts.push(`mimeType=${mimeType}`);
    }
    if (path) {
      parts.push(`path=${JSON.stringify(path)}`);
    } else if (url) {
      parts.push(`mediaUrl=${JSON.stringify(url)}`);
    }
    lines.push(parts.join(" "));
  }
  return lines;
}
