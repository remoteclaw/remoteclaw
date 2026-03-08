import { describe, expect, it } from "vitest";
import { type ErrorCategory, classifyError, isAuthRotatableError } from "./error-classifier.js";

describe("classifyError", () => {
  describe("retryable classification", () => {
    it.each([
      ["rate limit", "rate limit exceeded"],
      ["rate_limit", "rate_limit exceeded"],
      ["Rate Limit", "Rate Limit Exceeded"],
      ["ratelimit", "ratelimit error"],
    ])("classifies rate limit variant %s as retryable", (_label, message) => {
      expect(classifyError(message)).toBe("retryable");
    });

    it.each([
      ["429", "HTTP 429 Too Many Requests"],
      ["503", "HTTP 503 Service Unavailable"],
    ])("classifies HTTP %s as retryable", (_code, message) => {
      expect(classifyError(message)).toBe("retryable");
    });

    it("classifies overloaded as retryable", () => {
      expect(classifyError("API is overloaded")).toBe("retryable");
    });

    it.each([
      ["ETIMEDOUT", "connect ETIMEDOUT 10.0.0.1:443"],
      ["ECONNRESET", "read ECONNRESET"],
      ["ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:8080"],
      ["network error", "network error occurred"],
    ])("classifies network error %s as retryable", (_label, message) => {
      expect(classifyError(message)).toBe("retryable");
    });
  });

  describe("context overflow classification", () => {
    it.each([
      ["context length", "context length exceeded"],
      ["context_length", "context_length exceeded"],
      ["context window", "context window exceeded"],
      ["context_window", "context_window exceeded"],
      ["context overflow", "context overflow error"],
      ["context_overflow", "context_overflow detected"],
    ])("classifies %s as context_overflow", (_label, message) => {
      expect(classifyError(message)).toBe("context_overflow");
    });

    it("classifies too many tokens as context_overflow", () => {
      expect(classifyError("too many tokens in request")).toBe("context_overflow");
    });

    it("classifies maximum context as context_overflow", () => {
      expect(classifyError("maximum context length reached")).toBe("context_overflow");
    });

    it.each([
      ["token limit", "token limit exceeded"],
      ["token_limit", "token_limit reached"],
    ])("classifies %s as context_overflow", (_label, message) => {
      expect(classifyError(message)).toBe("context_overflow");
    });
  });

  describe("fatal classification", () => {
    it.each([
      ["401", "HTTP 401 Unauthorized"],
      ["403", "HTTP 403 Forbidden"],
    ])("classifies HTTP %s as fatal", (_code, message) => {
      expect(classifyError(message)).toBe("fatal");
    });

    it.each([
      ["unauthorized", "unauthorized access denied"],
      ["Unauthorized", "Unauthorized request"],
    ])("classifies %s as fatal", (_label, message) => {
      expect(classifyError(message)).toBe("fatal");
    });

    it.each([
      ["forbidden", "forbidden resource"],
      ["Forbidden", "Forbidden: insufficient permissions"],
    ])("classifies %s as fatal", (_label, message) => {
      expect(classifyError(message)).toBe("fatal");
    });

    it.each([
      ["invalid key", "invalid key provided"],
      ["invalid_key", "invalid_key: check your API key"],
    ])("classifies %s as fatal", (_label, message) => {
      expect(classifyError(message)).toBe("fatal");
    });

    it("classifies authentication failed as fatal", () => {
      expect(classifyError("authentication failed")).toBe("fatal");
    });
  });

  describe("default behavior", () => {
    it("classifies unknown error messages as fatal", () => {
      expect(classifyError("something went wrong")).toBe("fatal");
    });

    it("classifies empty string as fatal", () => {
      expect(classifyError("")).toBe("fatal");
    });
  });

  describe("case insensitivity", () => {
    it.each([
      ["RATE LIMIT", "retryable"],
      ["Rate Limit", "retryable"],
      ["rate limit", "retryable"],
      ["OVERLOADED", "retryable"],
      ["Overloaded", "retryable"],
      ["CONTEXT LENGTH", "context_overflow"],
      ["Context Length", "context_overflow"],
      ["TOO MANY TOKENS", "context_overflow"],
      ["Too Many Tokens", "context_overflow"],
      ["UNAUTHORIZED", "fatal"],
      ["Unauthorized", "fatal"],
      ["AUTHENTICATION", "fatal"],
      ["Authentication", "fatal"],
    ] as [string, ErrorCategory][])(
      "classifies %s correctly regardless of case",
      (message, expected) => {
        expect(classifyError(message)).toBe(expected);
      },
    );
  });

  describe("first-match-wins verification", () => {
    it("classifies as retryable when message matches both retryable and fatal patterns", () => {
      // "429 unauthorized" matches retryable (429) and fatal (unauthorized)
      expect(classifyError("429 unauthorized")).toBe("retryable");
    });

    it("classifies as retryable when message matches both retryable and context_overflow patterns", () => {
      // "network context length" matches retryable (network) and context_overflow (context length)
      expect(classifyError("network context length exceeded")).toBe("retryable");
    });

    it("classifies as context_overflow when message matches both context_overflow and fatal patterns", () => {
      // "context length 401" matches context_overflow (context length) and fatal (401)
      expect(classifyError("context length 401")).toBe("context_overflow");
    });
  });

  describe("type completeness", () => {
    it("ErrorCategory type includes timeout and aborted", () => {
      // Type-level check: these assignments must compile
      const timeout: ErrorCategory = "timeout";
      const aborted: ErrorCategory = "aborted";
      expect(timeout).toBe("timeout");
      expect(aborted).toBe("aborted");
    });

    it("classifyError never returns timeout or aborted", () => {
      // The classifier only returns retryable, context_overflow, or fatal
      const testMessages = [
        "timeout",
        "aborted",
        "execution aborted",
        "watchdog timeout",
        "rate limit",
        "context length",
        "unauthorized",
        "unknown error",
        "",
      ];
      for (const msg of testMessages) {
        const result = classifyError(msg);
        expect(result).not.toBe("timeout");
        expect(result).not.toBe("aborted");
      }
    });
  });
});

describe("isAuthRotatableError", () => {
  describe("rate-limit patterns", () => {
    it.each([
      ["rate limit", "rate limit exceeded"],
      ["rate_limit", "rate_limit exceeded"],
      ["Rate Limit", "Rate Limit Error"],
      ["ratelimit", "ratelimit hit"],
    ])("detects rate-limit variant %s", (_label, message) => {
      expect(isAuthRotatableError(message)).toBe(true);
    });

    it("detects HTTP 429", () => {
      expect(isAuthRotatableError("HTTP 429 Too Many Requests")).toBe(true);
    });

    it("does not match 429 embedded in other numbers", () => {
      expect(isAuthRotatableError("error code 14291")).toBe(false);
    });

    it.each([
      ["quota exceeded", "quota exceeded for today"],
      ["quota_exceeded", "quota_exceeded: try again later"],
    ])("detects quota pattern %s", (_label, message) => {
      expect(isAuthRotatableError(message)).toBe(true);
    });

    it.each([
      ["resource exhausted", "resource exhausted: billing limit"],
      ["resource_exhausted", "resource_exhausted error"],
    ])("detects resource exhausted pattern %s", (_label, message) => {
      expect(isAuthRotatableError(message)).toBe(true);
    });

    it("detects too many requests", () => {
      expect(isAuthRotatableError("too many requests")).toBe(true);
    });
  });

  describe("auth failure patterns", () => {
    it("detects HTTP 401", () => {
      expect(isAuthRotatableError("HTTP 401 Unauthorized")).toBe(true);
    });

    it("does not match 401 embedded in other numbers", () => {
      expect(isAuthRotatableError("error code 14011")).toBe(false);
    });

    it.each([
      ["unauthorized", "unauthorized access denied"],
      ["Unauthorized", "Unauthorized request"],
    ])("detects %s", (_label, message) => {
      expect(isAuthRotatableError(message)).toBe(true);
    });

    it.each([
      ["invalid key", "invalid key provided"],
      ["invalid_key", "invalid_key: check your API key"],
    ])("detects %s", (_label, message) => {
      expect(isAuthRotatableError(message)).toBe(true);
    });
  });

  describe("non-rotatable errors", () => {
    it("does not match generic errors", () => {
      expect(isAuthRotatableError("something went wrong")).toBe(false);
    });

    it("does not match context overflow", () => {
      expect(isAuthRotatableError("context length exceeded")).toBe(false);
    });

    it("does not match network errors", () => {
      expect(isAuthRotatableError("ECONNRESET")).toBe(false);
    });

    it("does not match empty string", () => {
      expect(isAuthRotatableError("")).toBe(false);
    });
  });
});
