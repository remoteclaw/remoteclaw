import { describe, expect, it } from "vitest";
import {
  INVALID_EXEC_SECRET_REF_IDS,
  VALID_EXEC_SECRET_REF_IDS,
} from "../test-utils/secret-ref-test-vectors.js";
import { validateConfigObjectRaw } from "./validation.js";

function validateOpenAiApiKeyRef(ref: { source: string; provider?: string; id: string }) {
  return validateConfigObjectRaw({
    models: {
      providers: {
        openai: {
          apiKey: ref,
        },
      },
    },
  });
}

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

  it("rejects env refs that are not env var names", () => {
    const result = validateConfigObjectRaw({
      channels: {
        googlechat: {
          serviceAccountRef: { source: "env", id: "/channels/googlechat/serviceAccount" },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (issue) =>
            issue.path.includes("channels.googlechat.serviceAccountRef") &&
            issue.message.includes("Env secret reference id"),
        ),
      ).toBe(true);
    }
  });

  it("rejects file refs that are not absolute JSON pointers", () => {
    const result = validateConfigObjectRaw({
      channels: {
        googlechat: {
          serviceAccountRef: { source: "file", id: "channels/googlechat/serviceAccount" },
        },
      },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.issues.some(
          (issue) =>
            issue.path.includes("channels.googlechat.serviceAccountRef") &&
            issue.message.includes("absolute JSON pointer"),
        ),
      ).toBe(true);
    }
  });

  it("accepts valid exec secret reference ids", () => {
    for (const id of VALID_EXEC_SECRET_REF_IDS) {
      const result = validateOpenAiApiKeyRef({
        source: "exec",
        provider: "vault",
        id,
      });
      expect(result.ok, `expected valid exec ref id: ${id}`).toBe(true);
    }
  });

  it("rejects invalid exec secret reference ids", () => {
    for (const id of INVALID_EXEC_SECRET_REF_IDS) {
      const result = validateOpenAiApiKeyRef({
        source: "exec",
        provider: "vault",
        id,
      });
      expect(result.ok, `expected invalid exec ref id: ${id}`).toBe(false);
      if (!result.ok) {
        expect(
          result.issues.some((issue) => issue.path.includes("models.providers.openai.apiKey")),
        ).toBe(true);
      }
    }
  });
});
