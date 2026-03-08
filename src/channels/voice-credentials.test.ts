import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/provider-auth.js", () => ({
  resolveApiKeyForProvider: vi.fn(),
}));

vi.mock("../tts/tts.js", () => ({
  resolveTtsConfig: vi.fn(() => ({
    edge: { enabled: true },
  })),
  isTtsProviderConfigured: vi.fn(),
  TTS_PROVIDERS: ["openai", "elevenlabs", "edge"],
}));

import { resolveApiKeyForProvider } from "../auth/provider-auth.js";
import type { RemoteClawConfig } from "../config/config.js";
import { isTtsProviderConfigured } from "../tts/tts.js";
import {
  checkSttCredentials,
  checkTtsCredentials,
  validateVoiceCredentials,
} from "./voice-credentials.js";

const mockResolveApiKey = vi.mocked(resolveApiKeyForProvider);
const mockIsTtsConfigured = vi.mocked(isTtsProviderConfigured);

const emptyCfg = {} as RemoteClawConfig;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkSttCredentials", () => {
  it("returns available when a provider has a valid API key", async () => {
    mockResolveApiKey.mockRejectedValueOnce(new Error("no key")); // openai
    mockResolveApiKey.mockResolvedValueOnce({
      apiKey: "gsk-test",
      source: "profile:groq",
      mode: "api-key",
    }); // groq

    const result = await checkSttCredentials();
    expect(result.available).toBe(true);
    expect(result.provider).toBe("groq");
  });

  it("returns unavailable when no provider has credentials", async () => {
    mockResolveApiKey.mockRejectedValue(new Error("no key"));

    const result = await checkSttCredentials();
    expect(result.available).toBe(false);
    expect(result.provider).toBeUndefined();
  });

  it("returns first available provider", async () => {
    mockResolveApiKey.mockResolvedValueOnce({
      apiKey: "sk-test",
      source: "env:OPENAI_API_KEY",
      mode: "api-key",
    }); // openai

    const result = await checkSttCredentials();
    expect(result.available).toBe(true);
    expect(result.provider).toBe("openai");
  });

  it("skips providers that return no apiKey", async () => {
    mockResolveApiKey.mockResolvedValueOnce({
      apiKey: undefined,
      source: "env",
      mode: "api-key",
    }); // openai
    mockResolveApiKey.mockRejectedValueOnce(new Error("no key")); // groq
    mockResolveApiKey.mockResolvedValueOnce({
      apiKey: "dg-test",
      source: "profile:deepgram",
      mode: "api-key",
    }); // deepgram

    const result = await checkSttCredentials();
    expect(result.available).toBe(true);
    expect(result.provider).toBe("deepgram");
  });
});

describe("checkTtsCredentials", () => {
  it("returns available when edge TTS is enabled", async () => {
    mockIsTtsConfigured.mockResolvedValueOnce(false); // openai
    mockIsTtsConfigured.mockResolvedValueOnce(false); // elevenlabs
    mockIsTtsConfigured.mockResolvedValueOnce(true); // edge

    const result = await checkTtsCredentials(emptyCfg);
    expect(result.available).toBe(true);
    expect(result.provider).toBe("edge");
  });

  it("returns available when openai has credentials", async () => {
    mockIsTtsConfigured.mockResolvedValueOnce(true); // openai

    const result = await checkTtsCredentials(emptyCfg);
    expect(result.available).toBe(true);
    expect(result.provider).toBe("openai");
  });

  it("returns unavailable when no TTS provider is configured", async () => {
    mockIsTtsConfigured.mockResolvedValue(false);

    const result = await checkTtsCredentials(emptyCfg);
    expect(result.available).toBe(false);
    expect(result.provider).toBeUndefined();
  });
});

describe("validateVoiceCredentials", () => {
  it("reports both STT and TTS status", async () => {
    mockResolveApiKey.mockRejectedValue(new Error("no key"));
    mockIsTtsConfigured.mockResolvedValueOnce(true); // openai

    const report = await validateVoiceCredentials(emptyCfg);
    expect(report.stt.available).toBe(false);
    expect(report.tts.available).toBe(true);
    expect(report.tts.provider).toBe("openai");
  });
});
