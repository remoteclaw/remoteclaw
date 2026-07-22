import path from "node:path";
import { describe, expect, it } from "vitest";
import { getMediaDir } from "../media/store.js";
import { buildInboundMediaNote } from "./media-note.js";

describe("buildInboundMediaNote", () => {
  it("formats single MediaPath as a media note (collapses redundant duplicate URL, #47587)", () => {
    // When the channel mirrors the local path into MediaUrl (e.g. Telegram
    // album media), the formatter should not render `path | path`. The URL
    // suffix is only useful when it adds new information beyond the path.
    const note = buildInboundMediaNote({
      MediaPath: "/tmp/a.png",
      MediaType: "image/png",
      MediaUrl: "/tmp/a.png",
    });
    expect(note).toBe("[media attached: /tmp/a.png (image/png)]");
  });

  it("renders managed inbound media-store paths as media URIs (collapses duplicate URL, #47587)", () => {
    const inboundPath = path.join(getMediaDir(), "inbound", "photo---abc123.png");
    const note = buildInboundMediaNote({
      MediaPath: inboundPath,
      MediaType: "image/png",
      MediaUrl: inboundPath,
    });
    // Both MediaPath and MediaUrl normalize to the same media://inbound/ URI,
    // so the duplicate URL suffix is collapsed per #47587. Channels that
    // surface a genuinely different URL (e.g. a remote handle) still get the
    // ` | <url>` suffix - see the next test case.
    expect(note).toBe("[media attached: media://inbound/photo---abc123.png (image/png)]");
  });

  it("renders managed inbound media-store paths with distinct remote URL", () => {
    const inboundPath = path.join(getMediaDir(), "inbound", "photo---abc123.png");
    const note = buildInboundMediaNote({
      MediaPath: inboundPath,
      MediaType: "image/png",
      MediaUrl: "https://cdn.example.com/photo---abc123.png",
    });
    // Genuinely different URL (remote CDN) is preserved as the suffix.
    expect(note).toBe(
      "[media attached: media://inbound/photo---abc123.png (image/png) | https://cdn.example.com/photo---abc123.png]",
    );
  });

  it("formats multiple MediaPaths as numbered media notes (collapses duplicate URLs, #47587)", () => {
    const note = buildInboundMediaNote({
      MediaPaths: ["/tmp/a.png", "/tmp/b.png", "/tmp/c.png"],
      MediaUrls: ["/tmp/a.png", "/tmp/b.png", "/tmp/c.png"],
    });
    expect(note).toBe(
      [
        "[media attached: 3 files]",
        "[media attached 1/3: /tmp/a.png]",
        "[media attached 2/3: /tmp/b.png]",
        "[media attached 3/3: /tmp/c.png]",
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

  it("preserves URL suffix when it differs from the local path (#47587)", () => {
    // Single attachment: distinct path and URL must both render.
    const single = buildInboundMediaNote({
      MediaPath: "/tmp/a.png",
      MediaType: "image/png",
      MediaUrl: "https://example.com/a.png",
    });
    expect(single).toBe("[media attached: /tmp/a.png (image/png) | https://example.com/a.png]");

    // Mixed array: some indices have identical path/url (Telegram local-only),
    // others carry a real remote URL. Each entry should be deduped independently.
    const mixed = buildInboundMediaNote({
      MediaPaths: ["/tmp/local.png", "/tmp/remote.png"],
      MediaUrls: ["/tmp/local.png", "https://example.com/remote.png"],
    });
    expect(mixed).toBe(
      [
        "[media attached: 2 files]",
        "[media attached 1/2: /tmp/local.png]",
        "[media attached 2/2: /tmp/remote.png | https://example.com/remote.png]",
      ].join("\n"),
    );
  });

  it("dedupes after sanitization: trailing whitespace/control chars in URL still match (#47587)", () => {
    // Sanitization runs before equality, so visually-identical inputs that
    // differ only by trailing whitespace are treated as duplicates.
    const note = buildInboundMediaNote({
      MediaPath: "/tmp/a.png",
      MediaType: "image/png",
      MediaUrl: "/tmp/a.png   ",
    });
    expect(note).toBe("[media attached: /tmp/a.png (image/png)]");
  });
});
