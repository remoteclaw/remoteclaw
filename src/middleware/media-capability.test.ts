import { describe, expect, it } from "vitest";
import { formatUnsupportedMediaWarning, partitionMedia } from "./media-capability.js";
import type { AgentRuntime, MediaAttachment } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeAttachment(mimeType: string, filePath?: string): MediaAttachment {
  return { mimeType, filePath: filePath ?? `/tmp/file-${mimeType.replace("/", ".")}` };
}

function makeRuntime(acceptsInbound?: string[]): AgentRuntime {
  return {
    execute: async function* () {},
    mediaCapabilities:
      acceptsInbound !== undefined ? { acceptsInbound, emitsOutbound: false } : undefined,
  };
}

// ── partitionMedia ───────────────────────────────────────────────────────

describe("partitionMedia", () => {
  it("passes all media through when runtime has no mediaCapabilities", () => {
    const runtime = makeRuntime(undefined);
    const media = [makeAttachment("image/jpeg"), makeAttachment("audio/ogg")];

    const result = partitionMedia(runtime, media);

    expect(result.supported).toEqual(media);
    expect(result.unsupported).toEqual([]);
  });

  it("partitions media by MIME type prefix matching", () => {
    const runtime = makeRuntime(["image/"]);
    const image = makeAttachment("image/jpeg");
    const audio = makeAttachment("audio/ogg");
    const video = makeAttachment("video/mp4");

    const result = partitionMedia(runtime, [image, audio, video]);

    expect(result.supported).toEqual([image]);
    expect(result.unsupported).toEqual([audio, video]);
  });

  it("supports multiple accepted prefixes", () => {
    const runtime = makeRuntime(["image/", "audio/", "video/"]);
    const media = [
      makeAttachment("image/png"),
      makeAttachment("audio/wav"),
      makeAttachment("video/mp4"),
    ];

    const result = partitionMedia(runtime, media);

    expect(result.supported).toEqual(media);
    expect(result.unsupported).toEqual([]);
  });

  it("marks all media as unsupported when acceptsInbound is empty", () => {
    const runtime = makeRuntime([]);
    const media = [makeAttachment("image/jpeg"), makeAttachment("audio/ogg")];

    const result = partitionMedia(runtime, media);

    expect(result.supported).toEqual([]);
    expect(result.unsupported).toEqual(media);
  });

  it("handles empty media array", () => {
    const runtime = makeRuntime(["image/"]);

    const result = partitionMedia(runtime, []);

    expect(result.supported).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it("matches application/ MIME types correctly", () => {
    const runtime = makeRuntime(["application/pdf"]);
    const pdf = makeAttachment("application/pdf");
    const image = makeAttachment("image/jpeg");

    const result = partitionMedia(runtime, [pdf, image]);

    expect(result.supported).toEqual([pdf]);
    expect(result.unsupported).toEqual([image]);
  });
});

// ── formatUnsupportedMediaWarning ────────────────────────────────────────

describe("formatUnsupportedMediaWarning", () => {
  it("returns undefined when no unsupported media", () => {
    expect(formatUnsupportedMediaWarning([], "claude")).toBeUndefined();
  });

  it("formats a single unsupported image", () => {
    const warning = formatUnsupportedMediaWarning([makeAttachment("image/jpeg")], "codex");

    expect(warning).toContain("image");
    expect(warning).toContain("codex");
    expect(warning).toContain("not included");
  });

  it("formats a single unsupported audio", () => {
    const warning = formatUnsupportedMediaWarning([makeAttachment("audio/ogg")], "claude");

    expect(warning).toContain("audio");
    expect(warning).toContain("claude");
  });

  it("formats multiple unsupported media of different types", () => {
    const warning = formatUnsupportedMediaWarning(
      [makeAttachment("audio/ogg"), makeAttachment("video/mp4")],
      "claude",
    );

    expect(warning).toContain("2 media attachments");
    expect(warning).toContain("audio/video");
    expect(warning).toContain("claude");
  });

  it("formats multiple unsupported media of the same type", () => {
    const warning = formatUnsupportedMediaWarning(
      [makeAttachment("image/jpeg"), makeAttachment("image/png")],
      "codex",
    );

    expect(warning).toContain("2 media attachments");
    expect(warning).toContain("image");
    expect(warning).toContain("codex");
  });

  it("uses lowercase runtime name", () => {
    const warning = formatUnsupportedMediaWarning([makeAttachment("image/jpeg")], "CLAUDE");

    expect(warning).toContain("claude");
    expect(warning).not.toContain("CLAUDE");
  });
});
