import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";
import { loadModelCatalog } from "../agents/model-catalog.js";
import { getReplyFromConfig } from "./reply.js";

const piEmbeddedMock = vi.hoisted(() => ({
  abortEmbeddedPiRun: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: vi.fn(),
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  resolveEmbeddedSessionLane: (key: string) => `session:${key.trim() || "main"}`,
  isEmbeddedPiRunActive: vi.fn().mockReturnValue(false),
  isEmbeddedPiRunStreaming: vi.fn().mockReturnValue(false),
}));

vi.mock("../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/index.js")>();
  return { ...actual, ChannelBridge: vi.fn(), ClaudeCliRuntime: vi.fn() };
});
vi.mock("../agents/pi-embedded.js", () => piEmbeddedMock);
vi.mock("../agents/model-catalog.js", () => ({
  loadModelCatalog: vi.fn(),
}));

import { ChannelBridge } from "../middleware/index.js";

const mockHandle = vi.fn();

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(
    async (home) => {
      return await fn(home);
    },
    {
      env: {
        REMOTECLAW_AGENT_DIR: (home) => path.join(home, ".remoteclaw", "agent"),
        PI_CODING_AGENT_DIR: (home) => path.join(home, ".remoteclaw", "agent"),
      },
      prefix: "remoteclaw-rawbody-",
    },
  );
}

describe("RawBody directive parsing", () => {
  beforeEach(() => {
    vi.mocked(ChannelBridge).mockImplementation(function () {
      return { handle: mockHandle };
    } as never);
    mockHandle.mockReset();
    vi.mocked(loadModelCatalog).mockResolvedValue([
      { id: "claude-opus-4-5", name: "Opus 4.5", provider: "anthropic" },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("/model, /think, /verbose directives detected from RawBody even when Body has structural wrapper", async () => {
    await withTempHome(async (home) => {
      const groupMessageCtx = {
        Body: `[Chat messages since your last reply - for context]\\n[WhatsApp ...] Someone: hello\\n\\n[Current message - respond to this]\\n[WhatsApp ...] Jake: /think:high\\n[from: Jake McInteer (+6421807830)]`,
        RawBody: "/think:high",
        From: "+1222",
        To: "+1222",
        ChatType: "group",
        CommandAuthorized: true,
      };

      const res = await getReplyFromConfig(
        groupMessageCtx,
        {},
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "remoteclaw"),
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Thinking level set to high.");
      expect(mockHandle).not.toHaveBeenCalled();
    });
  });

  it("/model status detected from RawBody", async () => {
    await withTempHome(async (home) => {
      const groupMessageCtx = {
        Body: `[Context]\nJake: /model status\n[from: Jake]`,
        RawBody: "/model status",
        From: "+1222",
        To: "+1222",
        ChatType: "group",
        CommandAuthorized: true,
      };

      const res = await getReplyFromConfig(
        groupMessageCtx,
        {},
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "remoteclaw"),
              models: {
                "anthropic/claude-opus-4-5": {},
              },
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("anthropic/claude-opus-4-5");
      expect(mockHandle).not.toHaveBeenCalled();
    });
  });

  it("CommandBody is honored when RawBody is missing", async () => {
    await withTempHome(async (home) => {
      const groupMessageCtx = {
        Body: `[Context]\nJake: /verbose on\n[from: Jake]`,
        CommandBody: "/verbose on",
        From: "+1222",
        To: "+1222",
        ChatType: "group",
        CommandAuthorized: true,
      };

      const res = await getReplyFromConfig(
        groupMessageCtx,
        {},
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "remoteclaw"),
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Verbose logging enabled.");
      expect(mockHandle).not.toHaveBeenCalled();
    });
  });

  it("Integration: WhatsApp group message with structural wrapper and RawBody command", async () => {
    await withTempHome(async (home) => {
      const groupMessageCtx = {
        Body: `[Chat messages since your last reply - for context]\\n[WhatsApp ...] Someone: hello\\n\\n[Current message - respond to this]\\n[WhatsApp ...] Jake: /status\\n[from: Jake McInteer (+6421807830)]`,
        RawBody: "/status",
        ChatType: "group",
        From: "+1222",
        To: "+1222",
        SessionKey: "agent:main:whatsapp:group:g1",
        Provider: "whatsapp",
        Surface: "whatsapp",
        SenderE164: "+1222",
        CommandAuthorized: true,
      };

      const res = await getReplyFromConfig(
        groupMessageCtx,
        {},
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "remoteclaw"),
            },
          },
          channels: { whatsapp: { allowFrom: ["+1222"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toContain("Session: agent:main:whatsapp:group:g1");
      expect(text).toContain("anthropic/claude-opus-4-5");
      expect(mockHandle).not.toHaveBeenCalled();
    });
  });

  it("preserves history when RawBody is provided for command parsing", async () => {
    await withTempHome(async (home) => {
      mockHandle.mockResolvedValue({
        text: "ok",
        sessionId: "s",
        durationMs: 1,
        usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
        aborted: false,
        error: undefined,
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
        {
          agents: {
            defaults: {
              model: { primary: "anthropic/claude-opus-4-5" },
              workspace: path.join(home, "remoteclaw"),
            },
          },
          channels: { whatsapp: { allowFrom: ["*"] } },
          session: { store: path.join(home, "sessions.json") },
        },
      );

      const text = Array.isArray(res) ? res[0]?.text : res?.text;
      expect(text).toBe("ok");
      expect(mockHandle).toHaveBeenCalledOnce();
      const channelMessage = mockHandle.mock.calls[0]?.[0] as { text?: string };
      const prompt = channelMessage?.text ?? "";
      expect(prompt).toContain("Chat history since last reply (untrusted, for context):");
      expect(prompt).toContain('"sender": "Peter"');
      expect(prompt).toContain('"body": "hello"');
      expect(prompt).toContain("status please");
      expect(prompt).not.toContain("/think:high");
    });
  });
});
