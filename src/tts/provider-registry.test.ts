import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { createEmptyPluginRegistry } from "../plugins/registry-empty.js";
import { resetPluginRuntimeStateForTest, setActivePluginRegistry } from "../plugins/runtime.js";
import type { SpeechProviderPlugin } from "../plugins/types.js";
import {
  getSpeechProvider,
  listSpeechProviders,
  normalizeSpeechProviderId,
} from "./provider-registry.js";

const loadRemoteClawPluginsMock = vi.fn();

vi.mock("../plugins/loader.js", () => ({
  loadRemoteClawPlugins: (...args: Parameters<typeof loadRemoteClawPluginsMock>) =>
    loadRemoteClawPluginsMock(...args),
}));

function createSpeechProvider(id: string, aliases?: string[]): SpeechProviderPlugin {
  return {
    id,
    ...(aliases ? { aliases } : {}),
    isConfigured: () => true,
    synthesize: async () => ({
      audioBuffer: Buffer.from("audio"),
      outputFormat: "mp3",
      voiceCompatible: false,
      fileExtension: ".mp3",
    }),
  };
}

describe("speech provider registry", () => {
  beforeEach(() => {
    resetPluginRuntimeStateForTest();
    loadRemoteClawPluginsMock.mockReset();
    loadRemoteClawPluginsMock.mockReturnValue(createEmptyPluginRegistry());
  });

  afterEach(() => {
    resetPluginRuntimeStateForTest();
  });

  it("uses active plugin speech providers without reloading plugins", () => {
    setActivePluginRegistry({
      ...createEmptyPluginRegistry(),
      speechProviders: [
        {
          pluginId: "test-openai",
          provider: createSpeechProvider("openai"),
        },
      ],
    });

    const providers = listSpeechProviders();

    expect(providers.map((provider) => provider.id)).toEqual(["openai"]);
    expect(loadRemoteClawPluginsMock).not.toHaveBeenCalled();
  });

  it("loads speech providers from plugins when config is provided", () => {
    loadRemoteClawPluginsMock.mockReturnValue({
      ...createEmptyPluginRegistry(),
      speechProviders: [
        {
          pluginId: "test-microsoft",
          provider: createSpeechProvider("microsoft", ["edge"]),
        },
      ],
    });

    const cfg = {} as RemoteClawConfig;

    expect(listSpeechProviders(cfg).map((provider) => provider.id)).toEqual(["microsoft"]);
    expect(getSpeechProvider("edge", cfg)?.id).toBe("microsoft");
    expect(loadRemoteClawPluginsMock).toHaveBeenCalledWith({ config: cfg });
  });

  it("returns no providers when neither plugins nor active registry provide speech support", () => {
    expect(listSpeechProviders()).toEqual([]);
    expect(getSpeechProvider("openai")).toBeUndefined();
  });

  it("normalizes the legacy edge alias to microsoft", () => {
    expect(normalizeSpeechProviderId("edge")).toBe("microsoft");
  });
});
