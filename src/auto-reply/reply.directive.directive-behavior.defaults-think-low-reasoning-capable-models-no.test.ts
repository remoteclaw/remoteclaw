import "./reply.directive.directive-behavior.e2e-mocks.js";
import { describe, expect, it, vi } from "vitest";
import {
  installDirectiveBehaviorE2EHooks,
  makeAgentTextResult,
  makeWhatsAppDirectiveConfig,
  mockAgentTextResult,
  replyTexts,
  runAgent,
  withTempHome,
} from "./reply.directive.directive-behavior.e2e-harness.js";
import { getReplyFromConfig } from "./reply.js";

async function runReplyToCurrentCase(home: string, text: string) {
  vi.mocked(runAgent).mockResolvedValue(makeAgentTextResult(text));

  const res = await getReplyFromConfig(
    {
      Body: "ping",
      From: "+1004",
      To: "+2000",
      MessageSid: "msg-123",
    },
    {},
    makeWhatsAppDirectiveConfig(home, { model: "anthropic/claude-opus-4-5" }),
  );

  return Array.isArray(res) ? res[0] : res;
}

describe("directive behavior", () => {
  installDirectiveBehaviorE2EHooks();
  it("ignores inline /verbose directives while still running agent content", async () => {
    await withTempHome(async (home) => {
      mockAgentTextResult("done");

      const inlineVerboseRes = await getReplyFromConfig(
        {
          Body: "please sync /verbose on now",
          From: "+1004",
          To: "+2000",
        },
        {},
        makeWhatsAppDirectiveConfig(home, { model: { primary: "anthropic/claude-opus-4-5" } }),
      );

      expect(replyTexts(inlineVerboseRes)).toContain("done");
      expect(runAgent).toHaveBeenCalledOnce();
    });
  });
  it("handles reply_to_current tags and explicit reply_to precedence", async () => {
    await withTempHome(async (home) => {
      for (const replyTag of ["[[reply_to_current]]", "[[ reply_to_current ]]"]) {
        const payload = await runReplyToCurrentCase(home, `hello ${replyTag}`);
        expect(payload?.text).toBe("hello");
        expect(payload?.replyToId).toBe("msg-123");
      }

      vi.mocked(runAgent).mockResolvedValue(
        makeAgentTextResult("hi [[reply_to_current]] [[reply_to:abc-456]]"),
      );

      const res = await getReplyFromConfig(
        {
          Body: "ping",
          From: "+1004",
          To: "+2000",
          MessageSid: "msg-123",
        },
        {},
        makeWhatsAppDirectiveConfig(home, { model: { primary: "anthropic/claude-opus-4-5" } }),
      );

      const payload = Array.isArray(res) ? res[0] : res;
      expect(payload?.text).toBe("hi");
      expect(payload?.replyToId).toBe("abc-456");
    });
  });
});
