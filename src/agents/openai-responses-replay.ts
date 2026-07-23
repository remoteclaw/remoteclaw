/** Resolves the assistant message id that can be replayed to OpenAI Responses. */

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  resolveReplayableResponsesMessageId: "live",
} as const;
export function resolveReplayableResponsesMessageId(params: {
  replayResponsesItemIds: boolean;
  textSignatureId?: string;
  fallbackId: string;
  fallbackOrdinal: number;
  previousReplayItemWasReasoning: boolean;
}): string | undefined {
  if (!params.replayResponsesItemIds) {
    return undefined;
  }
  if (!params.textSignatureId) {
    // Id-less text signatures get a deterministic synthetic id per fallback
    // ordinal; signed text can only replay when paired with preceding reasoning.
    return params.fallbackOrdinal === 0
      ? params.fallbackId
      : `${params.fallbackId}_${params.fallbackOrdinal}`;
  }
  return params.previousReplayItemWasReasoning ? params.textSignatureId : undefined;
}
