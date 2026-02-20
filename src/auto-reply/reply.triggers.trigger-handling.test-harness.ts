import fs from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import type { RemoteClawConfig } from "../config/config.js";
import type { AgentRunLoopResult } from "./reply/agent-runner-execution.js";

// Avoid exporting vitest mock types (TS2742 under pnpm + d.ts emit).
// oxlint-disable-next-line typescript/no-explicit-any
type AnyMock = any;
// oxlint-disable-next-line typescript/no-explicit-any
type AnyMocks = Record<string, any>;

const agentRunnerMocks = vi.hoisted(() => ({
  runAgentTurnWithFallback: vi.fn(),
}));

export function getRunAgentTurnMock(): AnyMock {
  return agentRunnerMocks.runAgentTurnWithFallback;
}

vi.mock("./reply/agent-runner-execution.js", () => ({
  runAgentTurnWithFallback: (params: unknown) => agentRunnerMocks.runAgentTurnWithFallback(params),
}));

const providerUsageMocks = vi.hoisted(() => ({
  loadProviderUsageSummary: vi.fn().mockResolvedValue({
    updatedAt: 0,
    providers: [],
  }),
  formatUsageSummaryLine: vi.fn().mockReturnValue("📊 Usage: Claude 80% left"),
  formatUsageWindowSummary: vi.fn().mockReturnValue("Claude 80% left"),
  resolveUsageProviderId: vi.fn((provider: string) => provider.split("/")[0]),
}));

export function getProviderUsageMocks(): AnyMocks {
  return providerUsageMocks;
}

vi.mock("../infra/provider-usage.js", () => providerUsageMocks);

const webSessionMocks = vi.hoisted(() => ({
  webAuthExists: vi.fn().mockResolvedValue(true),
  getWebAuthAgeMs: vi.fn().mockReturnValue(120_000),
  readWebSelfId: vi.fn().mockReturnValue({ e164: "+1999" }),
}));

export function getWebSessionMocks(): AnyMocks {
  return webSessionMocks;
}

vi.mock("../web/session.js", () => webSessionMocks);

export const MAIN_SESSION_KEY = "agent:main:main";

export async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(
    async (home) => {
      // Avoid cross-test leakage if a test doesn't touch these mocks.
      agentRunnerMocks.runAgentTurnWithFallback.mockClear();
      return await fn(home);
    },
    { prefix: "remoteclaw-triggers-" },
  );
}

export function makeCfg(home: string): RemoteClawConfig {
  return {
    agents: {
      defaults: {
        model: { primary: "anthropic/claude-opus-4-5" },
        workspace: join(home, "remoteclaw"),
      },
    },
    channels: {
      whatsapp: {
        allowFrom: ["*"],
      },
    },
    session: { store: join(home, "sessions.json") },
  } as RemoteClawConfig;
}

export async function loadGetReplyFromConfig() {
  return (await import("./reply.js")).getReplyFromConfig;
}

export function requireSessionStorePath(cfg: { session?: { store?: string } }): string {
  const storePath = cfg.session?.store;
  if (!storePath) {
    throw new Error("expected session store path");
  }
  return storePath;
}

export function makeWhatsAppElevatedCfg(
  home: string,
  opts?: { elevatedEnabled?: boolean; requireMentionInGroups?: boolean },
): RemoteClawConfig {
  const cfg = makeCfg(home);
  cfg.channels ??= {};
  cfg.channels.whatsapp = {
    ...cfg.channels.whatsapp,
    allowFrom: ["+1000"],
  };
  if (opts?.requireMentionInGroups !== undefined) {
    cfg.channels.whatsapp.groups = { "*": { requireMention: opts.requireMentionInGroups } };
  }

  cfg.tools = {
    ...cfg.tools,
    elevated: {
      allowFrom: { whatsapp: ["+1000"] },
      ...(opts?.elevatedEnabled === false ? { enabled: false } : {}),
    },
  };
  return cfg;
}

function makeSuccessResult(text: string): AgentRunLoopResult {
  return {
    kind: "success",
    runResult: {
      text,
      sessionId: "s",
      durationMs: 1,
      usage: undefined,
      aborted: false,
      error: undefined,
    },
    didLogHeartbeatStrip: false,
    autoCompactionCompleted: false,
  };
}

export async function runDirectElevatedToggleAndLoadStore(params: {
  cfg: RemoteClawConfig;
  getReplyFromConfig: typeof import("./reply.js").getReplyFromConfig;
  body?: string;
}): Promise<{
  text: string | undefined;
  store: Record<string, { elevatedLevel?: string }>;
}> {
  const res = await params.getReplyFromConfig(
    {
      Body: params.body ?? "/elevated on",
      From: "+1000",
      To: "+2000",
      Provider: "whatsapp",
      SenderE164: "+1000",
      CommandAuthorized: true,
    },
    {},
    params.cfg,
  );
  const text = Array.isArray(res) ? res[0]?.text : res?.text;
  const storePath = params.cfg.session?.store;
  if (!storePath) {
    throw new Error("session.store is required in test config");
  }
  const storeRaw = await fs.readFile(storePath, "utf-8");
  const store = JSON.parse(storeRaw) as Record<string, { elevatedLevel?: string }>;
  return { text, store };
}

export async function runGreetingPromptForBareNewOrReset(params: {
  home: string;
  body: "/new" | "/reset";
  getReplyFromConfig: typeof import("./reply.js").getReplyFromConfig;
}) {
  getRunAgentTurnMock().mockResolvedValue(makeSuccessResult("hello"));

  const res = await params.getReplyFromConfig(
    {
      Body: params.body,
      From: "+1003",
      To: "+2000",
      CommandAuthorized: true,
    },
    {},
    makeCfg(params.home),
  );
  const text = Array.isArray(res) ? res[0]?.text : res?.text;
  expect(text).toBe("hello");
  expect(getRunAgentTurnMock()).toHaveBeenCalledOnce();
  const prompt = getRunAgentTurnMock().mock.calls[0]?.[0]?.commandBody ?? "";
  expect(prompt).toContain("A new session was started via /new or /reset");
}

export function installTriggerHandlingE2eTestHooks() {
  afterEach(() => {
    vi.restoreAllMocks();
  });
}

export function mockRunAgentTurnOk(text = "ok"): AnyMock {
  const mock = getRunAgentTurnMock();
  mock.mockResolvedValue(makeSuccessResult(text));
  return mock;
}

export function createBlockReplyCollector() {
  const blockReplies: Array<{ text?: string }> = [];
  return {
    blockReplies,
    handlers: {
      onBlockReply: async (payload: { text?: string }) => {
        blockReplies.push(payload);
      },
    },
  };
}
