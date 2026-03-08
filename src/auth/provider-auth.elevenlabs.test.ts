import { describe, expect, it } from "vitest";
import { captureEnv } from "../test-utils/env.js";
import { resolveEnvApiKey } from "./provider-auth.js";

describe("resolveEnvApiKey — elevenlabs", () => {
  it("resolves ELEVENLABS_API_KEY from env", () => {
    const envSnapshot = captureEnv(["ELEVENLABS_API_KEY", "XI_API_KEY"]);
    process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key";
    delete process.env.XI_API_KEY;

    try {
      const result = resolveEnvApiKey("elevenlabs");
      expect(result).not.toBeNull();
      expect(result?.apiKey).toBe("test-elevenlabs-key");
      expect(result?.source).toContain("ELEVENLABS_API_KEY");
    } finally {
      envSnapshot.restore();
    }
  });

  it("falls back to XI_API_KEY when ELEVENLABS_API_KEY is not set", () => {
    const envSnapshot = captureEnv(["ELEVENLABS_API_KEY", "XI_API_KEY"]);
    delete process.env.ELEVENLABS_API_KEY;
    process.env.XI_API_KEY = "test-xi-key";

    try {
      const result = resolveEnvApiKey("elevenlabs");
      expect(result).not.toBeNull();
      expect(result?.apiKey).toBe("test-xi-key");
      expect(result?.source).toContain("XI_API_KEY");
    } finally {
      envSnapshot.restore();
    }
  });

  it("prefers ELEVENLABS_API_KEY over XI_API_KEY", () => {
    const envSnapshot = captureEnv(["ELEVENLABS_API_KEY", "XI_API_KEY"]);
    process.env.ELEVENLABS_API_KEY = "primary-key";
    process.env.XI_API_KEY = "legacy-key";

    try {
      const result = resolveEnvApiKey("elevenlabs");
      expect(result).not.toBeNull();
      expect(result?.apiKey).toBe("primary-key");
      expect(result?.source).toContain("ELEVENLABS_API_KEY");
    } finally {
      envSnapshot.restore();
    }
  });

  it("returns null when neither env var is set", () => {
    const envSnapshot = captureEnv(["ELEVENLABS_API_KEY", "XI_API_KEY"]);
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.XI_API_KEY;

    try {
      const result = resolveEnvApiKey("elevenlabs");
      expect(result).toBeNull();
    } finally {
      envSnapshot.restore();
    }
  });
});
