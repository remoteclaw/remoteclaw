import { describe, expect, it } from "vitest";
import { buildInboundMediaNote } from "./media-note.js";

describe("buildInboundMediaNote", () => {
  it("formats single MediaPath as a media note", () => {
    const note = buildInboundMediaNote({
      MediaPath: "/tmp/a.png",
      MediaType: "image/png",
      MediaUrl: "/tmp/a.png",
    });
    expect(note).toBe("[media attached: /tmp/a.png (image/png) | /tmp/a.png]");
  });

  it("formats multiple MediaPaths as numbered media notes", () => {
    const note = buildInboundMediaNote({
      MediaPaths: ["/tmp/a.png", "/tmp/b.png", "/tmp/c.png"],
      MediaUrls: ["/tmp/a.png", "/tmp/b.png", "/tmp/c.png"],
    });
    expect(note).toBe(
      [
        "[media attached: 3 files]",
        "[media attached 1/3: /tmp/a.png | /tmp/a.png]",
        "[media attached 2/3: /tmp/b.png | /tmp/b.png]",
        "[media attached 3/3: /tmp/c.png | /tmp/c.png]",
      ].join("\n"),
    );
  });

  it("strips audio attachments when Transcript is present (issue #4197)", () => {
    const note = buildInboundMediaNote({
      MediaPaths: ["/tmp/voice.opus"],
      MediaTypes: ["audio/opus"],
      Transcript: "Hello world from Whisper",
    });
    // Audio should be stripped when transcript is available
    expect(note).toBeUndefined();
  });

  it("does not strip multiple audio attachments using transcript-only fallback", () => {
    const note = buildInboundMediaNote({
      MediaPaths: ["/tmp/voice-1.ogg", "/tmp/voice-2.ogg"],
      MediaTypes: ["audio/ogg", "audio/ogg"],
      Transcript: "Transcript text without per-attachment mapping",
    });
    expect(note).toBe(
      [
        "[media attached: 2 files]",
        "[media attached 1/2: /tmp/voice-1.ogg (audio/ogg)]",
        "[media attached 2/2: /tmp/voice-2.ogg (audio/ogg)]",
      ].join("\n"),
    );
  });

  it("keeps audio attachments when no transcription available", () => {
    const note = buildInboundMediaNote({
      MediaPaths: ["/tmp/voice.ogg"],
      MediaTypes: ["audio/ogg"],
    });
    // No transcription = keep audio attachment as fallback
    expect(note).toBe("[media attached: /tmp/voice.ogg (audio/ogg)]");
  });
});
