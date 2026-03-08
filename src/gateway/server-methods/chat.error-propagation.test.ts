import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CURRENT_SESSION_VERSION } from "../../config/sessions/constants.js";
import type { GatewayRequestContext } from "./types.js";

type MockPayload = {
  text?: string;
  isError?: boolean;
};

const mockState = vi.hoisted(() => ({
  transcriptPath: "",
  sessionId: "sess-err-1",
  payloads: [] as MockPayload[],
  triggerAgentRunStart: true,
  agentRunId: "run-err-1",
}));

vi.mock("../session-utils.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../session-utils.js")>();
  return {
    ...original,
    loadSessionEntry: () => ({
      cfg: {},
      storePath: path.join(path.dirname(mockState.transcriptPath), "sessions.json"),
      entry: {
        sessionId: mockState.sessionId,
        sessionFile: mockState.transcriptPath,
      },
      canonicalKey: "main",
    }),
  };
});

vi.mock("../../auto-reply/dispatch.js", () => ({
  dispatchInboundMessage: vi.fn(
    async (params: {
      dispatcher: {
        sendFinalReply: (payload: MockPayload) => boolean;
        markComplete: () => void;
        waitForIdle: () => Promise<void>;
      };
      replyOptions?: {
        onAgentRunStart?: (runId: string) => void;
      };
    }) => {
      if (mockState.triggerAgentRunStart) {
        params.replyOptions?.onAgentRunStart?.(mockState.agentRunId);
      }
      for (const payload of mockState.payloads) {
        params.dispatcher.sendFinalReply(payload);
      }
      params.dispatcher.markComplete();
      await params.dispatcher.waitForIdle();
      return { ok: true };
    },
  ),
}));

const { chatHandlers } = await import("./chat.js");
const FAST_WAIT_OPTS = { timeout: 250, interval: 2 } as const;

function createTranscriptFixture(prefix: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const transcriptPath = path.join(dir, "sess.jsonl");
  fs.writeFileSync(
    transcriptPath,
    `${JSON.stringify({
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: mockState.sessionId,
      timestamp: new Date(0).toISOString(),
      cwd: "/tmp",
    })}\n`,
    "utf-8",
  );
  mockState.transcriptPath = transcriptPath;
}

function createChatContext(): Pick<
  GatewayRequestContext,
  | "broadcast"
  | "nodeSendToSession"
  | "agentRunSeq"
  | "chatAbortControllers"
  | "chatRunBuffers"
  | "chatDeltaSentAt"
  | "chatAbortedRuns"
  | "removeChatRun"
  | "dedupe"
  | "registerToolEventRecipient"
  | "logGateway"
> {
  return {
    broadcast: vi.fn() as unknown as GatewayRequestContext["broadcast"],
    nodeSendToSession: vi.fn() as unknown as GatewayRequestContext["nodeSendToSession"],
    agentRunSeq: new Map<string, number>(),
    chatAbortControllers: new Map(),
    chatRunBuffers: new Map(),
    chatDeltaSentAt: new Map(),
    chatAbortedRuns: new Map(),
    removeChatRun: vi.fn(),
    dedupe: new Map(),
    registerToolEventRecipient: vi.fn(),
    logGateway: {
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as GatewayRequestContext["logGateway"],
  };
}

type ChatContext = ReturnType<typeof createChatContext>;

async function runChatSendAndWaitForBroadcast(params: {
  context: ChatContext;
  idempotencyKey: string;
  message?: string;
}) {
  const respond = vi.fn();
  await chatHandlers["chat.send"]({
    params: {
      sessionKey: "main",
      message: params.message ?? "hello",
      idempotencyKey: params.idempotencyKey,
    },
    respond: respond as unknown as Parameters<(typeof chatHandlers)["chat.send"]>[0]["respond"],
    req: {} as never,
    client: null as never,
    isWebchatConnect: () => false,
    context: params.context as GatewayRequestContext,
  });

  await vi.waitFor(() => {
    expect(params.context.dedupe.has(`chat:${params.idempotencyKey}`)).toBe(true);
  }, FAST_WAIT_OPTS);

  const broadcastMock = params.context.broadcast as unknown as ReturnType<typeof vi.fn>;
  return broadcastMock.mock.calls
    .filter((call: unknown[]) => call[0] === "chat")
    .map((call: unknown[]) => call[1] as Record<string, unknown>);
}

describe("chat error propagation separates error and non-error reply parts", () => {
  afterEach(() => {
    mockState.payloads = [];
    mockState.triggerAgentRunStart = true;
    mockState.agentRunId = "run-err-1";
  });

  it("broadcasts error state when agent run produces only error payloads", async () => {
    createTranscriptFixture("remoteclaw-chat-err-only-");
    mockState.payloads = [{ text: "auth failure: invalid token", isError: true }];
    const context = createChatContext();

    const broadcasts = await runChatSendAndWaitForBroadcast({
      context,
      idempotencyKey: "idem-err-only",
    });

    expect(broadcasts.length).toBe(1);
    expect(broadcasts[0]).toMatchObject({
      state: "error",
      errorMessage: "auth failure: invalid token",
    });
  });

  it("does not broadcast error when agent run produces mixed error and non-error payloads", async () => {
    createTranscriptFixture("remoteclaw-chat-mixed-");
    mockState.payloads = [
      { text: "some warning", isError: true },
      { text: "assistant reply text", isError: false },
    ];
    const context = createChatContext();

    const broadcasts = await runChatSendAndWaitForBroadcast({
      context,
      idempotencyKey: "idem-mixed",
    });

    // Should NOT broadcast an error — there is non-error text present
    const errorBroadcasts = broadcasts.filter((b) => b.state === "error");
    expect(errorBroadcasts.length).toBe(0);
  });

  it("does not include non-error text in error broadcast for error-only runs", async () => {
    createTranscriptFixture("remoteclaw-chat-err-text-isolation-");
    mockState.payloads = [{ text: "CLI crashed: segfault", isError: true }];
    const context = createChatContext();

    const broadcasts = await runChatSendAndWaitForBroadcast({
      context,
      idempotencyKey: "idem-err-isolation",
    });

    expect(broadcasts.length).toBe(1);
    expect(broadcasts[0]?.errorMessage).toBe("CLI crashed: segfault");
    expect(broadcasts[0]?.state).toBe("error");
  });

  it("concatenates multiple error payloads in error broadcast", async () => {
    createTranscriptFixture("remoteclaw-chat-multi-err-");
    mockState.payloads = [
      { text: "error one", isError: true },
      { text: "error two", isError: true },
    ];
    const context = createChatContext();

    const broadcasts = await runChatSendAndWaitForBroadcast({
      context,
      idempotencyKey: "idem-multi-err",
    });

    expect(broadcasts.length).toBe(1);
    expect(broadcasts[0]?.state).toBe("error");
    expect(broadcasts[0]?.errorMessage).toBe("error one\n\nerror two");
  });

  it("sets hasErrorPayload even when error payload has empty text", async () => {
    createTranscriptFixture("remoteclaw-chat-err-empty-text-");
    // Error payload with empty text — hasErrorPayload should be set but
    // no error broadcast since there's no error text to surface.
    mockState.payloads = [{ text: "", isError: true }];
    const context = createChatContext();

    const broadcasts = await runChatSendAndWaitForBroadcast({
      context,
      idempotencyKey: "idem-err-empty",
    });

    // No error or final broadcast — error text is empty, non-error text is empty
    const errorBroadcasts = broadcasts.filter((b) => b.state === "error");
    expect(errorBroadcasts.length).toBe(0);
  });

  it("does not broadcast error when only non-error payloads with no agent run", async () => {
    createTranscriptFixture("remoteclaw-chat-no-agent-");
    mockState.triggerAgentRunStart = false;
    mockState.payloads = [{ text: "command output", isError: false }];
    const context = createChatContext();

    const broadcasts = await runChatSendAndWaitForBroadcast({
      context,
      idempotencyKey: "idem-no-agent",
    });

    // Non-agent path: should broadcast final, not error
    expect(broadcasts.length).toBe(1);
    expect(broadcasts[0]?.state).toBe("final");
  });
});
