import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import type { AgentDeliveryResult, BridgeCallbacks, ChannelMessage } from "../middleware/types.js";
import { createTempHomeHarness, makeReplyConfig } from "./reply.test-harness.js";

const agentMocks = vi.hoisted(() => ({
  runAgent: vi.fn(),
  loadModelCatalog: vi.fn(),
  webAuthExists: vi.fn().mockResolvedValue(true),
  getWebAuthAgeMs: vi.fn().mockReturnValue(120_000),
  readWebSelfId: vi.fn().mockReturnValue({ e164: "+1999" }),
}));

vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: agentMocks.loadModelCatalog,
}));

vi.mock("../web/session.js", () => ({
  webAuthExists: agentMocks.webAuthExists,
  getWebAuthAgeMs: agentMocks.getWebAuthAgeMs,
  readWebSelfId: agentMocks.readWebSelfId,
}));

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
        provider: this.#provider,
        onBlockReply: callbacks?.onBlockReply,
        onPartialReply: callbacks?.onPartialReply,
        onToolResult: callbacks?.onToolResult,
      };
      const result = await agentMocks.runAgent(embeddedParams);
      return {
        payloads: result?.payloads ?? [],
        run: {
          text: "",
          sessionId: result?.meta?.agentMeta?.sessionId,
          durationMs: result?.meta?.durationMs ?? 0,
          usage: undefined,
          aborted: false,
        },
        mcp: { sentTexts: [], sentMediaUrls: [], sentTargets: [], cronAdds: 0 },
      };
    }
  },
}));

vi.mock("../config/paths.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/paths.js")>();
  return { ...actual, resolveGatewayPort: () => 9999 };
});

vi.mock("../gateway/credentials.js", () => ({
  resolveGatewayCredentialsFromConfig: () => ({ token: "test-token" }),
}));

import { getReplyFromConfig } from "./reply.js";

const { withTempHome } = createTempHomeHarness({ prefix: "openclaw-rawbody-" });

describe("RawBody directive parsing", () => {
  beforeEach(() => {
    vi.stubEnv("REMOTECLAW_TEST_FAST", "1");
    agentMocks.runAgent.mockClear();
    agentMocks.loadModelCatalog.mockClear();
    agentMocks.loadModelCatalog.mockResolvedValue([
      { id: "claude-opus-4-5", name: "Opus 4.5", provider: "anthropic" },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("handles directives and history in the prompt", async () => {
    await withTempHome(async (home) => {
      agentMocks.runAgent.mockResolvedValue({
        payloads: [{ text: "ok" }],
        meta: {
          durationMs: 1,
          agentMeta: { sessionId: "s", provider: "p", model: "m" },
        },
      });

      const groupMessageCtx = {
        Body: "/think:high status please",
        BodyForAgent: "/think:high status please",
        RawBody: "/think:high status please",
        InboundHistory: [{ sender: "Peter", body: "hello", timestamp: 1700000000000 }],
        From: "+1222",
        To: "+1222",
        ChatType: "group",
        GroupSubject: "Ops",
        SenderName: "Jake McInteer",
        SenderE164: "+6421807830",
        CommandAuthorized: true,
      };

      const res = await getReplyFromConfig(
        groupMessageCtx,
        {},
        makeReplyConfig(home) as OpenClawConfig,
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("ok");
      expect(agentMocks.runAgent).toHaveBeenCalledOnce();
      const prompt =
        (agentMocks.runAgent.mock.calls[0]?.[0] as { prompt?: string } | undefined)?.prompt ?? "";
      expect(prompt).toContain("Chat history since last reply (untrusted, for context):");
      expect(prompt).toContain('"sender": "Peter"');
      expect(prompt).toContain('"body": "hello"');
      expect(prompt).toContain("status please");
      expect(prompt).not.toContain("/think:high");
    });
  });
});
