import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearConfigCache, loadConfig } from "./config.js";
import { withTempHomeConfig } from "./test-helpers.js";

describe("talk config validation fail-closed behavior", () => {
  beforeEach(() => {
    clearConfigCache();
    vi.restoreAllMocks();
  });

  it.each([
    ["boolean", true],
    ["string", "1500"],
    ["float", 1500.5],
  ])("rejects %s talk.silenceTimeoutMs during config load", async (_label, value) => {
    await withTempHomeConfig(
      {
        agents: { list: [{ id: "main" }] },
        talk: {
          silenceTimeoutMs: value,
        },
      },
      async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(() => loadConfig()).toThrow("Invalid config");
      },
    );
  });

  it("rejects talk.provider when it does not match talk.providers during config load", async () => {
    await withTempHomeConfig(
      {
        agents: { list: [{ id: "main" }] },
        talk: {
          provider: "acme",
          providers: {
            elevenlabs: {
              voiceId: "voice-123",
            },
          },
        },
      },
      async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(() => loadConfig()).toThrow("Invalid config");
      },
    );
  });

  it("rejects multi-provider talk config without talk.provider during config load", async () => {
    await withTempHomeConfig(
      {
        agents: { list: [{ id: "main" }] },
        talk: {
          providers: {
            acme: {
              voiceId: "voice-acme",
            },
            elevenlabs: {
              voiceId: "voice-eleven",
            },
          },
        },
      },
      async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});

        expect(() => loadConfig()).toThrow("Invalid config");
      },
    );
  });
});
