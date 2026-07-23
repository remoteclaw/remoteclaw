/** Normalizes accepted child-session spawn results from loose tool payloads. */
import { asOptionalRecord } from "@remoteclaw/normalization-core/record-coerce";
import { normalizeOptionalString } from "@remoteclaw/normalization-core/string-coerce";

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  normalizeAcceptedSessionSpawnResult: "live",
  hasAcceptedSessionSpawn: "live",
} as const;

// Helpers for recognizing accepted session-spawn tool results in loosely typed
// tool payloads and persisted delivery metadata.
export type AcceptedSessionSpawn = {
  runId: string;
  childSessionKey: string;
};

/** Normalize a tool result that accepted a child session spawn. */
export function normalizeAcceptedSessionSpawnResult(result: unknown): AcceptedSessionSpawn | null {
  const details = asOptionalRecord(asOptionalRecord(result)?.details);
  if (!details || details.status !== "accepted") {
    return null;
  }
  const runId = normalizeOptionalString(details.runId);
  const childSessionKey = normalizeOptionalString(details.childSessionKey);
  if (!runId || !childSessionKey) {
    return null;
  }
  return { runId, childSessionKey };
}

/** Return true when a collection contains at least one accepted child spawn. */
export function hasAcceptedSessionSpawn(acceptedSessionSpawns?: readonly unknown[]): boolean {
  return (acceptedSessionSpawns ?? []).some((spawn) => {
    const record = asOptionalRecord(spawn);
    if (!record) {
      return false;
    }
    return Boolean(
      normalizeOptionalString(record.runId) && normalizeOptionalString(record.childSessionKey),
    );
  });
}
