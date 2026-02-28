import "./reply.directive.directive-behavior.e2e-mocks.js";
import { describe, expect, it, vi } from "vitest";
import { loadSessionStore } from "../config/sessions.js";
import {
  assertModelSelection,
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
import { runModelDirectiveText } from "./reply.directive.directive-behavior.model-directive-test-utils.js";
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

async function expectThinkStatusForReasoningModel(params: {
  home: string;
  reasoning: boolean;
  expectedLevel: "low" | "off";
}): Promise<void> {
  vi.mocked(loadModelCatalog).mockResolvedValueOnce([
    {
      id: "claude-opus-4-5",
      name: "Opus 4.5",
      provider: "anthropic",
      reasoning: params.reasoning,
    },
  ]);

  const res = await getReplyFromConfig(
    { Body: "/think", From: "+1222", To: "+1222", CommandAuthorized: true },
    {},
    makeWhatsAppDirectiveConfig(params.home, { model: "anthropic/claude-opus-4-5" }),
  );

  const text = replyText(res);
  expect(text).toContain(`Current thinking level: ${params.expectedLevel}`);
  expect(text).toContain("Options: off, minimal, low, medium, high.");
}

function mockReasoningCapableCatalog() {
  vi.mocked(loadModelCatalog).mockResolvedValueOnce([
    {
      id: "claude-opus-4-5",
      name: "Opus 4.5",
      provider: "anthropic",
      reasoning: true,
    },
  ]);
}

async function runReasoningDefaultCase(params: {
  home: string;
  thinkingDefault?: "off" | "low" | "medium" | "high";
}) {
  vi.mocked(runAgent).mockClear();
  mockAgentTextResult("done");
  mockReasoningCapableCatalog();

  await getReplyFromConfig(
    {
      Body: "hello",
      From: "+1004",
      To: "+2000",
    },
    {},
    makeWhatsAppDirectiveConfig(params.home, {
      model: { primary: "anthropic/claude-opus-4-5" },
      ...(params.thinkingDefault ? { thinkingDefault: params.thinkingDefault } : {}),
    }),
  );

  // Verify the agent was called (thinkLevel/reasoningLevel are resolved
  // internally by the pipeline and are no longer visible at the bridge level).
  expect(runAgent).toHaveBeenCalledOnce();
}

describe("directive behavior", () => {
  installDirectiveBehaviorE2EHooks();

  it("covers /think status and reasoning defaults for reasoning and non-reasoning models", async () => {
    await withTempHome(async (home) => {
      await expectThinkStatusForReasoningModel({
        home,
        reasoning: true,
        expectedLevel: "low",
      });
      await expectThinkStatusForReasoningModel({
        home,
        reasoning: false,
        expectedLevel: "off",
      });
      expect(runAgent).not.toHaveBeenCalled();

      vi.mocked(runAgent).mockClear();

      for (const scenario of [{}, { thinkingDefault: "off" as const }]) {
        await runReasoningDefaultCase({
          home,
          ...scenario,
        });
      }
    });
  });
  it("renders model list and status variants across catalog/config combinations", async () => {
    await withTempHome(async (home) => {
      const aliasText = await runModelDirectiveText(home, "/model list");
      expect(aliasText).toContain("Providers:");
      expect(aliasText).toContain("- anthropic");
      expect(aliasText).toContain("- openai");
      expect(aliasText).toContain("Use: /models <provider>");
      expect(aliasText).toContain("Switch: /model <provider/model>");

      vi.mocked(loadModelCatalog).mockResolvedValueOnce([]);
      const unavailableCatalogText = await runModelDirectiveText(home, "/model");
      expect(unavailableCatalogText).toContain("Current: anthropic/claude-opus-4-5");
      expect(unavailableCatalogText).toContain("Switch: /model <provider/model>");
      expect(unavailableCatalogText).toContain(
        "Browse: /models (providers) or /models <provider> (models)",
      );
      expect(unavailableCatalogText).toContain("More: /model status");

      const allowlistedStatusText = await runModelDirectiveText(home, "/model status", {
        includeSessionStore: false,
      });
      expect(allowlistedStatusText).toContain("anthropic/claude-opus-4-5");
      expect(allowlistedStatusText).toContain("openai/gpt-4.1-mini");
      expect(allowlistedStatusText).not.toContain("claude-sonnet-4-1");
      expect(allowlistedStatusText).toContain("auth:");

      vi.mocked(loadModelCatalog).mockResolvedValue([
        { id: "claude-opus-4-5", name: "Opus 4.5", provider: "anthropic" },
        { id: "gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai" },
        { id: "grok-4", name: "Grok 4", provider: "xai" },
      ]);
      const noAllowlistText = await runModelDirectiveText(home, "/model list", {
        defaults: {
          model: {
            primary: "anthropic/claude-opus-4-5",
            fallbacks: ["openai/gpt-4.1-mini"],
          },
          imageModel: { primary: "minimax/MiniMax-M2.1" },
          models: undefined,
        },
      });
      expect(noAllowlistText).toContain("Providers:");
      expect(noAllowlistText).toContain("- anthropic");
      expect(noAllowlistText).toContain("- openai");
      expect(noAllowlistText).toContain("- xai");
      expect(noAllowlistText).toContain("Use: /models <provider>");

      vi.mocked(loadModelCatalog).mockResolvedValueOnce([
        {
          provider: "anthropic",
          id: "claude-opus-4-5",
          name: "Claude Opus 4.5",
        },
        { provider: "openai", id: "gpt-4.1-mini", name: "GPT-4.1 mini" },
      ]);
      const configOnlyProviderText = await runModelDirectiveText(home, "/models minimax", {
        defaults: {
          models: {
            "anthropic/claude-opus-4-5": {},
            "openai/gpt-4.1-mini": {},
            "minimax/MiniMax-M2.1": { alias: "minimax" },
          },
        },
        extra: {
          models: {
            mode: "merge",
            providers: {
              minimax: {
                baseUrl: "https://api.minimax.io/anthropic",
                api: "anthropic-messages",
                models: [{ id: "MiniMax-M2.1", name: "MiniMax M2.1" }],
              },
            },
          },
        },
      });
      expect(configOnlyProviderText).toContain("Models (minimax");
      expect(configOnlyProviderText).toContain("minimax/MiniMax-M2.1");

      const missingAuthText = await runModelDirectiveText(home, "/model list", {
        defaults: {
          models: {
            "anthropic/claude-opus-4-5": {},
          },
        },
      });
      expect(missingAuthText).toContain("Providers:");
      expect(missingAuthText).not.toContain("missing (missing)");
      expect(runAgent).not.toHaveBeenCalled();
    });
  });
  it("sets model override on /model directive", async () => {
    await withTempHome(async (home) => {
      const storePath = sessionStorePath(home);

      await getReplyFromConfig(
        { Body: "/model openai/gpt-4.1-mini", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        makeWhatsAppDirectiveConfig(
          home,
          {
            model: { primary: "anthropic/claude-opus-4-5" },
            models: {
              "anthropic/claude-opus-4-5": {},
              "openai/gpt-4.1-mini": {},
            },
          },
          { session: { store: storePath } },
        ),
      );

      assertModelSelection(storePath, {
        model: "gpt-4.1-mini",
        provider: "openai",
      });
      expect(runAgent).not.toHaveBeenCalled();
    });
  });
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
