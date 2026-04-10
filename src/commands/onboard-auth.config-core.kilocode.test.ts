import { describe, expect, it } from "vitest";
import { resolveApiKeyForProvider, resolveEnvApiKey } from "../auth/provider-auth.js";
import { captureEnv } from "../test-utils/env.js";
import { KILOCODE_BASE_URL } from "./onboard-auth.config-core.js";
import { KILOCODE_DEFAULT_MODEL_REF } from "./onboard-auth.credentials.js";
import {
  buildKilocodeModelDefinition,
  KILOCODE_DEFAULT_MODEL_ID,
  KILOCODE_DEFAULT_CONTEXT_WINDOW,
  KILOCODE_DEFAULT_MAX_TOKENS,
  KILOCODE_DEFAULT_COST,
} from "./onboard-auth.models.js";

describe("Kilo Gateway provider config", () => {
  describe("constants", () => {
    it("KILOCODE_BASE_URL points to kilo openrouter endpoint", () => {
      expect(KILOCODE_BASE_URL).toBe("https://api.kilo.ai/api/gateway/");
    });

    it("KILOCODE_DEFAULT_MODEL_REF includes provider prefix", () => {
      expect(KILOCODE_DEFAULT_MODEL_REF).toBe("kilocode/anthropic/claude-opus-4.6");
    });

    it("KILOCODE_DEFAULT_MODEL_ID is anthropic/claude-opus-4.6", () => {
      expect(KILOCODE_DEFAULT_MODEL_ID).toBe("anthropic/claude-opus-4.6");
    });
  });

  describe("buildKilocodeModelDefinition", () => {
    it("returns correct model shape", () => {
      const model = buildKilocodeModelDefinition();
      expect(model.id).toBe(KILOCODE_DEFAULT_MODEL_ID);
      expect(model.name).toBe("Claude Opus 4.6");
      expect(model.reasoning).toBe(true);
      expect(model.input).toEqual(["text", "image"]);
      expect(model.contextWindow).toBe(KILOCODE_DEFAULT_CONTEXT_WINDOW);
      expect(model.maxTokens).toBe(KILOCODE_DEFAULT_MAX_TOKENS);
      expect(model.cost).toEqual(KILOCODE_DEFAULT_COST);
    });
  });

  describe("env var resolution", () => {
    it("resolves KILOCODE_API_KEY from env", () => {
      const envSnapshot = captureEnv(["KILOCODE_API_KEY"]);
      process.env.KILOCODE_API_KEY = "test-kilo-key";

      try {
        const result = resolveEnvApiKey("kilocode");
        expect(result).not.toBeNull();
        expect(result?.apiKey).toBe("test-kilo-key");
        expect(result?.source).toContain("KILOCODE_API_KEY");
      } finally {
        envSnapshot.restore();
      }
    });

    it("returns null when KILOCODE_API_KEY is not set", () => {
      const envSnapshot = captureEnv(["KILOCODE_API_KEY"]);
      delete process.env.KILOCODE_API_KEY;

      try {
        const result = resolveEnvApiKey("kilocode");
        expect(result).toBeNull();
      } finally {
        envSnapshot.restore();
      }
    });

    it("resolves the kilocode api key via resolveApiKeyForProvider", async () => {
      const envSnapshot = captureEnv(["KILOCODE_API_KEY"]);
      process.env.KILOCODE_API_KEY = "kilo-provider-test-key";

      try {
        const auth = await resolveApiKeyForProvider({
          provider: "kilocode",
        });

        expect(auth.apiKey).toBe("kilo-provider-test-key");
        expect(auth.mode).toBe("api-key");
        expect(auth.source).toContain("KILOCODE_API_KEY");
      } finally {
        envSnapshot.restore();
      }
    });
  });
});
