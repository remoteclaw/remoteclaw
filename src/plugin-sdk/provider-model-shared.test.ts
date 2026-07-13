import { normalizeProviderId } from "remoteclaw/plugin-sdk/provider-model-shared";
import { describe, expect, it } from "vitest";

describe("plugin-sdk/provider-model-shared", () => {
  it("re-exports normalizeProviderId (trim + lowercase)", () => {
    expect(normalizeProviderId("  Anthropic  ")).toBe("anthropic");
  });

  it("re-exports normalizeProviderId (alias canonicalization)", () => {
    expect(normalizeProviderId("Z.AI")).toBe("zai");
  });
});
