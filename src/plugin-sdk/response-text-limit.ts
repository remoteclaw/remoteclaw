// Bounded response-body text reader for adapters that surface HTTP error details.
//
// This duplicates `readResponseTextLimited` in `src/agents/provider-http-errors.ts` — deliberately.
// That module still exists in the fork, but it sits in the `src/agents/` execution-engine layer
// RemoteClaw is replacing, its only importer is its own test, and it pulls in @remoteclaw/media-core,
// packages/normalization-core, and src/logging/redact. Channel adapters are a kept surface and must
// not take a dependency on a layer scheduled for removal, so the kept plugin-sdk layer carries its
// own copy. The logic is pure Web API (Response / ReadableStream / TextDecoder) and has no imports
// at all, which is what makes the duplication cheap.
//
// Keep the two in sync until `src/agents/provider-http-errors.ts` is gutted, at which point this
// becomes the sole definition. No gate enforces that today.
//
// Import this from extensions by relative path, as extensions/mattermost does. There is no
// `./plugin-sdk/response-text-limit` key in package.json exports (57 explicit keys, no wildcard),
// so a bare `remoteclaw/plugin-sdk/response-text-limit` specifier would resolve under vitest — which
// auto-aliases local subpaths — and then fail at runtime with ERR_PACKAGE_PATH_NOT_EXPORTED.

/**
 * Reads at most `limitBytes` from a response body instead of buffering the whole thing.
 *
 * Adapters call this on error paths, where the body is influenced by a remote endpoint the
 * operator configured but the fork does not control: `res.text()` / `res.json()` would read an
 * arbitrarily large error body straight into memory. Once the budget is spent the stream is
 * cancelled so the upstream producer stops sending rather than idling on a full buffer.
 *
 * Returns `""` when the budget is non-positive or the response carries no readable body — callers
 * that need to distinguish "empty body" from "no body" should check `response.body` themselves.
 */
export async function readResponseTextLimited(
  response: Response,
  limitBytes = 16 * 1024,
): Promise<string> {
  if (limitBytes <= 0) {
    return "";
  }
  const reader = response.body?.getReader();
  if (!reader) {
    return "";
  }

  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  let reachedLimit = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.byteLength === 0) {
        continue;
      }
      const remaining = limitBytes - total;
      if (remaining <= 0) {
        reachedLimit = true;
        break;
      }
      const chunk = value.byteLength > remaining ? value.subarray(0, remaining) : value;
      total += chunk.byteLength;
      text += decoder.decode(chunk, { stream: true });
      if (total >= limitBytes) {
        reachedLimit = true;
        break;
      }
    }
    // Flush any trailing partial multi-byte sequence left by a truncated chunk.
    text += decoder.decode();
  } finally {
    if (reachedLimit) {
      // Stop the upstream body once the diagnostic budget is full.
      await reader.cancel().catch(() => undefined);
    }
    try {
      reader.releaseLock();
    } catch {}
  }

  return text;
}
