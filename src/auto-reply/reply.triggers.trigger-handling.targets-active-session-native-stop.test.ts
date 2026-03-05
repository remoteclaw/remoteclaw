import fs from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadSessionStore } from "../config/sessions.js";
import { registerGroupIntroPromptCases } from "./reply.triggers.group-intro-prompts.cases.js";
import { registerTriggerHandlingUsageSummaryCases } from "./reply.triggers.trigger-handling.filters-usage-summary-current-model-provider.cases.js";
import {
  expectInlineCommandHandledAndStripped,
  getRunAgentMock,
  installTriggerHandlingE2eTestHooks,
  MAIN_SESSION_KEY,
  makeCfg,
  mockRunAgentOk,
  requireSessionStorePath,
  runGreetingPromptForBareNewOrReset,
  withTempHome,
} from "./reply.triggers.trigger-handling.test-harness.js";
import { enqueueFollowupRun, getFollowupQueueDepth, type FollowupRun } from "./reply/queue.js";

let getReplyFromConfig: typeof import("./reply.js").getReplyFromConfig;
let previousFastTestEnv: string | undefined;
beforeAll(async () => {
  previousFastTestEnv = process.env.REMOTECLAW_TEST_FAST;
  process.env.REMOTECLAW_TEST_FAST = "1";
  ({ getReplyFromConfig } = await import("./reply.js"));
});
afterAll(() => {
  if (previousFastTestEnv === undefined) {
    delete process.env.REMOTECLAW_TEST_FAST;
    return;
  }
  process.env.REMOTECLAW_TEST_FAST = previousFastTestEnv;
});

installTriggerHandlingE2eTestHooks();

const BASE_MESSAGE = {
  Body: "hello",
  From: "+1002",
  To: "+2000",
} as const;

function maybeReplyText(reply: Awaited<ReturnType<typeof getReplyFromConfig>>) {
  return Array.isArray(reply) ? reply[0]?.text : reply?.text;
}

function mockAgentOkPayload() {
  return mockRunAgentOk("ok");
}

async function writeStoredModelOverride(cfg: ReturnType<typeof makeCfg>): Promise<void> {
  await fs.writeFile(
    requireSessionStorePath(cfg),
    JSON.stringify({
      [MAIN_SESSION_KEY]: {
        sessionId: "main",
        updatedAt: Date.now(),
        providerOverride: "openai",
        modelOverride: "gpt-5.2",
      },
    }),
    "utf-8",
  );
}

function makeUnauthorizedWhatsAppCfg(home: string) {
  const baseCfg = makeCfg(home);
  return {
    ...baseCfg,
    channels: {
      ...baseCfg.channels,
      whatsapp: {
        allowFrom: ["+1000"],
      },
    },
  };
}

async function expectResetBlockedForNonOwner(params: { home: string }): Promise<void> {
  const { home } = params;
  const runAgentMock = getRunAgentMock();
  runAgentMock.mockClear();
  const cfg = makeCfg(home);
  cfg.channels ??= {};
  cfg.channels.whatsapp = {
    ...cfg.channels.whatsapp,
    allowFrom: ["+1999"],
  };
  cfg.session = {
    ...cfg.session,
    store: join(home, "blocked-reset.sessions.json"),
  };
  const res = await getReplyFromConfig(
    {
      Body: "/reset",
      From: "+1003",
      To: "+2000",
      CommandAuthorized: true,
    },
    {},
    cfg,
  );
  expect(res).toBeUndefined();
  expect(runAgentMock).not.toHaveBeenCalled();
}

function mockAgentOk() {
  return mockRunAgentOk("ok");
}

async function runInlineUnauthorizedCommand(params: { home: string; command: "/status" }) {
  const cfg = makeUnauthorizedWhatsAppCfg(params.home);
  const res = await getReplyFromConfig(
    {
      Body: `please ${params.command} now`,
      From: "+2001",
      To: "+2000",
      Provider: "whatsapp",
      SenderE164: "+2001",
    },
    {},
    cfg,
  );
  return res;
}

describe("trigger handling", () => {
  registerGroupIntroPromptCases({
    getReplyFromConfig: () => getReplyFromConfig,
  });
  registerTriggerHandlingUsageSummaryCases({
    getReplyFromConfig: () => getReplyFromConfig,
  });

  it("handles trigger command and heartbeat flows end-to-end", async () => {
    await withTempHome(async (home) => {
      const runAgentMock = getRunAgentMock();
      const errorCases = [
        {
          error: "sandbox is not defined.",
          expected:
            "⚠️ Agent failed before reply: sandbox is not defined.\nLogs: remoteclaw logs --follow",
        },
        {
          error: "Context window exceeded",
          expected:
            "⚠️ Context overflow — prompt too large for this model. Try a shorter message or a larger-context model.",
        },
      ] as const;
      for (const testCase of errorCases) {
        runAgentMock.mockClear();
        runAgentMock.mockRejectedValue(new Error(testCase.error));
        const errorRes = await getReplyFromConfig(BASE_MESSAGE, {}, makeCfg(home));
        expect(maybeReplyText(errorRes), testCase.error).toBe(testCase.expected);
        expect(runAgentMock, testCase.error).toHaveBeenCalledOnce();
      }

      const thinkCases = [
        {
          label: "context-wrapper",
          request: {
            Body: [
              "[Chat messages since your last reply - for context]",
              "Peter: /thinking high [2025-12-05T21:45:00.000Z]",
              "",
              "[Current message - respond to this]",
              "Give me the status",
            ].join("\n"),
            From: "+1002",
            To: "+2000",
          },
          options: {},
          assertPrompt: true,
        },
        {
          label: "heartbeat",
          request: {
            Body: "HEARTBEAT /think:high",
            From: "+1003",
            To: "+1003",
          },
          options: { isHeartbeat: true },
          assertPrompt: false,
        },
      ] as const;
      runAgentMock.mockClear();
      for (const testCase of thinkCases) {
        mockRunAgentOk();
        const res = await getReplyFromConfig(testCase.request, testCase.options, makeCfg(home));
        const text = maybeReplyText(res);
        expect(text, testCase.label).toBe("ok");
        expect(text, testCase.label).not.toMatch(/Thinking level set/i);
        expect(getRunAgentMock(), testCase.label).toHaveBeenCalledOnce();
        if (testCase.assertPrompt) {
          const prompt = getRunAgentMock().mock.calls[0]?.[0]?.prompt ?? "";
          expect(prompt).toContain("Give me the status");
          expect(prompt).not.toContain("/thinking high");
          expect(prompt).not.toContain("/think high");
        }
        getRunAgentMock().mockClear();
      }

      // Heartbeat model override: agents.defaults.heartbeat.model config takes effect
      {
        mockAgentOkPayload();
        runAgentMock.mockClear();
        const cfg = makeCfg(home);
        cfg.session = { ...cfg.session, store: join(home, "heartbeat-override.sessions.json") };
        await writeStoredModelOverride(cfg);
        cfg.agents = {
          ...cfg.agents,
          defaults: {
            ...cfg.agents?.defaults,
            heartbeat: { model: "anthropic/claude-haiku-4-5-20251001" },
          },
        };
        await getReplyFromConfig(BASE_MESSAGE, { isHeartbeat: true }, cfg);

        const call = runAgentMock.mock.calls[0]?.[0];
        expect(call?.provider).toBe("anthropic");
      }
      {
        const cfg = makeCfg(home);
        cfg.session = { ...cfg.session, store: join(home, "native-stop.sessions.json") };
        const storePath = cfg.session?.store;
        if (!storePath) {
          throw new Error("missing session store path");
        }
        const targetSessionKey = "agent:main:telegram:group:123";
        const targetSessionId = "session-target";
        await fs.writeFile(
          storePath,
          JSON.stringify({
            [targetSessionKey]: {
              sessionId: targetSessionId,
              updatedAt: Date.now(),
            },
          }),
        );
        const followupRun: FollowupRun = {
          prompt: "queued",
          enqueuedAt: Date.now(),
          run: {
            agentId: "main",
            agentDir: join(home, "agent"),
            sessionId: targetSessionId,
            sessionKey: targetSessionKey,
            messageProvider: "telegram",
            agentAccountId: "acct",
            sessionFile: join(home, "session.jsonl"),
            workspaceDir: join(home, "workspace"),
            config: cfg,
            provider: "anthropic",
            model: "claude-opus-4-5",
            timeoutMs: 10,
            blockReplyBreak: "text_end",
          },
        };
        enqueueFollowupRun(
          targetSessionKey,
          followupRun,
          { mode: "collect", debounceMs: 0, cap: 20, dropPolicy: "summarize" },
          "none",
        );
        expect(getFollowupQueueDepth(targetSessionKey)).toBe(1);

        const res = await getReplyFromConfig(
          {
            Body: "/stop",
            From: "telegram:111",
            To: "telegram:111",
            ChatType: "direct",
            Provider: "telegram",
            Surface: "telegram",
            SessionKey: "telegram:slash:111",
            CommandSource: "native",
            CommandTargetSessionKey: targetSessionKey,
            CommandAuthorized: true,
          },
          {},
          cfg,
        );

        const text = Array.isArray(res) ? res[0]?.text : res?.text;
        expect(text).toBe("⚙️ Agent was aborted.");
        const store = loadSessionStore(storePath);
        expect(store[targetSessionKey]?.abortedLastRun).toBe(true);
        expect(getFollowupQueueDepth(targetSessionKey)).toBe(0);
      }

      await runGreetingPromptForBareNewOrReset({ home, body: "/new", getReplyFromConfig });
      await expectResetBlockedForNonOwner({ home });
      await expectInlineCommandHandledAndStripped({
        home,
        getReplyFromConfig,
        body: "please /whoami now",
        stripToken: "/whoami",
        blockReplyContains: "Identity",
        requestOverrides: { SenderId: "12345" },
      });
      const inlineRunAgentMock = mockAgentOk();
      const res = await runInlineUnauthorizedCommand({
        home,
        command: "/status",
      });
      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("ok");
      expect(inlineRunAgentMock).toHaveBeenCalled();
      const prompt = inlineRunAgentMock.mock.calls.at(-1)?.[0]?.prompt ?? "";
      expect(prompt).toContain("/status");
    });
  });
});
