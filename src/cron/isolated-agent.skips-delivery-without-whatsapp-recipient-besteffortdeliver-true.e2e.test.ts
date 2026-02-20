import "./isolated-agent.mocks.js";
import fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runSubagentAnnounceFlow } from "../agents/subagent-announce.js";
import type { CliDeps } from "../cli/deps.js";
import { ChannelBridge } from "../middleware/index.js";
import { runCronIsolatedAgentTurn } from "./isolated-agent.js";
import {
  makeCfg,
  makeJob,
  withTempCronHome,
  writeSessionStore,
} from "./isolated-agent.test-harness.js";
import { setupIsolatedAgentTurnMocks } from "./isolated-agent.test-setup.js";

const mockHandle = vi.fn();

function createCliDeps(overrides: Partial<CliDeps> = {}): CliDeps {
  return {
    sendMessageSlack: vi.fn(),
    sendMessageWhatsApp: vi.fn(),
    sendMessageTelegram: vi.fn(),
    sendMessageDiscord: vi.fn(),
    sendMessageSignal: vi.fn(),
    sendMessageIMessage: vi.fn(),
    ...overrides,
  };
}

function mockBridgeReply(text: string) {
  mockHandle.mockResolvedValue({
    text,
    sessionId: "s",
    durationMs: 5,
    usage: undefined,
    aborted: false,
    error: undefined,
  });
}

async function runTelegramAnnounceTurn(params: {
  home: string;
  storePath: string;
  deps: CliDeps;
  delivery: {
    mode: "announce";
    channel: string;
    to?: string;
    bestEffort?: boolean;
  };
}): Promise<Awaited<ReturnType<typeof runCronIsolatedAgentTurn>>> {
  return runCronIsolatedAgentTurn({
    cfg: makeCfg(params.home, params.storePath, {
      channels: { telegram: { botToken: "t-1" } },
    }),
    deps: params.deps,
    job: {
      ...makeJob({ kind: "agentTurn", message: "do it" }),
      delivery: params.delivery,
    },
    message: "do it",
    sessionKey: "cron:job-1",
    lane: "cron",
  });
}

describe("runCronIsolatedAgentTurn", () => {
  beforeEach(() => {
    vi.mocked(ChannelBridge).mockImplementation(function () {
      return { handle: mockHandle };
    } as never);
    mockHandle.mockReset();
    mockHandle.mockResolvedValue({
      text: "ok",
      sessionId: "s",
      durationMs: 5,
      usage: undefined,
      aborted: false,
      error: undefined,
    });
    setupIsolatedAgentTurnMocks();
  });

  it("routes text-only explicit target delivery through announce flow", async () => {
    await withTempCronHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      const deps = createCliDeps();
      mockBridgeReply("hello from cron");
      const res = await runTelegramAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: { mode: "announce", channel: "telegram", to: "123" },
      });

      expect(res.status).toBe("ok");
      expect(res.delivered).toBe(true);
      expect(runSubagentAnnounceFlow).toHaveBeenCalledTimes(1);
      const announceArgs = vi.mocked(runSubagentAnnounceFlow).mock.calls[0]?.[0] as
        | {
            requesterOrigin?: { channel?: string; to?: string };
            roundOneReply?: string;
          }
        | undefined;
      expect(announceArgs?.requesterOrigin?.channel).toBe("telegram");
      expect(announceArgs?.requesterOrigin?.to).toBe("123");
      expect(announceArgs?.roundOneReply).toBe("hello from cron");
      expect(deps.sendMessageTelegram).not.toHaveBeenCalled();
    });
  });

  it("routes announce injection to the agent main session key", async () => {
    await withTempCronHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      const deps = createCliDeps();
      mockBridgeReply("hello from cron");

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath, {
          channels: {
            telegram: { botToken: "t-1" },
          },
        }),
        deps,
        job: {
          ...makeJob({ kind: "agentTurn", message: "do it" }),
          delivery: { mode: "announce", channel: "telegram", to: "123" },
        },
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      expect(runSubagentAnnounceFlow).toHaveBeenCalledTimes(1);
      const announceArgs = vi.mocked(runSubagentAnnounceFlow).mock.calls[0]?.[0] as
        | {
            requesterSessionKey?: string;
            requesterOrigin?: { channel?: string; to?: string };
          }
        | undefined;
      expect(announceArgs?.requesterSessionKey).toBe("agent:main:main");
      expect(announceArgs?.requesterOrigin?.channel).toBe("telegram");
      expect(announceArgs?.requesterOrigin?.to).toBe("123");
    });
  });

  it("passes resolved threadId into shared subagent announce flow", async () => {
    await withTempCronHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      await fs.writeFile(
        storePath,
        JSON.stringify(
          {
            "agent:main:main": {
              sessionId: "main-session",
              updatedAt: Date.now(),
              lastChannel: "telegram",
              lastTo: "123",
              lastThreadId: 42,
            },
          },
          null,
          2,
        ),
        "utf-8",
      );
      const deps = createCliDeps();
      mockBridgeReply("Final weather summary");
      const res = await runTelegramAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: { mode: "announce", channel: "last" },
      });

      expect(res.status).toBe("ok");
      expect(runSubagentAnnounceFlow).toHaveBeenCalledTimes(1);
      const announceArgs = vi.mocked(runSubagentAnnounceFlow).mock.calls[0]?.[0] as
        | { requesterOrigin?: { threadId?: string | number; channel?: string; to?: string } }
        | undefined;
      expect(announceArgs?.requesterOrigin?.channel).toBe("telegram");
      expect(announceArgs?.requesterOrigin?.to).toBe("123");
      expect(announceArgs?.requesterOrigin?.threadId).toBe(42);
    });
  });

  it("skips announce for heartbeat-only output", async () => {
    await withTempCronHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      const deps = createCliDeps();
      mockBridgeReply("HEARTBEAT_OK");
      const res = await runTelegramAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: { mode: "announce", channel: "telegram", to: "123" },
      });

      expect(res.status).toBe("ok");
      expect(runSubagentAnnounceFlow).not.toHaveBeenCalled();
      expect(deps.sendMessageTelegram).not.toHaveBeenCalled();
    });
  });

  it("reports not-delivered when best-effort announce fails", async () => {
    await withTempCronHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      const deps = createCliDeps();
      mockBridgeReply("hello from cron");
      vi.mocked(runSubagentAnnounceFlow).mockResolvedValueOnce(false);

      const res = await runTelegramAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: { mode: "announce", channel: "telegram", to: "123", bestEffort: true },
      });

      expect(res.status).toBe("ok");
      expect(res.delivered).toBeFalsy();
    });
  });

  it("fails when announce delivery fails and best-effort is disabled", async () => {
    await withTempCronHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      const deps = createCliDeps();
      mockBridgeReply("hello from cron");
      vi.mocked(runSubagentAnnounceFlow).mockResolvedValueOnce(false);

      const res = await runTelegramAnnounceTurn({
        home,
        storePath,
        deps,
        delivery: { mode: "announce", channel: "telegram", to: "123" },
      });

      expect(res.status).toBe("error");
      expect(res.error).toContain("announce delivery failed");
    });
  });

  it("passes cleanup=delete to announce flow when job.deleteAfterRun is true", async () => {
    await withTempCronHome(async (home) => {
      const storePath = await writeSessionStore(home, { lastProvider: "webchat", lastTo: "" });
      const deps = createCliDeps();
      mockBridgeReply("result text");

      const res = await runCronIsolatedAgentTurn({
        cfg: makeCfg(home, storePath, {
          channels: { telegram: { botToken: "t-1" } },
        }),
        deps,
        job: {
          ...makeJob({ kind: "agentTurn", message: "do it" }),
          deleteAfterRun: true,
          delivery: { mode: "announce", channel: "telegram", to: "123" },
        },
        message: "do it",
        sessionKey: "cron:job-1",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      expect(runSubagentAnnounceFlow).toHaveBeenCalledTimes(1);
      const announceArgs = vi.mocked(runSubagentAnnounceFlow).mock.calls[0]?.[0] as
        | { cleanup?: "keep" | "delete" }
        | undefined;
      expect(announceArgs?.cleanup).toBe("delete");
    });
  });
});
