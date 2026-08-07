import { describe, expect, it, vi } from "vitest";
import { chatHandlers } from "./chat.js";
import type { GatewayRequestContext } from "./types.js";

// Fork's resolveMainSessionKey hard-fails on an empty agents.list (it does not
// fall back to a default agent id like upstream). Seed a minimal agent so the
// "main" sessionKey alias resolves and the test reaches the addChatRun error path.
vi.mock("../../config/config.js", async () => {
  const actual =
    await vi.importActual<typeof import("../../config/config.js")>("../../config/config.js");
  return {
    ...actual,
    loadConfig: () => {
      const base = actual.loadConfig();
      return { ...base, agents: { ...base.agents, list: [{ id: "main" }] } };
    },
  };
});

function createMockContext() {
  const broadcast = vi.fn();
  const nodeSendToSession = vi.fn();
  const chatAbortControllers = new Map();
  const agentRunSeq = new Map<string, number>();
  const dedupe = new Map();

  return {
    broadcast,
    nodeSendToSession,
    chatAbortControllers,
    agentRunSeq,
    dedupe,
    logGateway: { warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
    addChatRun: vi.fn(),
    removeChatRun: vi.fn(),
  };
}

// Upstream added an `expectedSessionRoutingContract` guard to `chat.send` in
// v2026.7.1-2 (schema field in `packages/gateway-protocol`, enforcement in
// `server-methods/chat.ts` via `resolveSessionRoutingContract`). This fork does
// NOT carry that guard: `chat.ts` is content-protected, so upstream's version was
// not applied, and `resolveSessionRoutingContract` exists nowhere in the fork.
// The three upstream tests covering it are therefore dropped here rather than
// asserted against absent behaviour — adopting the guard means editing a
// content-protected gateway security file, which is a divergence decision for
// review, not a sync-stabilization move. Tracked in the batch reclassification
// ledger; called out in the PR body under "Security-relevant surface".
describe("chat.send error broadcast", () => {
  it.skip("[fork] rejects a stale expected session routing contract before dispatch", async () => {
    const ctx = createMockContext();
    const respond = vi.fn();

    await chatHandlers["chat.send"]({
      params: {
        sessionKey: "main",
        message: "hello",
        expectedSessionRoutingContract: "global|main|main",
        idempotencyKey: "test-stale-routing",
      },
      respond: respond as never,
      context: ctx as unknown as GatewayRequestContext,
      req: {} as never,
      client: null as never,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({
        code: "INVALID_REQUEST",
        details: { reason: "session-routing-changed" },
      }),
    );
    expect(ctx.addChatRun).not.toHaveBeenCalled();
    expect(ctx.broadcast).not.toHaveBeenCalled();
  });

  it.skip("[fork] returns an idempotent cached send after session routing changes", async () => {
    const ctx = createMockContext();
    const respond = vi.fn();
    ctx.dedupe.set("chat:test-cached-routing", {
      ts: Date.now(),
      ok: true,
      payload: { runId: "test-cached-routing", status: "started" },
    });

    await chatHandlers["chat.send"]({
      params: {
        sessionKey: "main",
        message: "hello",
        expectedSessionRoutingContract: "global|main|main",
        idempotencyKey: "test-cached-routing",
      },
      respond: respond as never,
      context: ctx as unknown as GatewayRequestContext,
      req: {} as never,
      client: null as never,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      true,
      { runId: "test-cached-routing", status: "started" },
      undefined,
      { cached: true },
    );
  });

  it.skip("[fork] rejects a stale routing contract before a stop side effect", async () => {
    const ctx = createMockContext();
    const respond = vi.fn();

    await chatHandlers["chat.send"]({
      params: {
        sessionKey: "main",
        message: "/stop",
        expectedSessionRoutingContract: "global|main|main",
        idempotencyKey: "test-stale-stop-routing",
      },
      respond: respond as never,
      context: ctx as unknown as GatewayRequestContext,
      req: {} as never,
      client: null as never,
      isWebchatConnect: () => false,
    });

    expect(respond).toHaveBeenCalledWith(
      false,
      undefined,
      expect.objectContaining({ details: { reason: "session-routing-changed" } }),
    );
    expect(ctx.addChatRun).not.toHaveBeenCalled();
  });

  it("should broadcast error when addChatRun throws", async () => {
    const ctx = createMockContext();
    const respond = vi.fn();

    // Make addChatRun throw synchronously (inside the try block at line 2470)
    ctx.addChatRun.mockImplementation(() => {
      throw Object.assign(new Error("LLM timeout"), { code: "TIMEOUT" });
    });

    await chatHandlers["chat.send"]({
      params: {
        sessionKey: "main",
        message: "hello",
        idempotencyKey: "test-run-1",
      },
      respond: respond as never,
      context: ctx as unknown as GatewayRequestContext,
      req: {} as never,
      client: null as never,
      isWebchatConnect: () => false,
    });

    // Verify respond was called with error
    expect(respond).toHaveBeenCalledWith(
      false,
      expect.objectContaining({ runId: "test-run-1", status: "error" }),
      expect.any(Object),
      expect.any(Object),
    );

    // Verify broadcastChatError was called (via context.broadcast)
    expect(ctx.broadcast).toHaveBeenCalledWith(
      "chat",
      expect.objectContaining({
        runId: "test-run-1",
        state: "error",
        errorMessage: expect.stringContaining("LLM timeout"),
      }),
    );
  });
});
