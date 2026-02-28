import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { withEnvAsync } from "../test-utils/env.js";
import { buildProviderRegistry, runCapability } from "./runner.js";
import { withAudioFixture } from "./runner.test-utils.js";

describe("runCapability deepgram provider options", () => {
  it("merges provider options, headers, and baseUrl overrides", async () => {
    await withEnvAsync({ DEEPGRAM_API_KEY: "test-key" }, async () => {
      await withAudioFixture("openclaw-deepgram", async ({ ctx, media, cache }) => {
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
        } as unknown as OpenClawConfig;

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
        // Provider-level headers from cfg.models.providers are no longer resolved.
        // Only config-level and entry-level headers are merged.
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
      });
    });
  });
});
