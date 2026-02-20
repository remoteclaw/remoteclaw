import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MsgContext } from "../auto-reply/templating.js";
import type { RemoteClawConfig } from "../config/config.js";
import {
  buildProviderRegistry,
  createMediaAttachmentCache,
  normalizeMediaAttachments,
  runCapability,
} from "./runner.js";

vi.mock("../agents/model-auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/model-auth.js")>();
  return {
    ...actual,
    resolveApiKeyForProvider: vi.fn().mockResolvedValue({
      apiKey: "test-key",
      mode: "api-key",
      source: "test",
    }),
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runCapability deepgram provider options", () => {
  it("merges provider options, headers, and baseUrl overrides", async () => {
    const tmpPath = path.join(os.tmpdir(), `remoteclaw-deepgram-${Date.now()}.wav`);
    await fs.writeFile(tmpPath, Buffer.from("RIFF"));
    const ctx: MsgContext = { MediaPath: tmpPath, MediaType: "audio/wav" };
    const media = normalizeMediaAttachments(ctx);
    const cache = createMediaAttachmentCache(media);

    let seenQuery: Record<string, string | number | boolean> | undefined;
    let seenBaseUrl: string | undefined;
    let seenHeaders: Record<string, string> | undefined;

    const providerRegistry = buildProviderRegistry({
      deepgram: {
        id: "deepgram",
        capabilities: ["audio"],
        transcribeAudio: async (req) => {
          seenQuery = req.query;
          seenBaseUrl = req.baseUrl;
          seenHeaders = req.headers;
          return { text: "ok", model: req.model };
        },
      },
    });

    const cfg = {
      tools: {
        media: {
          audio: {
            enabled: true,
            baseUrl: "https://config.example",
            headers: { "X-Config": "2" },
            providerOptions: {
              deepgram: {
                detect_language: true,
                punctuate: true,
              },
            },
            deepgram: { smartFormat: true },
            models: [
              {
                provider: "deepgram",
                model: "nova-3",
                baseUrl: "https://entry.example",
                headers: { "X-Entry": "3" },
                providerOptions: {
                  deepgram: {
                    detectLanguage: false,
                    punctuate: false,
                    smart_format: true,
                  },
                },
              },
            ],
          },
        },
      },
    } as unknown as RemoteClawConfig;

    try {
      const result = await runCapability({
        capability: "audio",
        cfg,
        ctx,
        attachments: cache,
        media,
        providerRegistry,
      });
      expect(result.outputs[0]?.text).toBe("ok");
      expect(seenBaseUrl).toBe("https://entry.example");
      expect(seenHeaders).toMatchObject({
        "X-Config": "2",
        "X-Entry": "3",
      });
      expect(seenQuery).toMatchObject({
        detect_language: false,
        punctuate: false,
        smart_format: true,
      });
      expect((seenQuery as Record<string, unknown>)["detectLanguage"]).toBeUndefined();
    } finally {
      await cache.cleanup();
      await fs.unlink(tmpPath).catch(() => {});
    }
  });
});
