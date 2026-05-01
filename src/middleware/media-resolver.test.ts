import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMediaAttachments } from "./media-resolver.js";

// ── Mocks ────────────────────────────────────────────────────────────────

const mockFetchRemoteMedia = vi.fn();
vi.mock("../media/fetch.js", () => ({
  fetchRemoteMedia: (...args: unknown[]) => mockFetchRemoteMedia(...args),
}));

const mockDetectMime = vi.fn();
vi.mock("../media/mime.js", () => ({
  detectMime: (...args: unknown[]) => mockDetectMime(...args),
  extensionForMime: (mime?: string) => {
    const map: Record<string, string> = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "audio/ogg": ".ogg",
      "video/mp4": ".mp4",
    };
    return mime ? (map[mime] ?? "") : "";
  },
}));

// ── Setup / Teardown ─────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `rc-test-media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  await mkdir(tempDir, { recursive: true });
  mockFetchRemoteMedia.mockReset();
  mockDetectMime.mockReset();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true }).catch(() => {});
});

// ── Tests ────────────────────────────────────────────────────────────────

describe("resolveMediaAttachments", () => {
  describe("remote URLs", () => {
    it("downloads HTTP URL and saves to temp file", async () => {
      const imageBuffer = Buffer.from("fake-jpeg-data");
      mockFetchRemoteMedia.mockResolvedValue({
        buffer: imageBuffer,
        contentType: "image/jpeg",
        fileName: "photo.jpg",
      });

      const result = await resolveMediaAttachments(["https://cdn.example.com/photo.jpg"], tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("image/jpeg");
      expect(result[0].filePath).toMatch(/inbound-media-0\.jpg$/);
      expect(result[0].sourceUrl).toBe("https://cdn.example.com/photo.jpg");
      expect(result[0].fileName).toBe("photo.jpg");

      // Verify file was written
      const written = await readFile(result[0].filePath!);
      expect(written).toEqual(imageBuffer);
    });

    it("downloads HTTPS URL", async () => {
      mockFetchRemoteMedia.mockResolvedValue({
        buffer: Buffer.from("audio-data"),
        contentType: "audio/ogg",
        fileName: "voice.ogg",
      });

      const result = await resolveMediaAttachments(["https://cdn.telegram.org/voice.ogg"], tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("audio/ogg");
      expect(result[0].filePath).toMatch(/inbound-media-0\.ogg$/);
    });

    it("handles multiple remote URLs", async () => {
      mockFetchRemoteMedia
        .mockResolvedValueOnce({
          buffer: Buffer.from("img1"),
          contentType: "image/jpeg",
          fileName: "a.jpg",
        })
        .mockResolvedValueOnce({
          buffer: Buffer.from("img2"),
          contentType: "image/png",
          fileName: "b.png",
        });

      const result = await resolveMediaAttachments(
        ["https://example.com/a.jpg", "https://example.com/b.png"],
        tempDir,
      );

      expect(result).toHaveLength(2);
      expect(result[0].filePath).toMatch(/inbound-media-0\.jpg$/);
      expect(result[1].filePath).toMatch(/inbound-media-1\.png$/);
    });

    it("uses generic extension when MIME type has no mapping", async () => {
      mockFetchRemoteMedia.mockResolvedValue({
        buffer: Buffer.from("data"),
        contentType: "application/octet-stream",
      });

      const result = await resolveMediaAttachments(["https://example.com/file"], tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toMatch(/inbound-media-0$/);
      expect(result[0].fileName).toBe("inbound-media-0");
    });

    it("falls back to application/octet-stream when no content type returned", async () => {
      mockFetchRemoteMedia.mockResolvedValue({
        buffer: Buffer.from("unknown"),
        contentType: undefined,
      });

      const result = await resolveMediaAttachments(["https://example.com/blob"], tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("application/octet-stream");
    });
  });

  describe("local file paths", () => {
    it("resolves local file with detected MIME type", async () => {
      mockDetectMime.mockResolvedValue("image/png");

      const result = await resolveMediaAttachments(["/tmp/screenshot.png"], tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("image/png");
      expect(result[0].filePath).toBe("/tmp/screenshot.png");
      expect(result[0].sourceUrl).toBeUndefined();
    });

    it("uses application/octet-stream when MIME detection returns undefined", async () => {
      mockDetectMime.mockResolvedValue(undefined);

      const result = await resolveMediaAttachments(["/tmp/unknown.bin"], tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].mimeType).toBe("application/octet-stream");
    });
  });

  describe("error handling", () => {
    it("skips URLs that fail to resolve", async () => {
      mockFetchRemoteMedia.mockRejectedValueOnce(new Error("network error")).mockResolvedValueOnce({
        buffer: Buffer.from("ok"),
        contentType: "image/png",
        fileName: "ok.png",
      });

      const result = await resolveMediaAttachments(
        ["https://example.com/bad", "https://example.com/ok.png"],
        tempDir,
      );

      expect(result).toHaveLength(1);
      expect(result[0].sourceUrl).toBe("https://example.com/ok.png");
    });

    it("returns empty array when all URLs fail", async () => {
      mockFetchRemoteMedia.mockRejectedValue(new Error("fail"));

      const result = await resolveMediaAttachments(
        ["https://example.com/a", "https://example.com/b"],
        tempDir,
      );

      expect(result).toHaveLength(0);
    });

    it("returns empty array for empty input", async () => {
      const result = await resolveMediaAttachments([], tempDir);
      expect(result).toHaveLength(0);
    });
  });

  describe("mixed URLs", () => {
    it("handles mix of remote and local URLs", async () => {
      mockFetchRemoteMedia.mockResolvedValue({
        buffer: Buffer.from("remote"),
        contentType: "video/mp4",
        fileName: "clip.mp4",
      });
      mockDetectMime.mockResolvedValue("image/jpeg");

      const result = await resolveMediaAttachments(
        ["https://cdn.example.com/clip.mp4", "/local/photo.jpg"],
        tempDir,
      );

      expect(result).toHaveLength(2);
      expect(result[0].sourceUrl).toBe("https://cdn.example.com/clip.mp4");
      expect(result[0].filePath).toMatch(/inbound-media-0\.mp4$/);
      expect(result[1].filePath).toBe("/local/photo.jpg");
    });
  });
});
