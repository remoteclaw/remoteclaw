import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../channels/voice-credentials.js", () => ({
  validateVoiceCredentials: vi.fn(),
}));

vi.mock("../terminal/note.js", () => ({
  note: vi.fn(),
}));

import { validateVoiceCredentials } from "../channels/voice-credentials.js";
import type { RemoteClawConfig } from "../config/config.js";
import { note } from "../terminal/note.js";
import { noteVoiceChannelHealth } from "./doctor-voice.js";

const mockValidate = vi.mocked(validateVoiceCredentials);
const mockNote = vi.mocked(note);

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function cfgWithVoiceCall(enabled?: boolean): RemoteClawConfig {
  return {
    plugins: {
      entries: {
        "voice-call": { enabled: enabled ?? true },
      },
    },
  } as unknown as RemoteClawConfig;
}

describe("noteVoiceChannelHealth", () => {
  it("skips when voice-call plugin is not configured", async () => {
    await noteVoiceChannelHealth({} as RemoteClawConfig);
    expect(mockValidate).not.toHaveBeenCalled();
    expect(mockNote).not.toHaveBeenCalled();
  });

  it("skips when voice-call plugin is disabled", async () => {
    await noteVoiceChannelHealth(cfgWithVoiceCall(false));
    expect(mockValidate).not.toHaveBeenCalled();
    expect(mockNote).not.toHaveBeenCalled();
  });

  it("does not warn when both STT and TTS are available", async () => {
    mockValidate.mockResolvedValue({
      stt: { available: true, provider: "openai" },
      tts: { available: true, provider: "edge" },
    });

    await noteVoiceChannelHealth(cfgWithVoiceCall());
    expect(mockValidate).toHaveBeenCalled();
    expect(mockNote).not.toHaveBeenCalled();
  });

  it("warns when STT credentials are missing", async () => {
    mockValidate.mockResolvedValue({
      stt: { available: false },
      tts: { available: true, provider: "edge" },
    });

    await noteVoiceChannelHealth(cfgWithVoiceCall());
    expect(mockNote).toHaveBeenCalledOnce();
    const message = mockNote.mock.calls[0][0];
    expect(message).toContain("STT");
    expect(message).not.toContain("TTS: no credentials");
  });

  it("warns when TTS credentials are missing", async () => {
    mockValidate.mockResolvedValue({
      stt: { available: true, provider: "openai" },
      tts: { available: false },
    });

    await noteVoiceChannelHealth(cfgWithVoiceCall());
    expect(mockNote).toHaveBeenCalledOnce();
    const message = mockNote.mock.calls[0][0];
    expect(message).toContain("TTS");
    expect(message).not.toContain("STT: no credentials");
  });

  it("warns when both STT and TTS credentials are missing", async () => {
    mockValidate.mockResolvedValue({
      stt: { available: false },
      tts: { available: false },
    });

    await noteVoiceChannelHealth(cfgWithVoiceCall());
    expect(mockNote).toHaveBeenCalledOnce();
    const message = mockNote.mock.calls[0][0];
    expect(message).toContain("STT");
    expect(message).toContain("TTS");
  });

  it("uses 'Voice channel' as the note title", async () => {
    mockValidate.mockResolvedValue({
      stt: { available: false },
      tts: { available: false },
    });

    await noteVoiceChannelHealth(cfgWithVoiceCall());
    expect(mockNote).toHaveBeenCalledWith(expect.any(String), "Voice channel");
  });
});
