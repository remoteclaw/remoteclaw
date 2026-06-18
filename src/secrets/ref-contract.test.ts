import { describe, expect, it } from "vitest";
import type { SecretRef } from "../config/types.secrets.js";
import { validateSecretRefShape } from "./ref-contract.js";

describe("validateSecretRefShape", () => {
  it("accepts well-formed refs for every source", () => {
    const valid: SecretRef[] = [
      { source: "env", provider: "default", id: "OPENAI_API_KEY" },
      { source: "file", provider: "mounted-json", id: "/providers/openai/apiKey" },
      { source: "file", provider: "default", id: "value" },
      { source: "exec", provider: "vault", id: "openai/api-key" },
    ];
    for (const ref of valid) {
      expect(validateSecretRefShape(ref)).toEqual({ ok: true });
    }
  });

  it("does not reject on the provider alias (it is only a lookup key, not a use-surface)", () => {
    // A non-kebab provider name is a free-form lookup key for the resolution
    // engine; only the id is validated here.
    expect(
      validateSecretRefShape({ source: "exec", provider: "customProvider", id: "openai/api-key" }),
    ).toEqual({ ok: true });
  });

  it("rejects an env id that is not SCREAMING_SNAKE_CASE", () => {
    expect(
      validateSecretRefShape({ source: "env", provider: "default", id: "lower_bad" }),
    ).toMatchObject({ ok: false, reason: "env-id" });
    expect(
      validateSecretRefShape({ source: "env", provider: "default", id: "WITH-DASH" }),
    ).toMatchObject({ ok: false, reason: "env-id" });
  });

  it('rejects a file id that is neither an absolute JSON pointer nor "value"', () => {
    expect(
      validateSecretRefShape({ source: "file", provider: "default", id: "relative/path" }),
    ).toMatchObject({ ok: false, reason: "file-id" });
  });

  it("rejects an exec id that fails the character pattern", () => {
    expect(
      validateSecretRefShape({ source: "exec", provider: "vault", id: "-leading-dash" }),
    ).toMatchObject({ ok: false, reason: "exec-id-pattern" });
  });

  it("rejects an exec id containing a path-traversal segment", () => {
    // Passes the character pattern but resolves a "../" segment — the case the
    // raw pattern check alone would miss.
    expect(
      validateSecretRefShape({ source: "exec", provider: "vault", id: "vault/../secret" }),
    ).toMatchObject({ ok: false, reason: "exec-id-traversal-segment" });
  });

  it("carries a human-readable message on failure", () => {
    const result = validateSecretRefShape({ source: "env", provider: "default", id: "lower_bad" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/A-Z/);
    }
  });
});
