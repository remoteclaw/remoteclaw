import "./reply.directive.directive-behavior.e2e-mocks.js";
import { describe, expect, it, vi } from "vitest";
import { loadSessionStore } from "../config/sessions.js";
import {
  installDirectiveBehaviorE2EHooks,
  makeAgentTextResult,
  makeWhatsAppDirectiveConfig,
  replyText,
  replyTexts,
  runAgent,
  sessionStorePath,
  withTempHome,
} from "./reply.directive.directive-behavior.e2e-harness.js";
import { getReplyFromConfig } from "./reply.js";

function mockEmbeddedResponse(text: string) {
  vi.mocked(runAgent).mockResolvedValue(makeAgentTextResult(text));
}

async function runInlineReasoningMessage(params: {
  home: string;
  body: string;
  storePath: string;
  blockReplies: string[];
}) {
  return await getReplyFromConfig(
    {
      Body: params.body,
      From: "+1222",
      To: "+1222",
      Provider: "whatsapp",
    },
    {
      onBlockReply: (payload) => {
        if (payload.text) {
          params.blockReplies.push(payload.text);
        }
      },
    },
    makeWhatsAppDirectiveConfig(
      params.home,
      { model: "anthropic/claude-opus-4-5" },
      {
        session: { store: params.storePath },
      },
    ),
  );
}

function makeRunConfig(home: string, storePath: string) {
  return makeWhatsAppDirectiveConfig(
    home,
    { model: "anthropic/claude-opus-4-5" },
    { session: { store: storePath } },
  );
}

async function runInFlightVerboseToggleCase(params: {
  home: string;
  toggledVerboseLevel: "on" | "off";
  seedVerboseOn?: boolean;
}) {
  const storePath = sessionStorePath(params.home);
  const ctx = {
    Body: "please do the thing",
    From: "+1004",
    To: "+2000",
  };

  // The bridge mock delegates to runAgent; mock it to return success.
  vi.mocked(runAgent).mockResolvedValue(makeAgentTextResult("done"));

  if (params.seedVerboseOn) {
    await getReplyFromConfig(
      { Body: "/verbose on", From: ctx.From, To: ctx.To, CommandAuthorized: true },
      {},
      makeRunConfig(params.home, storePath),
    );
  }

  const res = await getReplyFromConfig(ctx, {}, makeRunConfig(params.home, storePath));
  return { res };
}

describe("directive behavior", () => {
  installDirectiveBehaviorE2EHooks();

  it("keeps reasoning acks out of mixed messages, including rapid repeats", async () => {
    await withTempHome(async (home) => {
      mockEmbeddedResponse("done");

      const blockReplies: string[] = [];
      const storePath = sessionStorePath(home);

      const firstRes = await runInlineReasoningMessage({
        home,
        body: "please reply\n/reasoning on",
        storePath,
        blockReplies,
      });
      expect(replyTexts(firstRes)).toContain("done");

      await runInlineReasoningMessage({
        home,
        body: "again\n/reasoning on",
        storePath,
        blockReplies,
      });

      expect(runAgent).toHaveBeenCalledTimes(2);
      expect(blockReplies.length).toBe(0);
    });
  });
  it("handles standalone verbose directives and persistence", async () => {
    await withTempHome(async (home) => {
      const storePath = sessionStorePath(home);

      const enabledRes = await getReplyFromConfig(
        { Body: "/verbose on", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        makeWhatsAppDirectiveConfig(home, { model: "anthropic/claude-opus-4-5" }),
      );
      expect(replyText(enabledRes)).toMatch(/^⚙️ Verbose logging enabled\./);

      const disabledRes = await getReplyFromConfig(
        { Body: "/verbose off", From: "+1222", To: "+1222", CommandAuthorized: true },
        {},
        makeWhatsAppDirectiveConfig(
          home,
          { model: "anthropic/claude-opus-4-5" },
          {
            session: { store: storePath },
          },
        ),
      );

      const text = replyText(disabledRes);
      expect(text).toMatch(/Verbose logging disabled\./);
      const store = loadSessionStore(storePath);
      const entry = Object.values(store)[0];
      expect(entry?.verboseLevel).toBe("off");
      expect(runAgent).not.toHaveBeenCalled();
    });
  });
  it("runs agent with verbose toggle on/off", async () => {
    await withTempHome(async (home) => {
      for (const testCase of [
        { toggledVerboseLevel: "on" as const },
        { toggledVerboseLevel: "off" as const, seedVerboseOn: true },
      ]) {
        vi.mocked(runAgent).mockClear();
        const { res } = await runInFlightVerboseToggleCase({
          home,
          ...testCase,
        });
        const texts = replyTexts(res);
        expect(texts).toContain("done");
        expect(runAgent).toHaveBeenCalledOnce();
      }
    });
  });
  it("keeps reserved command aliases from matching after trimming", async () => {
    await withTempHome(async (home) => {
      const res = await getReplyFromConfig(
        {
          Body: "/help",
          From: "+1222",
          To: "+1222",
          CommandAuthorized: true,
        },
        {},
        makeWhatsAppDirectiveConfig(
          home,
          {
            model: "anthropic/claude-opus-4-5",
            models: {
              "anthropic/claude-opus-4-5": { alias: " help " },
            },
          },
          { session: { store: sessionStorePath(home) } },
        ),
      );

      const text = replyText(res);
      expect(text).toContain("Help");
      expect(runAgent).not.toHaveBeenCalled();
    });
  });
  it("reports invalid queue options and current queue settings", async () => {
    await withTempHome(async (home) => {
      const invalidRes = await getReplyFromConfig(
        {
          Body: "/queue collect debounce:bogus cap:zero drop:maybe",
          From: "+1222",
          To: "+1222",
          CommandAuthorized: true,
        },
        {},
        makeWhatsAppDirectiveConfig(
          home,
          { model: "anthropic/claude-opus-4-5" },
          {
            session: { store: sessionStorePath(home) },
          },
        ),
      );

      const invalidText = replyText(invalidRes);
      expect(invalidText).toContain("Invalid debounce");
      expect(invalidText).toContain("Invalid cap");
      expect(invalidText).toContain("Invalid drop policy");

      const currentRes = await getReplyFromConfig(
        {
          Body: "/queue",
          From: "+1222",
          To: "+1222",
          Provider: "whatsapp",
          CommandAuthorized: true,
        },
        {},
        makeWhatsAppDirectiveConfig(
          home,
          { model: "anthropic/claude-opus-4-5" },
          {
            messages: {
              queue: {
                mode: "collect",
                debounceMs: 1500,
                cap: 9,
                drop: "summarize",
              },
            },
            session: { store: sessionStorePath(home) },
          },
        ),
      );

      const text = replyText(currentRes);
      expect(text).toContain(
        "Current queue settings: mode=collect, debounce=1500ms, cap=9, drop=summarize.",
      );
      expect(text).toContain(
        "Options: modes steer, followup, collect, steer+backlog, interrupt; debounce:<ms|s|m>, cap:<n>, drop:old|new|summarize.",
      );
      expect(runAgent).not.toHaveBeenCalled();
    });
  });
});
