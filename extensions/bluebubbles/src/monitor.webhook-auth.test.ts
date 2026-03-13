import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createBlueBubblesMonitorTestRuntime,
  EMPTY_DISPATCH_RESULT,
  resetBlueBubblesMonitorTestState,
  type DispatchReplyParams,
} from "../../../test/helpers/extensions/bluebubbles-monitor.js";
import type { ResolvedBlueBubblesAccount } from "./accounts.js";
import { fetchBlueBubblesHistory } from "./history.js";
import { handleBlueBubblesWebhookRequest, resolveBlueBubblesMessageId } from "./monitor.js";
import {
  handleBlueBubblesWebhookRequest,
  registerBlueBubblesWebhookTarget,
  resolveBlueBubblesMessageId,
  _resetBlueBubblesShortIdState,
} from "./monitor.js";
import {
  createMockAccount,
  createMockRequest,
  createMockResponse,
  dispatchWebhookPayloadForTest,
  registerWebhookTargetForTest,
  registerWebhookTargetsForTest,
} from "./monitor.webhook.test-helpers.js";
import type { RemoteClawConfig, PluginRuntime } from "./runtime-api.js";
import { setBlueBubblesRuntime } from "./runtime.js";

// Mock dependencies
vi.mock("./send.js", () => ({
  resolveChatGuidForTarget: vi.fn().mockResolvedValue("iMessage;-;+15551234567"),
  sendMessageBlueBubbles: vi.fn().mockResolvedValue({ messageId: "msg-123" }),
}));

vi.mock("./chat.js", () => ({
  markBlueBubblesChatRead: vi.fn().mockResolvedValue(undefined),
  sendBlueBubblesTyping: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./attachments.js", () => ({
  downloadBlueBubblesAttachment: vi.fn().mockResolvedValue({
    buffer: Buffer.from("test"),
    contentType: "image/jpeg",
  }),
}));

vi.mock("./reactions.js", async () => {
  const actual = await vi.importActual<typeof import("./reactions.js")>("./reactions.js");
  return {
    ...actual,
    sendBlueBubblesReaction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("./history.js", () => ({
  fetchBlueBubblesHistory: vi.fn().mockResolvedValue({ entries: [], resolved: true }),
}));

// Mock runtime
const mockEnqueueSystemEvent = vi.fn();
const mockBuildPairingReply = vi.fn(() => "Pairing code: TESTCODE");
const mockReadAllowFromStore = vi.fn().mockResolvedValue([]);
const mockUpsertPairingRequest = vi.fn().mockResolvedValue({ code: "TESTCODE", created: true });
const mockResolveAgentRoute = vi.fn(() => ({
  agentId: "main",
  channel: "bluebubbles",
  accountId: "default",
  sessionKey: "agent:main:bluebubbles:dm:+15551234567",
  mainSessionKey: "agent:main:main",
  lastRoutePolicy: "session" as const,
  matchedBy: "default" as const,
}));
const mockBuildMentionRegexes = vi.fn(() => [/\bbert\b/i]);
const mockMatchesMentionPatterns = vi.fn((text: string, regexes: RegExp[]) =>
  regexes.some((r) => r.test(text)),
);
const mockMatchesMentionWithExplicit = vi.fn(
  (params: { text: string; mentionRegexes: RegExp[]; explicitWasMentioned?: boolean }) => {
    if (params.explicitWasMentioned) {
      return true;
    }
    return params.mentionRegexes.some((regex) => regex.test(params.text));
  },
);
const mockResolveRequireMention = vi.fn(() => false);
const mockResolveGroupPolicy = vi.fn(() => "open" as const);
const mockDispatchReplyWithBufferedBlockDispatcher = vi.fn(
  async (_params: DispatchReplyParams) => EMPTY_DISPATCH_RESULT,
);
const mockHasControlCommand = vi.fn(() => false);
const mockResolveCommandAuthorizedFromAuthorizers = vi.fn(() => false);
const mockSaveMediaBuffer = vi.fn().mockResolvedValue({
  id: "test-media-id",
  path: "/tmp/test-media.jpg",
  size: 1024,
  contentType: "image/jpeg",
});
const mockResolveStorePath = vi.fn(() => "/tmp/sessions.json");
const mockReadSessionUpdatedAt = vi.fn(() => undefined);
const mockResolveEnvelopeFormatOptions = vi.fn(() => ({
  timezone: "local",
  includeTimestamp: true,
  includeElapsed: true,
}));
const mockFormatAgentEnvelope = vi.fn((opts: { body: string }) => opts.body);
const mockFormatInboundEnvelope = vi.fn((opts: { body: string }) => opts.body);
const mockChunkMarkdownText = vi.fn((text: string) => [text]);
const mockChunkByNewline = vi.fn((text: string) => (text ? [text] : []));
const mockChunkTextWithMode = vi.fn((text: string) => (text ? [text] : []));
const mockChunkMarkdownTextWithMode = vi.fn((text: string) => (text ? [text] : []));
const mockResolveChunkMode = vi.fn(() => "length" as const);
const mockFetchBlueBubblesHistory = vi.mocked(fetchBlueBubblesHistory);
const TEST_WEBHOOK_PASSWORD = "secret-token";

function createMockRuntime(): PluginRuntime {
  return createBlueBubblesMonitorTestRuntime({
    enqueueSystemEvent: mockEnqueueSystemEvent,
    chunkMarkdownText: mockChunkMarkdownText,
    chunkByNewline: mockChunkByNewline,
    chunkMarkdownTextWithMode: mockChunkMarkdownTextWithMode,
    chunkTextWithMode: mockChunkTextWithMode,
    resolveChunkMode: mockResolveChunkMode,
    hasControlCommand: mockHasControlCommand,
    dispatchReplyWithBufferedBlockDispatcher: mockDispatchReplyWithBufferedBlockDispatcher,
    formatAgentEnvelope: mockFormatAgentEnvelope,
    formatInboundEnvelope: mockFormatInboundEnvelope,
    resolveEnvelopeFormatOptions: mockResolveEnvelopeFormatOptions,
    resolveAgentRoute: mockResolveAgentRoute,
    buildPairingReply: mockBuildPairingReply,
    readAllowFromStore: mockReadAllowFromStore,
    upsertPairingRequest: mockUpsertPairingRequest,
    saveMediaBuffer: mockSaveMediaBuffer,
    resolveStorePath: mockResolveStorePath,
    readSessionUpdatedAt: mockReadSessionUpdatedAt,
    buildMentionRegexes: mockBuildMentionRegexes,
    matchesMentionPatterns: mockMatchesMentionPatterns,
    matchesMentionWithExplicit: mockMatchesMentionWithExplicit,
    resolveGroupPolicy: mockResolveGroupPolicy,
    resolveRequireMention: mockResolveRequireMention,
    resolveCommandAuthorizedFromAuthorizers: mockResolveCommandAuthorizedFromAuthorizers,
  });
}

function getFirstDispatchCall(): DispatchReplyParams {
  const callArgs = mockDispatchReplyWithBufferedBlockDispatcher.mock.calls[0]?.[0];
  if (!callArgs) {
    throw new Error("expected dispatch call arguments");
  }
  return callArgs;
}

describe("BlueBubbles webhook monitor", () => {
  let unregister: () => void;

  beforeEach(() => {
    resetBlueBubblesMonitorTestState({
      createRuntime: createMockRuntime,
      fetchHistoryMock: mockFetchBlueBubblesHistory,
      readAllowFromStoreMock: mockReadAllowFromStore,
      upsertPairingRequestMock: mockUpsertPairingRequest,
      resolveRequireMentionMock: mockResolveRequireMention,
      hasControlCommandMock: mockHasControlCommand,
      resolveCommandAuthorizedFromAuthorizersMock: mockResolveCommandAuthorizedFromAuthorizers,
      buildMentionRegexesMock: mockBuildMentionRegexes,
    });
  });

  afterEach(() => {
    unregister?.();
  });

  function setupWebhookTarget(params?: {
    account?: ResolvedBlueBubblesAccount;
    config?: RemoteClawConfig;
    core?: PluginRuntime;
    statusSink?: (event: unknown) => void;
  }) {
    const registration = trackWebhookRegistrationForTest(
      setupWebhookTargetForTest({
        createCore: createMockRuntime,
        core: params?.core,
        account: params?.account,
        config: params?.config,
        statusSink: params?.statusSink,
      }),
      (nextUnregister) => {
        unregister = nextUnregister;
      },
    };
  }

  function setupProtectedWebhookTarget(password = TEST_WEBHOOK_PASSWORD) {
    return setupWebhookTargetAccount(createProtectedWebhookTarget(password).account);
  }

  async function dispatchWebhook(req: IncomingMessage) {
    const res = createMockResponse();
    const handled = await handleBlueBubblesWebhookRequest(req, res);
    return { handled, res };
  }

  function createWebhookRequestForTest(params?: {
    method?: string;
    url?: string;
    body?: unknown;
    headers?: Record<string, string>;
    remoteAddress?: string;
  }) {
    const req = createMockRequest(
      params?.method ?? "POST",
      params?.url ?? "/bluebubbles-webhook",
      params?.body ?? {},
      params?.headers,
    );
    if (params?.remoteAddress) {
      setRequestRemoteAddress(req, params.remoteAddress);
    }
    return req;
  }

  function createHangingWebhookRequest(url = "/bluebubbles-webhook?password=test-password") {
    const req = new EventEmitter() as IncomingMessage & { destroy: ReturnType<typeof vi.fn> };
    req.method = "POST";
    req.url = url;
    req.headers = {};
    req.destroy = vi.fn();
    setRequestRemoteAddress(req, "127.0.0.1");
    return req;
  }

  function registerWebhookTargets(
    params: Array<{
      account: ResolvedBlueBubblesAccount;
      statusSink?: (event: unknown) => void;
    }>,
  ) {
    const config: RemoteClawConfig = {};
    const core = createMockRuntime();
    setBlueBubblesRuntime(core);

    const unregisterFns = params.map(({ account, statusSink }) =>
      registerBlueBubblesWebhookTarget({
        account,
        config,
        runtime: { log: vi.fn(), error: vi.fn() },
        core,
        path: "/bluebubbles-webhook",
        statusSink,
      }),
    );

    unregister = () => {
      for (const unregisterFn of unregisterFns) {
        unregisterFn();
      }
    };
  }

  async function expectWebhookStatus(
    req: IncomingMessage,
    expectedStatus: number,
    expectedBody?: string,
  ) {
    const { handled, res } = await dispatchWebhook(req);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(expectedStatus);
    if (expectedBody !== undefined) {
      expect(res.body).toBe(expectedBody);
    }
    return res;
  }

  describe("webhook parsing + auth handling", () => {
    it("rejects non-POST requests", async () => {
      setupWebhookTarget();
      const req = createWebhookRequestForTest({ method: "GET" });
      await expectWebhookStatus(req, 405);
    });

  function createPasswordlessWebhookTarget() {
    return createWebhookTarget(createMockAccount({ password: undefined }));
  }

  function createProtectedPasswordQueryRequestParams(password = TEST_WEBHOOK_PASSWORD) {
    return createPasswordQueryRequestParamsForTest({ password });
  }

  async function expectWebhookRequestStatusWithSetup(
    setup: () => void,
    params: WebhookRequestParams,
    expectedStatus: number,
    expectedBody?: string,
  ) {
    setup();
    return expectWebhookRequestStatusForTest(params, expectedStatus, expectedBody);
  }

  async function dispatchWebhookPayloadWithSetup(setup: () => void, payload: unknown) {
    setup();
    return dispatchWebhookPayloadForTest({ body: payload });
  }

  async function expectProtectedPasswordQueryRequestStatus(
    expectedStatus: number,
    password = TEST_WEBHOOK_PASSWORD,
  ) {
    return expectWebhookRequestStatusForTest(
      createProtectedPasswordQueryRequestParams(password),
      expectedStatus,
    );
  }

  async function expectProtectedWebhookRequestStatus(
    params: WebhookRequestParams,
    expectedStatus: number,
    expectedBody?: string,
  ) {
    return expectWebhookRequestStatusWithSetup(
      () => {
        setupProtectedWebhookTarget();
      },
      params,
      expectedStatus,
      expectedBody,
    );
  }

  async function expectRegisteredWebhookRequestStatus(
    params: WebhookRequestParams,
    expectedStatus: number,
    expectedBody?: string,
  ) {
    return expectWebhookRequestStatusWithSetup(
      () => {
        setupWebhookTarget();
      },
      params,
      expectedStatus,
      expectedBody,
    );
  }

  async function dispatchRegisteredWebhookPayload(payload: unknown) {
    return dispatchWebhookPayloadWithSetup(() => {
      setupWebhookTarget();
      const payload = createNewMessagePayload({ date: Date.now() });
      const req = createWebhookRequestForTest({ body: payload });
      await expectWebhookStatus(req, 200, "ok");
    });

    it("rejects requests with invalid JSON", async () => {
      setupWebhookTarget();
      const req = createWebhookRequestForTest({ body: "invalid json {{" });
      await expectWebhookStatus(req, 400);
    });

    it("accepts URL-encoded payload wrappers", async () => {
      setupWebhookTarget();
      const payload = createNewMessagePayloadForTest({ date: Date.now() });
      const encodedBody = new URLSearchParams({
        payload: JSON.stringify(payload),
      }).toString();
      const req = createWebhookRequestForTest({ body: encodedBody });
      await expectWebhookStatus(req, 200, "ok");
    });

    it("returns 408 when request body times out (Slow-Loris protection)", async () => {
      vi.useFakeTimers();
      try {
        setupWebhookTarget();

        // Create a request that never sends data or ends (simulates slow-loris)
        const req = createHangingWebhookRequest();

        const res = createMockResponse();

        const { res, handledPromise } = createWebhookDispatchForTest(req);

        // Advance past the 30s timeout
        await vi.advanceTimersByTimeAsync(31_000);

        const handled = await handledPromise;
        expect(handled).toBe(true);
        expect(res.statusCode).toBe(408);
        expect(destroyMock).toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("rejects unauthorized requests before reading the body", async () => {
      const account = createMockAccount({ password: "secret-token" });
      setupWebhookTarget({ account });
      const req = createHangingWebhookRequest("/bluebubbles-webhook?password=wrong-token");
      const onSpy = vi.spyOn(req, "on");
      await expectWebhookStatus(req, 401);
      expect(onSpy).not.toHaveBeenCalledWith("data", expect.any(Function));
    });

    it("authenticates via password query parameter", async () => {
      const account = createMockAccount({ password: "secret-token" });
      setupWebhookTarget({ account });
      const req = createWebhookRequestForTest({
        url: "/bluebubbles-webhook?password=secret-token",
        body: createNewMessagePayload(),
        remoteAddress: "192.168.1.100",
      });
      await expectWebhookStatus(req, 200);
    });

    it("authenticates via x-password header", async () => {
      const account = createMockAccount({ password: "secret-token" });
      setupWebhookTarget({ account });
      const req = createWebhookRequestForTest({
        body: createNewMessagePayload(),
        headers: { "x-password": "secret-token" }, // pragma: allowlist secret
        remoteAddress: "192.168.1.100",
      });
      await expectWebhookStatus(req, 200);
    });

    it("rejects unauthorized requests with wrong password", async () => {
      const account = createMockAccount({ password: "secret-token" });
      setupWebhookTarget({ account });
      const req = createWebhookRequestForTest({
        url: "/bluebubbles-webhook?password=wrong-token",
        body: createNewMessagePayload(),
        remoteAddress: "192.168.1.100",
      });
      await expectWebhookStatus(req, 401);
    });

    it("rejects ambiguous routing when multiple targets match the same password", async () => {
      const accountA = createMockAccount({ password: "secret-token" });
      const accountB = createMockAccount({ password: "secret-token" });
      const sinkA = vi.fn();
      const sinkB = vi.fn();
      registerWebhookTargets([
        { account: accountA, statusSink: sinkA },
        { account: accountB, statusSink: sinkB },
      ]);

      const req = createWebhookRequestForTest({
        url: "/bluebubbles-webhook?password=secret-token",
        body: createNewMessagePayload(),
        remoteAddress: "192.168.1.100",
      });
      await expectWebhookStatus(req, 401);
      expect(sinkA).not.toHaveBeenCalled();
      expect(sinkB).not.toHaveBeenCalled();
    });

    it("ignores targets without passwords when a password-authenticated target matches", async () => {
      const accountStrict = createMockAccount({ password: "secret-token" });
      const accountWithoutPassword = createMockAccount({ password: undefined });
      const sinkStrict = vi.fn();
      const sinkWithoutPassword = vi.fn();
      registerWebhookTargets([
        { account: accountStrict, statusSink: sinkStrict },
        { account: accountWithoutPassword, statusSink: sinkWithoutPassword },
      ]);

      const req = createWebhookRequestForTest({
        url: "/bluebubbles-webhook?password=secret-token",
        body: createNewMessagePayload(),
        remoteAddress: "192.168.1.100",
      });
      await expectWebhookStatus(req, 200);
      expect(sinkStrict).toHaveBeenCalledTimes(1);
      expect(sinkWithoutPassword).not.toHaveBeenCalled();
    });

    it("requires authentication for loopback requests when password is configured", async () => {
      const account = createMockAccount({ password: "secret-token" });
      setupWebhookTarget({ account });
      for (const remoteAddress of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
        const req = createWebhookRequestForTest({
          body: createNewMessagePayload(),
          remoteAddress,
        });
        await expectWebhookStatus(req, 401);
      }
    });

    it("rejects targets without passwords for loopback and proxied-looking requests", async () => {
      const account = createMockAccount({ password: undefined });
      setupWebhookTarget({ account });

      const headerVariants: Record<string, string>[] = [
        { host: "localhost" },
        { host: "localhost", "x-forwarded-for": "203.0.113.10" },
        { host: "localhost", forwarded: "for=203.0.113.10;proto=https;host=example.com" },
      ];
      for (const headers of headerVariants) {
        const req = createWebhookRequestForTest({
          body: createNewMessagePayload(),
          headers,
          remoteAddress: "127.0.0.1",
        });
        await expectWebhookStatus(req, 401);
      }
    });

    it("ignores unregistered webhook paths", async () => {
      const { handled } = await dispatchWebhookPayloadForTest({
        url: "/unregistered-path",
      });

      expect(handled).toBe(false);
    });

    it("parses chatId when provided as a string (webhook variant)", async () => {
      const { resolveChatGuidForTarget } = await import("./send.js");
      vi.mocked(resolveChatGuidForTarget).mockClear();

      const payload = createTimestampedNewMessagePayloadForTest({
        text: "hello from group",
        isGroup: true,
        chatId: "123",
      });

      await dispatchRegisteredWebhookPayload(payload);

      expect(resolveChatGuidForTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          target: { kind: "chat_id", chatId: 123 },
        }),
      );
    });

    it("extracts chatGuid from nested chat object fields (webhook variant)", async () => {
      const { sendMessageBlueBubbles, resolveChatGuidForTarget } = await import("./send.js");
      vi.mocked(sendMessageBlueBubbles).mockClear();
      vi.mocked(resolveChatGuidForTarget).mockClear();

      mockDispatchReplyWithBufferedBlockDispatcher.mockImplementationOnce(async (params) => {
        await params.dispatcherOptions.deliver({ text: "replying now" }, { kind: "final" });
        return EMPTY_DISPATCH_RESULT;
      });

      const payload = createTimestampedNewMessagePayloadForTest({
        text: "hello from group",
        isGroup: true,
        chat: { chatGuid: "iMessage;+;chat123456" },
      });

      await dispatchRegisteredWebhookPayload(payload);

      expect(resolveChatGuidForTarget).not.toHaveBeenCalled();
      expect(sendMessageBlueBubbles).toHaveBeenCalledWith(
        "chat_guid:iMessage;+;chat123456",
        expect.any(String),
        expect.any(Object),
      );
    });
  });
});
