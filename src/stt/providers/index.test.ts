import { describe, expect, it } from "vitest";
import { buildSttProviderRegistry, getSttProvider, normalizeSttProviderId } from "./index.js";

describe("normalizeSttProviderId", () => {
  it("maps gemini to google", () => {
    expect(normalizeSttProviderId("gemini")).toBe("google");
  });

  it("returns normalized provider id", () => {
    expect(normalizeSttProviderId("openai")).toBe("openai");
    expect(normalizeSttProviderId("deepgram")).toBe("deepgram");
  });
});

describe("buildSttProviderRegistry", () => {
  it("includes all default STT providers", () => {
    const registry = buildSttProviderRegistry();
    expect(registry.has("openai")).toBe(true);
    expect(registry.has("deepgram")).toBe(true);
    expect(registry.has("google")).toBe(true);
    expect(registry.has("groq")).toBe(true);
    expect(registry.has("mistral")).toBe(true);
  });

  it("allows overriding providers", () => {
    const custom = {
      id: "openai",
      transcribeAudio: async () => ({ text: "custom", model: "custom" }),
    };
    const registry = buildSttProviderRegistry({ openai: custom });
    expect(registry.get("openai")).toBe(custom);
  });
});

describe("getSttProvider", () => {
  it("returns provider by id", () => {
    const registry = buildSttProviderRegistry();
    const provider = getSttProvider("openai", registry);
    expect(provider).toBeDefined();
    expect(provider?.id).toBe("openai");
  });

  it("normalizes gemini to google", () => {
    const registry = buildSttProviderRegistry();
    const provider = getSttProvider("gemini", registry);
    expect(provider).toBeDefined();
    expect(provider?.id).toBe("google");
  });

  it("returns undefined for unknown provider", () => {
    const registry = buildSttProviderRegistry();
    expect(getSttProvider("unknown-provider", registry)).toBeUndefined();
  });
});
