import { logDebug } from "../logger.js";

/** Error categories for CLI subprocess failures. */
export type ErrorCategory = "retryable" | "fatal" | "context_overflow" | "timeout" | "aborted";

const retryablePatterns: readonly RegExp[] = [
  /rate.?limit/i,
  /429/i,
  /503/i,
  /overloaded/i,
  /ETIMEDOUT/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /network/i,
];

const contextOverflowPatterns: readonly RegExp[] = [
  /context.?length/i,
  /context.?window/i,
  /context.?overflow/i,
  /too many tokens/i,
  /maximum context/i,
  /token.?limit/i,
];

const fatalAuthPatterns: readonly RegExp[] = [
  /401/i,
  /403/i,
  /unauthorized/i,
  /forbidden/i,
  /invalid.?key/i,
  /authentication/i,
];

/**
 * Rate-limit and auth failure patterns that may benefit from key rotation.
 *
 * Includes rate-limit indicators (429, quota) and auth failures
 * (401, invalid key) — a different API key might succeed in either case.
 */
const authRotatablePatterns: readonly RegExp[] = [
  // Rate-limit patterns
  /rate.?limit/i,
  /\b429\b/,
  /quota.?exceeded/i,
  /resource.?exhausted/i,
  /too many requests/i,
  // Auth failure patterns (a different key might work)
  /\b401\b/,
  /unauthorized/i,
  /invalid.?key/i,
];

/**
 * Test whether an error message indicates a rate-limit or auth failure
 * that could be resolved by rotating to a different API key.
 */
export function isAuthRotatableError(message: string): boolean {
  return authRotatablePatterns.some((pattern) => pattern.test(message));
}

/**
 * Classify an error message string into an actionable category.
 *
 * Uses first-match-wins semantics across ordered pattern arrays:
 * 1. Retryable patterns checked first
 * 2. Context overflow patterns checked second
 * 3. Fatal auth patterns checked third
 * 4. Default: "fatal" for unmatched messages
 *
 * Case-insensitive matching throughout.
 */
export function classifyError(message: string): ErrorCategory {
  for (const pattern of retryablePatterns) {
    if (pattern.test(message)) {
      logDebug(`[error-classifier] classified as retryable: ${message.slice(0, 200)}`);
      return "retryable";
    }
  }
  for (const pattern of contextOverflowPatterns) {
    if (pattern.test(message)) {
      logDebug(`[error-classifier] classified as context_overflow: ${message.slice(0, 200)}`);
      return "context_overflow";
    }
  }
  for (const pattern of fatalAuthPatterns) {
    if (pattern.test(message)) {
      logDebug(`[error-classifier] classified as fatal (auth): ${message.slice(0, 200)}`);
      return "fatal";
    }
  }
  logDebug(`[error-classifier] classified as fatal (unmatched): ${message.slice(0, 200)}`);
  return "fatal";
}
