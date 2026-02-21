import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import { getReplyFromConfig } from "./reply.js";

vi.mock("../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/index.js")>();
  return { ...actual, ChannelBridge: vi.fn(), createCliRuntime: vi.fn() };
});

import { ChannelBridge } from "../middleware/index.js";

const mockHandle = vi.fn();

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(
    async (home) => {
      vi.mocked(ChannelBridge).mockImplementation(function () {
        return { handle: mockHandle };
      } as never);
      mockHandle.mockReset();
      return await fn(home);
    },
    {
      env: {
        REMOTECLAW_BUNDLED_SKILLS_DIR: (home) => path.join(home, "bundled-skills"),
      },
      prefix: "remoteclaw-media-note-",
    },
  );
}

function makeCfg(home: string) {
  return {
    agents: {
      defaults: {
        model: { primary: "anthropic/claude-opus-4-5" },
        workspace: path.join(home, "remoteclaw"),
      },
    },
    channels: { whatsapp: { allowFrom: ["*"] } },
    session: { store: path.join(home, "sessions.json") },
  };
}

describe("getReplyFromConfig media note plumbing", () => {
  it("includes all MediaPaths in the agent prompt", async () => {
    await withTempHome(async (home) => {
      mockHandle.mockResolvedValue({
        text: "ok",
        sessionId: "s",
        durationMs: 5,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        aborted: false,
        error: undefined,
      });

      const cfg = makeCfg(home);
      const res = await getReplyFromConfig(
        {
          Body: "hello",
          From: "+1001",
          To: "+2000",
          MediaPaths: ["/tmp/a.png", "/tmp/b.png"],
          MediaUrls: ["/tmp/a.png", "/tmp/b.png"],
        },
        {},
        cfg,
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("ok");
      expect(mockHandle).toHaveBeenCalledOnce();
      const channelMessage = mockHandle.mock.calls[0]?.[0] as { text?: string };
      const seenPrompt = channelMessage?.text ?? "";
      expect(seenPrompt).toBeTruthy();
      expect(seenPrompt).toContain("[media attached: 2 files]");
      const idxA = seenPrompt.indexOf("[media attached 1/2: /tmp/a.png");
      const idxB = seenPrompt.indexOf("[media attached 2/2: /tmp/b.png");
      expect(typeof idxA).toBe("number");
      expect(typeof idxB).toBe("number");
      expect(idxA >= 0).toBe(true);
      expect(idxB >= 0).toBe(true);
      expect(idxA < idxB).toBe(true);
    });
  });
});
