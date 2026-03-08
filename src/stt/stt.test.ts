import { describe, expect, it } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { withEnvAsync } from "../test-utils/env.js";
import { resolveProviderQuery, transcribeAudioWithProvider } from "./stt.js";
import type { SttProvider } from "./types.js";

function buildTestRegistry(overrides: Record<string, SttProvider>): Map<string, SttProvider> {
  const registry = new Map<string, SttProvider>();
  for (const [key, provider] of Object.entries(overrides)) {
    registry.set(key, provider);
  }
  return registry;
}

describe("transcribeAudioWithProvider", () => {
  it("calls the STT provider and returns transcript", async () => {
    await withEnvAsync({ OPENAI_API_KEY: "test-key" }, async () => {
      let seenModel: string | undefined;
      const registry = buildTestRegistry({
        openai: {
          id: "openai",
          transcribeAudio: async (req) => {
            seenModel = req.model;
            return { text: "hello world", model: req.model ?? "unknown" };
          },
        },
      });

      const result = await transcribeAudioWithProvider({
        buffer: Buffer.from("RIFF"),
        fileName: "test.wav",
        mime: "audio/wav",
        providerId: "openai",
        cfg: {} as RemoteClawConfig,
        entry: { model: "whisper-1" },
        providerRegistry: registry,
        timeoutMs: 30000,
      });

      expect(result.text).toBe("hello world");
      expect(seenModel).toBe("whisper-1");
    });
  });

  it("uses default model when entry model is not specified", async () => {
    await withEnvAsync({ OPENAI_API_KEY: "test-key" }, async () => {
      let seenModel: string | undefined;
      const registry = buildTestRegistry({
        openai: {
          id: "openai",
          transcribeAudio: async (req) => {
            seenModel = req.model;
            return { text: "ok", model: req.model ?? "unknown" };
          },
        },
      });

      await transcribeAudioWithProvider({
        buffer: Buffer.from("RIFF"),
        fileName: "test.wav",
        providerId: "openai",
        cfg: {} as RemoteClawConfig,
        entry: {},
        providerRegistry: registry,
        timeoutMs: 30000,
      });

      expect(seenModel).toBe("gpt-4o-mini-transcribe");
    });
  });

  it("throws when provider is not in registry", async () => {
    await withEnvAsync({ OPENAI_API_KEY: "test-key" }, async () => {
      const registry = buildTestRegistry({});
      await expect(
        transcribeAudioWithProvider({
          buffer: Buffer.from("RIFF"),
          fileName: "test.wav",
          providerId: "openai",
          cfg: {} as RemoteClawConfig,
          entry: {},
          providerRegistry: registry,
          timeoutMs: 30000,
        }),
      ).rejects.toThrow("STT provider not available: openai");
    });
  });

  it("passes language and prompt to provider", async () => {
    await withEnvAsync({ DEEPGRAM_API_KEY: "test-key" }, async () => {
      let seenLanguage: string | undefined;
      let seenPrompt: string | undefined;
      const registry = buildTestRegistry({
        deepgram: {
          id: "deepgram",
          transcribeAudio: async (req) => {
            seenLanguage = req.language;
            seenPrompt = req.prompt;
            return { text: "ok", model: "nova-3" };
          },
        },
      });

      await transcribeAudioWithProvider({
        buffer: Buffer.from("RIFF"),
        fileName: "test.wav",
        providerId: "deepgram",
        cfg: {} as RemoteClawConfig,
        entry: { language: "en" },
        language: "fr",
        prompt: "Transcribe this.",
        providerRegistry: registry,
        timeoutMs: 30000,
      });

      // Explicit language param takes priority
      expect(seenLanguage).toBe("fr");
      expect(seenPrompt).toBe("Transcribe this.");
    });
  });
});

describe("resolveProviderQuery", () => {
  it("merges deepgram provider options with compat query", () => {
    const query = resolveProviderQuery({
      providerId: "deepgram",
      config: {
        providerOptions: {
          deepgram: { detect_language: true, punctuate: true },
        },
        deepgram: { smartFormat: true },
      },
      entry: {
        providerOptions: {
          deepgram: { punctuate: false },
        },
      },
    });
    expect(query).toMatchObject({
      detect_language: true,
      punctuate: false,
      smart_format: true,
    });
  });

  it("normalizes deepgram camelCase keys to snake_case", () => {
    const query = resolveProviderQuery({
      providerId: "deepgram",
      config: undefined,
      entry: {
        providerOptions: {
          deepgram: { detectLanguage: true, smartFormat: false },
        },
      },
    });
    expect(query).toMatchObject({
      detect_language: true,
      smart_format: false,
    });
    expect((query as Record<string, unknown>)["detectLanguage"]).toBeUndefined();
    expect((query as Record<string, unknown>)["smartFormat"]).toBeUndefined();
  });

  it("returns undefined for non-deepgram providers with no options", () => {
    const query = resolveProviderQuery({
      providerId: "openai",
      config: undefined,
      entry: {},
    });
    expect(query).toBeUndefined();
  });

  it("passes through non-deepgram provider options", () => {
    const query = resolveProviderQuery({
      providerId: "openai",
      config: {
        providerOptions: {
          openai: { temperature: 0.5 },
        },
      },
      entry: {},
    });
    expect(query).toMatchObject({ temperature: 0.5 });
  });
});
