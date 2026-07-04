import { describe, expect, it } from "vitest";
import { isPermanentDeliveryError } from "./delivery-queue.js";
import { describeDeliveryError } from "./describe-delivery-error.js";

describe("describeDeliveryError", () => {
  it("returns the message for a plain Error", () => {
    expect(describeDeliveryError(new Error("boom"))).toBe("boom");
  });

  it("stringifies a non-Error value", () => {
    expect(describeDeliveryError("nope")).toBe("nope");
    expect(describeDeliveryError(undefined)).toBe("undefined");
  });

  it("enriches a Slack missing_scope CodedError with the needed and granted scopes (#2098)", () => {
    const err = Object.assign(new Error("An API error occurred: missing_scope"), {
      code: "slack_webapi_platform_error",
      data: {
        ok: false,
        error: "missing_scope",
        needed: "channels:history",
        provided: "chat:write",
        response_metadata: { scopes: ["chat:write", "channels:read"] },
      },
    });
    expect(describeDeliveryError(err)).toBe(
      "An API error occurred: missing_scope (missing scope: channels:history; granted: chat:write, channels:read)",
    );
  });

  it("falls back to the base message when structured scope fields are absent", () => {
    const err = Object.assign(new Error("An API error occurred: channel_not_found"), {
      data: { ok: false, error: "channel_not_found" },
    });
    expect(describeDeliveryError(err)).toBe("An API error occurred: channel_not_found");
  });

  it("emits only the missing scope when granted scopes are unavailable", () => {
    const err = Object.assign(new Error("missing_scope"), {
      data: { needed: "files:write" },
    });
    expect(describeDeliveryError(err)).toBe("missing_scope (missing scope: files:write)");
  });
});

describe("isPermanentDeliveryError (#2098)", () => {
  it("treats missing_scope as permanent so recovery stops retrying it", () => {
    expect(isPermanentDeliveryError("An API error occurred: missing_scope")).toBe(true);
    // The enriched form still classifies as permanent (the base code survives).
    const enriched = describeDeliveryError(
      Object.assign(new Error("An API error occurred: missing_scope"), {
        data: { needed: "channels:history" },
      }),
    );
    expect(isPermanentDeliveryError(enriched)).toBe(true);
  });

  it("keeps a transient error retryable", () => {
    expect(isPermanentDeliveryError("socket hang up")).toBe(false);
  });
});
