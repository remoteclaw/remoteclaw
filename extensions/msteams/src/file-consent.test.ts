// Msteams tests cover file consent plugin behavior.
import { describe, expect, it, vi } from "vitest";
import { uploadToConsentUrl } from "./file-consent.js";

describe("uploadToConsentUrl", () => {
  it("PUTs the buffer to the consent URL with content-range and content-type headers", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

    await uploadToConsentUrl({
      url: "https://upload.example.com/file",
      buffer: Buffer.from("hello"),
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://upload.example.com/file",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Range": "bytes 0-4/5",
          "Content-Type": "application/octet-stream",
        }),
        body: new Uint8Array(Buffer.from("hello")),
      }),
    );
  });
});
