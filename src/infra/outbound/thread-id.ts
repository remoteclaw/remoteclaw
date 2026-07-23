// Thread id helpers normalize channel topic/thread identifiers before payload
// construction and route matching.
import { normalizeOptionalStringifiedId } from "@remoteclaw/normalization-core/string-coerce";

/** Normalizes channel thread/topic ids before outbound payload construction. */
export function normalizeOutboundThreadId(value?: string | number | null): string | undefined {
  return normalizeOptionalStringifiedId(value);
}
