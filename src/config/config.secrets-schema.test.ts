import { describe, expect, it } from "vitest";
import { validateConfigObjectRaw } from "./validation.js";

describe("config secret refs schema", () => {
  it("accepts top-level secrets sources and googlechat serviceAccountRef", () => {
    const result = validateConfigObjectRaw({
      secrets: {
        sources: {
          env: { type: "env" },
          file: { type: "sops", path: "~/.remoteclaw/secrets.enc.json", timeoutMs: 10_000 },
        },
      },
      channels: {
        googlechat: {
          serviceAccountRef: { source: "env", id: "GOOGLE_SERVICE_ACCOUNT" },
        },
      },
    });

    expect(result.ok).toBe(true);
  });

  it("accepts googlechat serviceAccount refs", () => {
    const result = validateConfigObjectRaw({
      channels: {
        googlechat: {
          serviceAccountRef: { source: "file", id: "/channels/googlechat/serviceAccount" },
        },
      },
    });

    expect(result.ok).toBe(true);
  });

  it("rejects invalid secret ref id", () => {
    const result = validateConfigObjectRaw({
      channels: {
        googlechat: {
          serviceAccountRef: { source: "env", id: "bad id with spaces" },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some((issue) => issue.path.includes("channels.googlechat.serviceAccountRef")),
      ).toBe(true);
    }
  });
});
