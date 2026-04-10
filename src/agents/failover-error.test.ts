import { describe, expect, it } from "vitest";
import {
  describeFailoverError,
  resolveFailoverReasonFromError,
  resolveFailoverStatus,
} from "./failover-error.js";

describe("failover-error", () => {
  it("infers failover reason from HTTP status", () => {
    expect(resolveFailoverReasonFromError({ status: 402 })).toBe("billing");
    expect(resolveFailoverReasonFromError({ statusCode: "429" })).toBe("rate_limit");
    expect(resolveFailoverReasonFromError({ status: 403 })).toBe("auth");
    expect(resolveFailoverReasonFromError({ status: 408 })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ status: 400 })).toBe("format");
    // Transient server errors (502/503/504) should trigger failover as timeout.
    expect(resolveFailoverReasonFromError({ status: 502 })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ status: 503 })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ status: 504 })).toBe("timeout");
    // Anthropic 529 (overloaded) should trigger failover as rate_limit.
    expect(resolveFailoverReasonFromError({ status: 529 })).toBe("rate_limit");
  });

  it("infers timeout from common node error codes", () => {
    expect(resolveFailoverReasonFromError({ code: "ETIMEDOUT" })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ code: "ECONNRESET" })).toBe("timeout");
  });

  it("401/403 with generic message still returns auth (backward compat)", () => {
    expect(resolveFailoverReasonFromError({ status: 401, message: "Unauthorized" })).toBe("auth");
    expect(resolveFailoverReasonFromError({ status: 403, message: "Forbidden" })).toBe("auth");
  });

  it("resolveFailoverStatus maps auth_permanent to 403", () => {
    expect(resolveFailoverStatus("auth_permanent")).toBe(403);
  });

  it("describes non-Error values consistently", () => {
    const described = describeFailoverError(123);
    expect(described.message).toBe("123");
    expect(described.reason).toBeUndefined();
  });
});
