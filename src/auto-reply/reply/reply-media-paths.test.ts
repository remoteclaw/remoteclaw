import { describe, expect, it } from "vitest";
import { createReplyMediaPathNormalizer } from "./reply-media-paths.js";

describe("createReplyMediaPathNormalizer", () => {
  it("returns the payload unchanged (pass-through stub)", async () => {
    const normalize = createReplyMediaPathNormalizer({
      cfg: {},
      sessionKey: "session-key",
      workspaceDir: "/tmp/agent-workspace",
    });

    const payload = {
      mediaUrls: ["./out/photo.png"],
      mediaUrl: "./out/photo.png",
    };

    const result = await normalize(payload);

    expect(result).toBe(payload);
  });

  it("preserves http URLs unchanged", async () => {
    const normalize = createReplyMediaPathNormalizer({
      cfg: {},
      workspaceDir: "/tmp/workspace",
    });

    const payload = {
      mediaUrl: "https://example.com/image.png",
      mediaUrls: ["https://example.com/image.png"],
    };

    const result = await normalize(payload);

    expect(result).toBe(payload);
  });
});
