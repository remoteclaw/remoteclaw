/**
 * Normalize a speech provider ID to a canonical form.
 * Fork stub — upstream has a full provider registry; the fork
 * passes through the provider string as-is.
 */
export function normalizeSpeechProviderId(raw: string): string {
  return raw.trim().toLowerCase();
}
