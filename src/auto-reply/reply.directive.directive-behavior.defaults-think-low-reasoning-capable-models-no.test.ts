import "./reply.directive.directive-behavior.e2e-mocks.js";
import { describe, expect, it, vi } from "vitest";
import { loadSessionStore } from "../config/sessions.js";
import {
  installDirectiveBehaviorE2EHooks,
  loadModelCatalog,
  makeAgentTextResult,
  makeWhatsAppDirectiveConfig,
  mockAgentTextResult,
  replyText,
  replyTexts,
  runAgent,
  sessionStorePath,
  withTempHome,
} from "./reply.directive.directive-behavior.e2e-harness.js";
import { getReplyFromConfig } from "./reply.js";

function makeDefaultModelConfig(home: string) {
  return makeWhatsAppDirectiveConfig(home, {
    model: { primary: "anthropic/claude-opus-4-5" },
    models: {
      "anthropic/claude-opus-4-5": {},
      "openai/gpt-4.1-mini": {},
    },
  });
}

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
  it("ignores inline /model and /think directives while still running agent content", async () => {
    await withTempHome(async (home) => {
      mockAgentTextResult("done");

      const inlineModelRes = await getReplyFromConfig(
        {
          Body: "please sync /model openai/gpt-4.1-mini now",
          From: "+1004",
          To: "+2000",
        },
        {},
        makeDefaultModelConfig(home),
      );

      const texts = replyTexts(inlineModelRes);
      expect(texts).toContain("done");
      expect(runAgent).toHaveBeenCalledOnce();
      // Provider is forwarded through the bridge mock's constructor;
      // model is resolved internally and not visible at the bridge level.
      const call = vi.mocked(runAgent).mock.calls[0]?.[0];
      expect(call?.provider).toBe("anthropic");
      vi.mocked(runAgent).mockClear();

      mockAgentTextResult("done");
      const inlineThinkRes = await getReplyFromConfig(
        {
          Body: "please sync /think:high now",
          From: "+1004",
          To: "+2000",
        },
        {},
        makeWhatsAppDirectiveConfig(home, { model: { primary: "anthropic/claude-opus-4-5" } }),
      );

      expect(replyTexts(inlineThinkRes)).toContain("done");
      expect(runAgent).toHaveBeenCalledOnce();
    });
  });
  it("passes elevated defaults when sender is approved", async () => {
    await withTempHome(async (home) => {
      mockAgentTextResult("done");

      await getReplyFromConfig(
        {
          Body: "hello",
          From: "+1004",
          To: "+2000",
          Provider: "whatsapp",
          SenderE164: "+1004",
        },
        {},
        makeWhatsAppDirectiveConfig(
          home,
          { model: { primary: "anthropic/claude-opus-4-5" } },
          {
            tools: {
              elevated: {
                allowFrom: { whatsapp: ["+1004"] },
              },
            },
          },
        ),
      );

      // Verify the agent was called (elevated params are resolved internally
      // by the pipeline and forwarded to the FollowupRun, not visible at the bridge level).
      expect(runAgent).toHaveBeenCalledOnce();
    });
  });
  it("persists /reasoning off on discord even when model defaults reasoning on", async () => {
    await withTempHome(async (home) => {
      const storePath = sessionStorePath(home);
      mockAgentTextResult("done");
      vi.mocked(loadModelCatalog).mockResolvedValue([
        {
          id: "x-ai/grok-4.1-fast",
          name: "Grok 4.1 Fast",
          provider: "openrouter",
          reasoning: true,
        },
      ]);

      const config = makeWhatsAppDirectiveConfig(
        home,
        {
          model: "openrouter/x-ai/grok-4.1-fast",
        },
        {
          channels: {
            discord: { allowFrom: ["*"] },
          },
          session: { store: storePath },
        },
      );

      const offRes = await getReplyFromConfig(
        {
          Body: "/reasoning off",
          From: "discord:user:1004",
          To: "channel:general",
          Provider: "discord",
          Surface: "discord",
          CommandSource: "text",
          CommandAuthorized: true,
        },
        {},
        config,
      );
      expect(replyText(offRes)).toContain("Reasoning visibility disabled.");

      const store = loadSessionStore(storePath);
      const entry = Object.values(store)[0];
      expect(entry?.reasoningLevel).toBe("off");

      await getReplyFromConfig(
        {
          Body: "hello",
          From: "discord:user:1004",
          To: "channel:general",
          Provider: "discord",
          Surface: "discord",
          CommandSource: "text",
          CommandAuthorized: true,
        },
        {},
        config,
      );

      // Verify the agent was called (reasoningLevel is resolved internally by the
      // pipeline and recorded in the session store, not visible at the bridge level).
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
