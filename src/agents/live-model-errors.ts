/**
 * Live-provider model error classifiers.
 *
 * Probe and fallback code uses these string checks to distinguish missing or
 * deprecated model ids from generic provider/runtime failures.
 */
/** Returns whether a provider error message indicates a missing or retired model id. */

/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  isModelNotFoundErrorMessage: "live",
} as const;
export function isModelNotFoundErrorMessage(raw: string): boolean {
  const msg = raw.trim();
  if (!msg) {
    return false;
  }
  if (/\b404\b/.test(msg) && /not(?:[_\-\s])?found/i.test(msg)) {
    return true;
  }
  if (/not_found_error/i.test(msg)) {
    return true;
  }
  if (/model:\s*[a-z0-9._-]+/i.test(msg) && /not(?:[_\-\s])?found/i.test(msg)) {
    return true;
  }
  if (/does not exist or you do not have access/i.test(msg)) {
    return true;
  }
  if (/deprecated/i.test(msg) && /upgrade to/i.test(msg)) {
    return true;
  }
  if (/stealth model/i.test(msg) && /find it here/i.test(msg)) {
    return true;
  }
  if (/is not a valid model id/i.test(msg)) {
    return true;
  }
  return false;
}
