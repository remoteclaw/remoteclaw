import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logDebug } from "../logger.js";
import { fetchRemoteMedia } from "../media/fetch.js";
import { detectMime, extensionForMime } from "../media/mime.js";
import type { MediaAttachment } from "./types.js";

/** Max download size for inbound channel media (100 MB). */
const MAX_INBOUND_MEDIA_BYTES = 100 * 1024 * 1024;

/**
 * Resolve an array of media URLs (HTTP or local paths) into MediaAttachment
 * objects suitable for passing to {@link AgentRuntime.execute}.
 *
 * Remote URLs are downloaded into `tempDir` so that CLI runtimes can access
 * them as local files.  Local paths are validated for MIME type only.
 *
 * Individual resolution failures are silently skipped — a single bad URL
 * should not prevent the rest of the message from being processed.
 */
export async function resolveMediaAttachments(
  mediaUrls: string[],
  tempDir: string,
): Promise<MediaAttachment[]> {
  const results: MediaAttachment[] = [];
  for (const [index, url] of mediaUrls.entries()) {
    try {
      const attachment = await resolveOne(url, tempDir, index);
      if (attachment) {
        logDebug(
          `[media-resolver] resolved: url=${url} mime=${attachment.mimeType} path=${attachment.filePath}`,
        );
        results.push(attachment);
      }
    } catch (err) {
      logDebug(`[media-resolver] failed: url=${url} error=${String(err)}`);
      // Skip unresolvable media; don't block the entire message.
    }
  }
  return results;
}

async function resolveOne(
  url: string,
  tempDir: string,
  index: number,
): Promise<MediaAttachment | undefined> {
  if (/^https?:\/\//i.test(url)) {
    return downloadRemote(url, tempDir, index);
  }
  // Local file path — detect MIME from extension, keep original path.
  return resolveLocal(url);
}

async function downloadRemote(
  url: string,
  tempDir: string,
  index: number,
): Promise<MediaAttachment> {
  const fetched = await fetchRemoteMedia({ url, maxBytes: MAX_INBOUND_MEDIA_BYTES });
  const mimeType = fetched.contentType ?? "application/octet-stream";
  const ext = extensionForMime(mimeType) ?? "";
  const fileName = `inbound-media-${index}${ext}`;
  const filePath = join(tempDir, fileName);
  await writeFile(filePath, fetched.buffer);
  return {
    mimeType,
    filePath,
    sourceUrl: url,
    fileName: fetched.fileName ?? fileName,
  };
}

async function resolveLocal(filePath: string): Promise<MediaAttachment> {
  const mimeType = (await detectMime({ filePath })) ?? "application/octet-stream";
  return {
    mimeType,
    filePath,
  };
}
