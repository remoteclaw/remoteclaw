import type { AgentRuntime, MediaAttachment } from "./types.js";

/** Result of partitioning media by runtime capability. */
export type MediaPartition = {
  /** Media the runtime can handle natively. */
  supported: MediaAttachment[];
  /** Media the runtime cannot handle. */
  unsupported: MediaAttachment[];
};

/**
 * Partition media attachments by whether the runtime accepts them.
 *
 * If the runtime does not declare `mediaCapabilities` at all, all media is
 * treated as supported (backwards-compatible — the runtime decides what to do).
 */
export function partitionMedia(runtime: AgentRuntime, media: MediaAttachment[]): MediaPartition {
  const prefixes = runtime.mediaCapabilities?.acceptsInbound;

  // No capability declaration → pass everything through (backwards-compatible)
  if (prefixes === undefined) {
    return { supported: media, unsupported: [] };
  }

  const supported: MediaAttachment[] = [];
  const unsupported: MediaAttachment[] = [];

  for (const attachment of media) {
    const accepted = prefixes.some((prefix) => attachment.mimeType.startsWith(prefix));
    if (accepted) {
      supported.push(attachment);
    } else {
      unsupported.push(attachment);
    }
  }

  return { supported, unsupported };
}

/**
 * Format a user-facing warning for media the runtime cannot handle.
 *
 * Returns `undefined` when there are no unsupported attachments.
 */
export function formatUnsupportedMediaWarning(
  unsupported: MediaAttachment[],
  runtimeName: string,
): string | undefined {
  if (unsupported.length === 0) {
    return undefined;
  }

  const typeSummary = summarizeMediaTypes(unsupported);
  const runtimeLabel = runtimeName.toLowerCase();

  if (unsupported.length === 1) {
    return (
      `\u26a0\ufe0f Your ${typeSummary} was received but the current runtime (${runtimeLabel}) ` +
      `doesn't support ${typeSummary} input. Its content was not included in the conversation.`
    );
  }

  return (
    `\u26a0\ufe0f ${unsupported.length} media attachments were received but the current runtime ` +
    `(${runtimeLabel}) doesn't support them: ${typeSummary}. ` +
    `Their content was not included in the conversation.`
  );
}

/**
 * Produce a human-readable summary of MIME type categories.
 *
 * Groups by top-level type (image, audio, video) and deduplicates.
 * Falls back to "media" for unknown types.
 */
function summarizeMediaTypes(attachments: MediaAttachment[]): string {
  const categories = new Set<string>();
  for (const a of attachments) {
    const topLevel = a.mimeType.split("/")[0];
    switch (topLevel) {
      case "image":
        categories.add("image");
        break;
      case "audio":
        categories.add("audio");
        break;
      case "video":
        categories.add("video");
        break;
      default:
        categories.add("media");
        break;
    }
  }
  return [...categories].toSorted().join("/");
}
