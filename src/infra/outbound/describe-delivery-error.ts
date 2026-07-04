/**
 * Stringify a delivery error for the queue's `lastError` record and failed-entry
 * moves. Falls back to `err.message` (or `String(err)`), but when the error
 * carries the structured scope metadata Slack's `@slack/web-api` `CodedError`
 * attaches on a `missing_scope` failure — `data.needed` (the missing scope) and
 * `data.response_metadata.scopes` (the granted scopes) — append it so a stuck
 * queue entry names the scope to add instead of the opaque
 * "An API error occurred: missing_scope" (#2098).
 *
 * Duck-typed on the field shape, so the generic outbound layer stays
 * channel-agnostic: any error exposing those fields is enriched, and errors
 * without them are returned unchanged.
 */
export function describeDeliveryError(err: unknown): string {
  const base = err instanceof Error ? err.message : String(err);
  const detail = extractScopeDetail(err);
  return detail ? `${base} (${detail})` : base;
}

function extractScopeDetail(err: unknown): string | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const data = (err as { data?: unknown }).data;
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const parts: string[] = [];
  const needed = (data as { needed?: unknown }).needed;
  if (typeof needed === "string" && needed.trim()) {
    parts.push(`missing scope: ${needed.trim()}`);
  }
  const responseMetadata = (data as { response_metadata?: unknown }).response_metadata;
  const scopes =
    responseMetadata && typeof responseMetadata === "object"
      ? (responseMetadata as { scopes?: unknown }).scopes
      : undefined;
  if (Array.isArray(scopes)) {
    const granted = scopes.filter((scope): scope is string => typeof scope === "string");
    if (granted.length > 0) {
      parts.push(`granted: ${granted.join(", ")}`);
    }
  }
  return parts.length > 0 ? parts.join("; ") : undefined;
}
