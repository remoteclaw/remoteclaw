import { describe, expect, it, vi } from "vitest";
import { resolveOutboundAttachmentFromUrl } from "./outbound-attachment.js";

const loadWebMedia = vi.hoisted(() => vi.fn());
const saveMediaBuffer = vi.hoisted(() => vi.fn());

vi.mock("../../extensions/whatsapp/src/media.js", () => ({
  loadWebMedia,
}));

vi.mock("./store.js", () => ({
  saveMediaBuffer,
}));

describe("resolveOutboundAttachmentFromUrl", () => {
  it("preserves the loaded file name when staging outbound media", async () => {
    const buffer = Buffer.from("pdf");
    loadWebMedia.mockResolvedValueOnce({
      buffer,
      contentType: "application/pdf",
      fileName: "report.pdf",
    });
    saveMediaBuffer.mockResolvedValueOnce({
      path: "/tmp/media/outbound/report---uuid.pdf",
      contentType: "application/pdf",
    });

    await resolveOutboundAttachmentFromUrl("./report.pdf", 1024);

    expect(saveMediaBuffer).toHaveBeenCalledWith(
      buffer,
      "application/pdf",
      "outbound",
      1024,
      "report.pdf",
    );
  });
});
