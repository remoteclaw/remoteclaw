import fs from "node:fs/promises";
import os from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, expect, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import type { AgentDeliveryResult, BridgeCallbacks, ChannelMessage } from "../middleware/types.js";

// Avoid exporting vitest mock types (TS2742 under pnpm + d.ts emit).
// oxlint-disable-next-line typescript/no-explicit-any
type AnyMock = any;
// oxlint-disable-next-line typescript/no-explicit-any
type AnyMocks = Record<string, any>;

const bridgeMocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
}));

export function getRunAgentMock(): AnyMock {
  return bridgeMocks.runAgent;
}

/**
 * ChannelBridge mock that delegates to runAgent, bridging the
 * ChannelBridge interface to the agent interface so that existing
 * test assertions about runAgent calls continue to work.
 */
vi.mock("../middleware/channel-bridge.js", () => ({
  ChannelBridge: class MockChannelBridge {
    #provider: string;
    constructor(opts: { provider: string }) {
      this.#provider = opts.provider;
    }
    async handle(
      message: ChannelMessage,
      callbacks?: BridgeCallbacks,
    ): Promise<AgentDeliveryResult> {
      const embeddedParams = {
        prompt: message.text,
        extraSystemPrompt: message.extraContext,
        provider: this.#provider,
        onBlockReply: callbacks?.onBlockReply,
        onPartialReply: callbacks?.onPartialReply,
        onToolResult: callbacks?.onToolResult,
      };
      const result = await bridgeMocks.runAgent(embeddedParams);
      return {
        payloads: result?.payloads ?? [],
        run: {
          text: "",
          sessionId: result?.meta?.agentMeta?.sessionId,
          durationMs: result?.meta?.durationMs ?? 0,
          usage: result?.meta?.agentMeta?.usage
            ? {
                inputTokens: result.meta.agentMeta.usage.input ?? 0,
                outputTokens: result.meta.agentMeta.usage.output ?? 0,
              }
            : undefined,
          aborted: result?.meta?.aborted ?? false,
        },
        mcp: {
          sentTexts: result?.messagingToolSentTexts ?? [],
          sentMediaUrls: result?.messagingToolSentMediaUrls ?? [],
          sentTargets: result?.messagingToolSentTargets ?? [],
          cronAdds: result?.successfulCronAdds ?? 0,
        },
      };
    }
  },
}));

vi.mock("../config/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/paths.js")>();
  return {
    ...actual,
    resolveGatewayPort: () => 9999,
  };
});

vi.mock("../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: () => ({ token: "test-token" }),
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

const modelCatalogMocks = vi.hoisted(() => ({
  loadModelCatalog: vi.fn().mockResolvedValue([
    {
      provider: "anthropic",
      id: "claude-opus-4-5",
      name: "Claude Opus 4.5",
      contextWindow: 200000,
    },
    {
      provider: "openrouter",
      id: "anthropic/claude-opus-4-5",
      name: "Claude Opus 4.5 (OpenRouter)",
      contextWindow: 200000,
    },
    { provider: "openai", id: "gpt-4.1-mini", name: "GPT-4.1 mini" },
    { provider: "openai", id: "gpt-5.2", name: "GPT-5.2" },
    { provider: "openai-codex", id: "gpt-5.2", name: "GPT-5.2 (Codex)" },
    { provider: "minimax", id: "MiniMax-M2.1", name: "MiniMax M2.1" },
  ]),
  resetModelCatalogCacheForTest: vi.fn(),
}));

export function getModelCatalogMocks(): AnyMocks {
  return modelCatalogMocks;
}

vi.mock("../agents/model-catalog.js", () => modelCatalogMocks);

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

type TempHomeEnvSnapshot = {
  home: string | undefined;
  userProfile: string | undefined;
  homeDrive: string | undefined;
  homePath: string | undefined;
  openclawHome: string | undefined;
  stateDir: string | undefined;
};

let suiteTempHomeRoot = "";
let suiteTempHomeId = 0;

function snapshotTempHomeEnv(): TempHomeEnvSnapshot {
  return {
    home: process.env.HOME,
    userProfile: process.env.USERPROFILE,
    homeDrive: process.env.HOMEDRIVE,
    homePath: process.env.HOMEPATH,
    openclawHome: process.env.REMOTECLAW_HOME,
    stateDir: process.env.REMOTECLAW_STATE_DIR,
  };
}

function restoreTempHomeEnv(snapshot: TempHomeEnvSnapshot): void {
  const restoreKey = (key: string, value: string | undefined) => {
    if (value === undefined) {
      delete process.env[key];
      return;
    }
    process.env[key] = value;
  };

  restoreKey("HOME", snapshot.home);
  restoreKey("USERPROFILE", snapshot.userProfile);
  restoreKey("HOMEDRIVE", snapshot.homeDrive);
  restoreKey("HOMEPATH", snapshot.homePath);
  restoreKey("REMOTECLAW_HOME", snapshot.openclawHome);
  restoreKey("REMOTECLAW_STATE_DIR", snapshot.stateDir);
}

function setTempHomeEnv(home: string): void {
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  delete process.env.REMOTECLAW_HOME;
  process.env.REMOTECLAW_STATE_DIR = join(home, ".openclaw");

  if (process.platform !== "win32") {
    return;
  }
  const match = home.match(/^([A-Za-z]:)(.*)$/);
  if (!match) {
    return;
  }
  process.env.HOMEDRIVE = match[1];
  process.env.HOMEPATH = match[2] || "\\";
}

beforeAll(async () => {
  suiteTempHomeRoot = await fs.mkdtemp(join(os.tmpdir(), "openclaw-triggers-suite-"));
});

afterAll(async () => {
  if (!suiteTempHomeRoot) {
    return;
  }
  await fs.rm(suiteTempHomeRoot, { recursive: true, force: true }).catch(() => undefined);
  suiteTempHomeRoot = "";
  suiteTempHomeId = 0;
});

export async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = join(suiteTempHomeRoot, `case-${++suiteTempHomeId}`);
  const snapshot = snapshotTempHomeEnv();
  await fs.mkdir(join(home, ".openclaw", "agents", "main", "sessions"), { recursive: true });
  setTempHomeEnv(home);

  try {
    // Avoid cross-test leakage if a test doesn't touch these mocks.
    bridgeMocks.runAgent.mockClear();
    return await fn(home);
  } finally {
    restoreTempHomeEnv(snapshot);
  }
}

export function makeCfg(home: string): RemoteClawConfig {
  return {
    agents: {
      defaults: {
        model: { primary: "anthropic/claude-opus-4-5" },
        workspace: join(home, "openclaw"),
        // Test harness: avoid 1s coalescer idle sleeps that dominate trigger suites.
        blockStreamingCoalesce: { idleMs: 1 },
        // Trigger tests assert routing/authorization behavior, not delivery pacing.
        humanDelay: { mode: "off" },
      },
    },
    channels: {
      whatsapp: {
        allowFrom: ["*"],
      },
    },
    messages: {
      queue: {
        debounceMs: 0,
      },
    },
    session: { store: join(home, "sessions.json") },
  } as RemoteClawConfig;
}

export async function loadGetReplyFromConfig() {
  return (await import("./reply.js")).getReplyFromConfig;
}

export function installTriggerHandlingReplyHarness(
  setGetReplyFromConfig: (
    getReplyFromConfig: typeof import("./reply.js").getReplyFromConfig,
  ) => void,
): void {
  beforeAll(async () => {
    setGetReplyFromConfig(await loadGetReplyFromConfig());
  });
  installTriggerHandlingE2eTestHooks();
}

export function requireSessionStorePath(cfg: { session?: { store?: string } }): string {
  const storePath = cfg.session?.store;
  if (!storePath) {
    throw new Error("expected session store path");
  }
  return storePath;
}

export async function readSessionStore(cfg: {
  session?: { store?: string };
}): Promise<Record<string, { elevatedLevel?: string }>> {
  const storeRaw = await fs.readFile(requireSessionStorePath(cfg), "utf-8");
  return JSON.parse(storeRaw) as Record<string, { elevatedLevel?: string }>;
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
  const store = await readSessionStore(params.cfg);
  return { text, store };
}

export async function expectInlineCommandHandledAndStripped(params: {
  home: string;
  getReplyFromConfig: typeof import("./reply.js").getReplyFromConfig;
  body: string;
  stripToken: string;
  blockReplyContains: string;
  requestOverrides?: Record<string, unknown>;
}) {
  const runAgentMock = mockRunAgentOk();
  runAgentMock.mockClear();
  const { blockReplies, handlers } = createBlockReplyCollector();
  const res = await params.getReplyFromConfig(
    {
      Body: params.body,
      From: "+1002",
      To: "+2000",
      CommandAuthorized: true,
      ...params.requestOverrides,
    },
    handlers,
    makeCfg(params.home),
  );

  const text = Array.isArray(res) ? res[0]?.text : res?.text;
  expect(blockReplies.length).toBe(1);
  expect(blockReplies[0]?.text).toContain(params.blockReplyContains);
  expect(runAgentMock).toHaveBeenCalled();
  const prompt = runAgentMock.mock.calls.at(-1)?.[0]?.prompt ?? "";
  expect(prompt).not.toContain(params.stripToken);
  expect(text).toBe("ok");
}

export async function runGreetingPromptForBareNewOrReset(params: {
  home: string;
  body: "/new" | "/reset";
  getReplyFromConfig: typeof import("./reply.js").getReplyFromConfig;
}) {
  const runAgentMock = getRunAgentMock();
  runAgentMock.mockClear();
  runAgentMock.mockResolvedValue({
    payloads: [{ text: "hello" }],
    meta: {
      durationMs: 1,
      agentMeta: { sessionId: "s", provider: "p", model: "m" },
    },
  });

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
  expect(runAgentMock).toHaveBeenCalledOnce();
  const prompt = runAgentMock.mock.calls.at(-1)?.[0]?.prompt ?? "";
  expect(prompt).toContain("A new session was started via /new or /reset");
  expect(prompt).toContain("Execute your Session Startup sequence now");
}

export function installTriggerHandlingE2eTestHooks() {
  afterEach(() => {
    vi.restoreAllMocks();
  });
}

export function mockRunAgentOk(text = "ok"): AnyMock {
  const runAgentMock = getRunAgentMock();
  runAgentMock.mockResolvedValue({
    payloads: [{ text }],
    meta: {
      durationMs: 1,
      agentMeta: { sessionId: "s", provider: "p", model: "m" },
    },
  });
  return runAgentMock;
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
