import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDeps } from "../cli/deps.js";
import { makeCfg, makeJob, withTempCronHome } from "./isolated-agent.test-harness.js";
import type { CronJob } from "./types.js";

vi.mock("../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/index.js")>();
  return {
    ...actual,
    ChannelBridge: vi.fn(),
    createCliRuntime: vi.fn(),
  };
});
import { ChannelBridge } from "../middleware/index.js";
import { runCronIsolatedAgentTurn } from "./isolated-agent.js";
const withTempHome = withTempCronHome;

const mockHandle = vi.fn();

function makeDeps(): CliDeps {
  return {
    sendMessageSlack: vi.fn(),
    sendMessageWhatsApp: vi.fn(),
    sendMessageTelegram: vi.fn(),
    sendMessageDiscord: vi.fn(),
    sendMessageSignal: vi.fn(),
    sendMessageIMessage: vi.fn(),
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

function mockBridgeOk() {
  mockBridgeReply("ok");
}

function expectBridgeModel(expected: { model: string }) {
  const ctorArgs = vi.mocked(ChannelBridge).mock.calls[0]?.[0] as {
    defaultModel?: string;
  };
  expect(ctorArgs?.defaultModel).toBe(expected.model);
}

async function writeSessionStore(
  home: string,
  entries: Record<string, Record<string, unknown>> = {},
) {
  const dir = path.join(home, ".remoteclaw", "sessions");
  await fs.mkdir(dir, { recursive: true });
  const storePath = path.join(dir, "sessions.json");
  await fs.writeFile(
    storePath,
    JSON.stringify(
      {
        "agent:main:main": {
          sessionId: "main-session",
          updatedAt: Date.now(),
          lastProvider: "webchat",
          lastTo: "",
        },
        ...entries,
      },
      null,
      2,
    ),
    "utf-8",
  );
  return storePath;
}

async function readSessionEntry(storePath: string, key: string) {
  const raw = await fs.readFile(storePath, "utf-8");
  const store = JSON.parse(raw) as Record<string, { sessionId?: string; label?: string }>;
  return store[key];
}

const DEFAULT_MESSAGE = "do it";
const DEFAULT_SESSION_KEY = "cron:job-1";
const DEFAULT_AGENT_TURN_PAYLOAD: CronJob["payload"] = {
  kind: "agentTurn",
  message: DEFAULT_MESSAGE,
  deliver: false,
};
const GMAIL_MODEL = "openrouter/meta-llama/llama-3.3-70b:free";

type RunCronTurnOptions = {
  cfgOverrides?: Parameters<typeof makeCfg>[2];
  deps?: CliDeps;
  jobPayload?: CronJob["payload"];
  message?: string;
  mockText?: string | null;
  sessionKey?: string;
  storeEntries?: Record<string, Record<string, unknown>>;
  storePath?: string;
};

async function runCronTurn(home: string, options: RunCronTurnOptions = {}) {
  const storePath = options.storePath ?? (await writeSessionStore(home, options.storeEntries));
  const deps = options.deps ?? makeDeps();
  if (options.mockText === null) {
    mockHandle.mockReset();
  } else {
    mockBridgeReply(options.mockText ?? "ok");
  }

  const jobPayload = options.jobPayload ?? DEFAULT_AGENT_TURN_PAYLOAD;
  const res = await runCronIsolatedAgentTurn({
    cfg: makeCfg(home, storePath, options.cfgOverrides),
    deps,
    job: makeJob(jobPayload),
    message:
      options.message ?? (jobPayload.kind === "agentTurn" ? jobPayload.message : DEFAULT_MESSAGE),
    sessionKey: options.sessionKey ?? DEFAULT_SESSION_KEY,
    lane: "cron",
  });

  return { deps, res, storePath };
}

async function runGmailHookTurn(
  home: string,
  storeEntries?: Record<string, Record<string, unknown>>,
) {
  return runCronTurn(home, {
    cfgOverrides: {
      hooks: {
        gmail: {
          model: GMAIL_MODEL,
        },
      },
    },
    jobPayload: DEFAULT_AGENT_TURN_PAYLOAD,
    sessionKey: "hook:gmail:msg-1",
    storeEntries,
  });
}

async function runTurnWithStoredModelOverride(
  home: string,
  jobPayload: CronJob["payload"],
  modelOverride = "gpt-4.1-mini",
) {
  return runCronTurn(home, {
    jobPayload,
    storeEntries: {
      "agent:main:cron:job-1": {
        sessionId: "existing-cron-session",
        updatedAt: Date.now(),
        providerOverride: "openai",
        modelOverride,
      },
    },
  });
}

describe("runCronIsolatedAgentTurn", () => {
  beforeEach(() => {
    vi.mocked(ChannelBridge).mockClear();
    vi.mocked(ChannelBridge).mockImplementation(function () {
      return { handle: mockHandle };
    } as never);
    mockHandle.mockReset();
    mockBridgeOk();
  });

  it("treats blank model overrides as unset", async () => {
    await withTempHome(async (home) => {
      const { res } = await runCronTurn(home, {
        jobPayload: { kind: "agentTurn", message: DEFAULT_MESSAGE, model: "   " },
      });

      expect(res.status).toBe("ok");
      expect(mockHandle).toHaveBeenCalledTimes(1);
    });
  });

  it("uses last non-empty agent text as summary", async () => {
    await withTempHome(async (home) => {
      const { res } = await runCronTurn(home, {
        jobPayload: DEFAULT_AGENT_TURN_PAYLOAD,
        mockText: " last ",
      });

      expect(res.status).toBe("ok");
      expect(res.summary).toBe("last");
    });
  });

  it("appends current time after the cron header line", async () => {
    await withTempHome(async (home) => {
      await runCronTurn(home, {
        jobPayload: DEFAULT_AGENT_TURN_PAYLOAD,
      });

      const call = mockHandle.mock.calls.at(-1)?.[0] as {
        text?: string;
      };
      const lines = call?.text?.split("\n") ?? [];
      expect(lines[0]).toContain("[cron:job-1");
      expect(lines[0]).toContain("do it");
      expect(lines[1]).toMatch(/^Current time: .+ \(.+\)$/);
    });
  });

  it("uses agentId for workspace, session key, and store paths", async () => {
    await withTempHome(async (home) => {
      const deps = makeDeps();
      const opsWorkspace = path.join(home, "ops-workspace");
      mockBridgeOk();

      const cfg = makeCfg(
        home,
        path.join(home, ".remoteclaw", "agents", "{agentId}", "sessions", "sessions.json"),
        {
          agents: {
            defaults: { workspace: path.join(home, "default-workspace") },
            list: [
              { id: "main", default: true },
              { id: "ops", workspace: opsWorkspace },
            ],
          },
        },
      );

      const res = await runCronIsolatedAgentTurn({
        cfg,
        deps,
        job: {
          ...makeJob({
            kind: "agentTurn",
            message: DEFAULT_MESSAGE,
            deliver: false,
            channel: "last",
          }),
          agentId: "ops",
        },
        message: DEFAULT_MESSAGE,
        sessionKey: "cron:job-ops",
        agentId: "ops",
        lane: "cron",
      });

      expect(res.status).toBe("ok");
      const ctorArgs = vi.mocked(ChannelBridge).mock.calls.at(-1)?.[0] as {
        sessionDir?: string;
      };
      const msgArgs = mockHandle.mock.calls.at(-1)?.[0] as {
        workspaceDir?: string;
      };
      expect(ctorArgs?.sessionDir).toBe(opsWorkspace);
      expect(msgArgs?.workspaceDir).toBe(opsWorkspace);
      expect(res.sessionKey).toContain("agent:ops:cron:job-ops");
    });
  });

  it("uses model override when provided", async () => {
    await withTempHome(async (home) => {
      const { res } = await runCronTurn(home, {
        jobPayload: {
          kind: "agentTurn",
          message: DEFAULT_MESSAGE,
          model: "openai/gpt-4.1-mini",
        },
      });

      expect(res.status).toBe("ok");
      expectBridgeModel({ model: "gpt-4.1-mini" });
    });
  });

  it("uses stored session override when no job model override is provided", async () => {
    await withTempHome(async (home) => {
      const { res } = await runTurnWithStoredModelOverride(home, {
        kind: "agentTurn",
        message: DEFAULT_MESSAGE,
        deliver: false,
      });

      expect(res.status).toBe("ok");
      expectBridgeModel({ model: "gpt-4.1-mini" });
    });
  });

  it("prefers job model override over stored session override", async () => {
    await withTempHome(async (home) => {
      const { res } = await runTurnWithStoredModelOverride(home, {
        kind: "agentTurn",
        message: DEFAULT_MESSAGE,
        model: "anthropic/claude-opus-4-5",
        deliver: false,
      });

      expect(res.status).toBe("ok");
      expectBridgeModel({ model: "claude-opus-4-5" });
    });
  });

  it("uses hooks.gmail.model for Gmail hook sessions", async () => {
    await withTempHome(async (home) => {
      const { res } = await runGmailHookTurn(home);

      expect(res.status).toBe("ok");
      expectBridgeModel({
        model: GMAIL_MODEL.replace("openrouter/", ""),
      });
    });
  });

  it("keeps hooks.gmail.model precedence over stored session override", async () => {
    await withTempHome(async (home) => {
      const { res } = await runGmailHookTurn(home, {
        "agent:main:hook:gmail:msg-1": {
          sessionId: "existing-gmail-session",
          updatedAt: Date.now(),
          providerOverride: "anthropic",
          modelOverride: "claude-opus-4-5",
        },
      });

      expect(res.status).toBe("ok");
      expectBridgeModel({
        model: GMAIL_MODEL.replace("openrouter/", ""),
      });
    });
  });

  it("wraps external hook content by default", async () => {
    await withTempHome(async (home) => {
      const { res } = await runCronTurn(home, {
        jobPayload: { kind: "agentTurn", message: "Hello" },
        message: "Hello",
        sessionKey: "hook:gmail:msg-1",
      });

      expect(res.status).toBe("ok");
      const call = mockHandle.mock.calls[0]?.[0] as { text?: string };
      expect(call?.text).toContain("EXTERNAL, UNTRUSTED");
      expect(call?.text).toContain("Hello");
    });
  });

  it("skips external content wrapping when hooks.gmail opts out", async () => {
    await withTempHome(async (home) => {
      const { res } = await runCronTurn(home, {
        cfgOverrides: {
          hooks: {
            gmail: {
              allowUnsafeExternalContent: true,
            },
          },
        },
        jobPayload: { kind: "agentTurn", message: "Hello" },
        message: "Hello",
        sessionKey: "hook:gmail:msg-2",
      });

      expect(res.status).toBe("ok");
      const call = mockHandle.mock.calls[0]?.[0] as { text?: string };
      expect(call?.text).not.toContain("EXTERNAL, UNTRUSTED");
      expect(call?.text).toContain("Hello");
    });
  });

  it("applies hooks.gmail.model regardless of models config", async () => {
    await withTempHome(async (home) => {
      const { res } = await runCronTurn(home, {
        cfgOverrides: {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
            },
          },
          hooks: {
            gmail: {
              model: "openrouter/meta-llama/llama-3.3-70b:free",
            },
          },
        },
        jobPayload: DEFAULT_AGENT_TURN_PAYLOAD,
        sessionKey: "hook:gmail:msg-2",
      });

      expect(res.status).toBe("ok");
      expectBridgeModel({ model: "meta-llama/llama-3.3-70b:free" });
    });
  });

  it("rejects invalid model override", async () => {
    await withTempHome(async (home) => {
      const { res } = await runCronTurn(home, {
        jobPayload: {
          kind: "agentTurn",
          message: DEFAULT_MESSAGE,
          model: "openai/",
        },
        mockText: null,
      });

      expect(res.status).toBe("error");
      expect(res.error).toMatch("invalid model");
      expect(vi.mocked(ChannelBridge)).not.toHaveBeenCalled();
    });
  });

  it("truncates long summaries", async () => {
    await withTempHome(async (home) => {
      const long = "a".repeat(2001);
      const { res } = await runCronTurn(home, {
        jobPayload: DEFAULT_AGENT_TURN_PAYLOAD,
        mockText: long,
      });

      expect(res.status).toBe("ok");
      expect(String(res.summary ?? "")).toMatch(/…$/);
    });
  });

  it("starts a fresh session id for each cron run", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const deps = makeDeps();

      const first = (
        await runCronTurn(home, {
          deps,
          jobPayload: { kind: "agentTurn", message: "ping", deliver: false },
          message: "ping",
          mockText: "ok",
          storePath,
        })
      ).res;

      const second = (
        await runCronTurn(home, {
          deps,
          jobPayload: { kind: "agentTurn", message: "ping", deliver: false },
          message: "ping",
          mockText: "ok",
          storePath,
        })
      ).res;

      expect(first.sessionId).toBeDefined();
      expect(second.sessionId).toBeDefined();
      expect(second.sessionId).not.toBe(first.sessionId);
      expect(first.sessionKey).toMatch(/^agent:main:cron:job-1:run:/);
      expect(second.sessionKey).toMatch(/^agent:main:cron:job-1:run:/);
      expect(second.sessionKey).not.toBe(first.sessionKey);
    });
  });

  it("preserves an existing cron session label", async () => {
    await withTempHome(async (home) => {
      const storePath = await writeSessionStore(home);
      const raw = await fs.readFile(storePath, "utf-8");
      const store = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      store["agent:main:cron:job-1"] = {
        sessionId: "old",
        updatedAt: Date.now(),
        label: "Nightly digest",
      };
      await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");

      await runCronTurn(home, {
        jobPayload: { kind: "agentTurn", message: "ping", deliver: false },
        message: "ping",
        storePath,
      });
      const entry = await readSessionEntry(storePath, "agent:main:cron:job-1");

      expect(entry?.label).toBe("Nightly digest");
    });
  });
});
