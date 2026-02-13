import type { ErrorCategory } from "./types.js";

const RETRYABLE_PATTERNS = [
  /rate.?limit/i,
  /\b429\b/,
  /\b503\b/,
  /overloaded/i,
  /ETIMEDOUT/,
  /ECONNRESET/,
  /ECONNREFUSED/,
  /network/i,
];

const CONTEXT_OVERFLOW_PATTERNS = [
  /context.?(length|window|overflow)/i,
  /too many tokens/i,
  /maximum context/i,
  /token limit/i,
];

const FATAL_AUTH_PATTERNS = [
  /\b401\b/,
  /\b403\b/,
  /unauthorized/i,
  /forbidden/i,
  /invalid.?key/i,
  /authentication/i,
];

export function classifyError(message: string): ErrorCategory {
  for (const pattern of RETRYABLE_PATTERNS) {
    if (pattern.test(message)) {
      return "retryable";
    }
  }
  for (const pattern of CONTEXT_OVERFLOW_PATTERNS) {
    if (pattern.test(message)) {
      return "context_overflow";
    }
  }
  for (const pattern of FATAL_AUTH_PATTERNS) {
    if (pattern.test(message)) {
      return "fatal";
    }
  }
  return "fatal";
}
