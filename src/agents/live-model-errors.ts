/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  isModelNotFoundErrorMessage: "live",
  isMiniMaxModelNotFoundErrorMessage: "live",
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
  return false;
}

export function isMiniMaxModelNotFoundErrorMessage(raw: string): boolean {
  const msg = raw.trim();
  if (!msg) {
    return false;
  }
  return /\b404\b.*\bpage not found\b/i.test(msg);
}
