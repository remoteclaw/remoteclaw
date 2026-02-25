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
      return "retryable";
    }
  }
  for (const pattern of contextOverflowPatterns) {
    if (pattern.test(message)) {
      return "context_overflow";
    }
  }
  for (const pattern of fatalAuthPatterns) {
    if (pattern.test(message)) {
      return "fatal";
    }
  }
  return "fatal";
}
