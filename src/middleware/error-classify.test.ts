import { describe, expect, it } from "vitest";
import { classifyError } from "./error-classify.js";

describe("classifyError", () => {
  it("classifies rate limit errors as retryable", () => {
    expect(classifyError("rate limit exceeded")).toBe("retryable");
    expect(classifyError("Rate Limit")).toBe("retryable");
    expect(classifyError("rate_limit_error")).toBe("retryable");
  });

  it("classifies HTTP 429/503 as retryable", () => {
    expect(classifyError("HTTP 429 Too Many Requests")).toBe("retryable");
    expect(classifyError("Service Unavailable 503")).toBe("retryable");
  });

  it("classifies overloaded as retryable", () => {
    expect(classifyError("API is overloaded")).toBe("retryable");
  });

  it("classifies network errors as retryable", () => {
    expect(classifyError("ETIMEDOUT")).toBe("retryable");
    expect(classifyError("ECONNRESET")).toBe("retryable");
    expect(classifyError("ECONNREFUSED")).toBe("retryable");
    expect(classifyError("network error")).toBe("retryable");
  });

  it("classifies context overflow errors", () => {
    expect(classifyError("context length exceeded")).toBe("context_overflow");
    expect(classifyError("context window")).toBe("context_overflow");
    expect(classifyError("context overflow")).toBe("context_overflow");
    expect(classifyError("too many tokens")).toBe("context_overflow");
    expect(classifyError("maximum context reached")).toBe("context_overflow");
    expect(classifyError("token limit exceeded")).toBe("context_overflow");
  });

  it("classifies auth errors as fatal", () => {
    expect(classifyError("HTTP 401")).toBe("fatal");
    expect(classifyError("HTTP 403")).toBe("fatal");
    expect(classifyError("unauthorized")).toBe("fatal");
    expect(classifyError("forbidden")).toBe("fatal");
    expect(classifyError("invalid key")).toBe("fatal");
    expect(classifyError("invalid_key")).toBe("fatal");
    expect(classifyError("authentication failed")).toBe("fatal");
  });

  it("defaults to fatal for unknown errors", () => {
    expect(classifyError("something went wrong")).toBe("fatal");
    expect(classifyError("")).toBe("fatal");
  });
});
