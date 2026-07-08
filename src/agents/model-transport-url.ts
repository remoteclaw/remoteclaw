/**
 * Runtime attestation (ADR 0005 H9). Declares the implementation status
 * of each runtime export in this module. See CONTRIBUTING.md § Module
 * attestations for the category definitions and the convention for
 * updating these when sync or rebrand changes the surface.
 */
export const MODULE_ATTESTATIONS = {
  formatModelTransportDebugUrl: "live",
  formatModelTransportDebugBaseUrl: "live",
} as const;

export function formatModelTransportDebugUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "<invalid-url>";
  }
}

export function formatModelTransportDebugBaseUrl(rawUrl: string | undefined): string {
  return rawUrl ? formatModelTransportDebugUrl(rawUrl) : "default";
}
