import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { WebSocket } from "ws";
import { GATEWAY_CLIENT_IDS, GATEWAY_CLIENT_MODES } from "./protocol/client-info.js";
import { startGatewayServerHarness, type GatewayServerHarness } from "./server.e2e-ws-harness.js";
import { createToolSummaryPreviewTranscriptLines } from "./session-preview.test-helpers.js";
import {
  connectOk,
  installGatewayTestHooks,
  rpcReq,
  testState,
  trackConnectChallengeNonce,
  writeSessionStore,
} from "./test-helpers.js";

const sessionCleanupMocks = vi.hoisted(() => ({
  clearSessionQueues: vi.fn(() => ({ followupCleared: 0, laneCleared: 0, keys: [] })),
  stopSubagentsForRequester: vi.fn(() => ({ stopped: 0 })),
}));

const sessionHookMocks = vi.hoisted(() => ({
  triggerInternalHook: vi.fn(async () => {}),
}));

const subagentLifecycleHookMocks = vi.hoisted(() => ({
  runSubagentEnded: vi.fn(async () => {}),
}));

const subagentLifecycleHookState = vi.hoisted(() => ({
  hasSubagentEndedHook: true,
}));

const threadBindingMocks = vi.hoisted(() => ({
  unbindThreadBindingsBySessionKey: vi.fn((_params?: unknown) => []),
}));
const acpRuntimeMocks = vi.hoisted(() => ({
  cancel: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  getAcpRuntimeBackend: vi.fn(),
  requireAcpRuntimeBackend: vi.fn(),
}));

vi.mock("../auto-reply/reply/queue.js", async () => {
  const actual = await vi.importActual<typeof import("../auto-reply/reply/queue.js")>(
    "../auto-reply/reply/queue.js",
  );
  return {
    ...actual,
    clearSessionQueues: sessionCleanupMocks.clearSessionQueues,
  };
});

vi.mock("../auto-reply/reply/abort.js", async () => {
  const actual = await vi.importActual<typeof import("../auto-reply/reply/abort.js")>(
    "../auto-reply/reply/abort.js",
  );
  return {
    ...actual,
    stopSubagentsForRequester: sessionCleanupMocks.stopSubagentsForRequester,
  };
});

vi.mock("../hooks/internal-hooks.js", async () => {
  const actual = await vi.importActual<typeof import("../hooks/internal-hooks.js")>(
    "../hooks/internal-hooks.js",
  );
  return {
    ...actual,
    triggerInternalHook: sessionHookMocks.triggerInternalHook,
  };
});

vi.mock("../plugins/hook-runner-global.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../plugins/hook-runner-global.js")>();
  return {
    ...actual,
    getGlobalHookRunner: vi.fn(() => ({
      hasHooks: (hookName: string) =>
        hookName === "subagent_ended" && subagentLifecycleHookState.hasSubagentEndedHook,
      runSubagentEnded: subagentLifecycleHookMocks.runSubagentEnded,
    })),
  };
});

vi.mock("../discord/monitor/thread-bindings.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../discord/monitor/thread-bindings.js")>();
  return {
    ...actual,
    unbindThreadBindingsBySessionKey: (params: unknown) =>
      threadBindingMocks.unbindThreadBindingsBySessionKey(params),
  };
});

vi.mock("../acp/runtime/registry.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../acp/runtime/registry.js")>();
  return {
    ...actual,
    getAcpRuntimeBackend: acpRuntimeMocks.getAcpRuntimeBackend,
    requireAcpRuntimeBackend: (backendId?: string) => {
      const backend = acpRuntimeMocks.requireAcpRuntimeBackend(backendId);
      if (!backend) {
        throw new Error("missing mocked ACP backend");
      }
      return backend;
    },
  };
});

installGatewayTestHooks({ scope: "suite" });

let harness: GatewayServerHarness;
let sharedSessionStoreDir: string;
let sessionStoreCaseSeq = 0;

beforeAll(async () => {
  harness = await startGatewayServerHarness();
  sharedSessionStoreDir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-sessions-"));
});

afterAll(async () => {
  await harness.close();
  await fs.rm(sharedSessionStoreDir, { recursive: true, force: true });
});

const openClient = async (opts?: Parameters<typeof connectOk>[1]) => await harness.openClient(opts);

async function createSessionStoreDir() {
  const dir = path.join(sharedSessionStoreDir, `case-${sessionStoreCaseSeq++}`);
  await fs.mkdir(dir, { recursive: true });
  const storePath = path.join(dir, "sessions.json");
  testState.sessionStorePath = storePath;
  return { dir, storePath };
}

async function writeSingleLineSession(dir: string, sessionId: string, content: string) {
  await fs.writeFile(
    path.join(dir, `${sessionId}.jsonl`),
    `${JSON.stringify({ role: "user", content })}\n`,
    "utf-8",
  );
}

async function getMainPreviewEntry(ws: import("ws").WebSocket) {
  const preview = await rpcReq<{
    previews: Array<{
      key: string;
      status: string;
      items: Array<{ role: string; text: string }>;
    }>;
  }>(ws, "sessions.preview", { keys: ["main"], limit: 3, maxChars: 120 });
  expect(preview.ok).toBe(true);
  const entry = preview.payload?.previews[0];
  expect(entry?.key).toBe("main");
  expect(entry?.status).toBe("ok");
  return entry;
}

describe("gateway server sessions", () => {
  beforeEach(() => {
    sessionCleanupMocks.clearSessionQueues.mockClear();
    sessionCleanupMocks.stopSubagentsForRequester.mockClear();
    sessionHookMocks.triggerInternalHook.mockClear();
    subagentLifecycleHookMocks.runSubagentEnded.mockClear();
    subagentLifecycleHookState.hasSubagentEndedHook = true;
    threadBindingMocks.unbindThreadBindingsBySessionKey.mockClear();
    acpRuntimeMocks.cancel.mockClear();
    acpRuntimeMocks.close.mockClear();
    acpRuntimeMocks.getAcpRuntimeBackend.mockReset();
    acpRuntimeMocks.getAcpRuntimeBackend.mockReturnValue(null);
    acpRuntimeMocks.requireAcpRuntimeBackend.mockReset();
    acpRuntimeMocks.requireAcpRuntimeBackend.mockImplementation((backendId?: string) =>
      acpRuntimeMocks.getAcpRuntimeBackend(backendId),
    );
  });

  test("sessions.preview returns transcript previews", async () => {
    const { dir } = await createSessionStoreDir();
    const sessionId = "sess-preview";
    const transcriptPath = path.join(dir, `${sessionId}.jsonl`);
    const lines = createToolSummaryPreviewTranscriptLines(sessionId);
    await fs.writeFile(transcriptPath, lines.join("\n"), "utf-8");

    await writeSessionStore({
      entries: {
        main: {
          sessionId,
          updatedAt: Date.now(),
        },
      },
    });

    const { ws } = await openClient();
    const entry = await getMainPreviewEntry(ws);
    expect(entry?.items.map((item) => item.role)).toEqual(["assistant", "tool", "assistant"]);
    expect(entry?.items[1]?.text).toContain("call weather");

    ws.close();
  });

  test("sessions.preview resolves legacy mixed-case main alias with custom mainKey", async () => {
    const { dir, storePath } = await createSessionStoreDir();
    testState.agentsConfig = { list: [{ id: "ops", default: true }] };
    testState.sessionConfig = { mainKey: "work" };
    const sessionId = "sess-legacy-main";
    const transcriptPath = path.join(dir, `${sessionId}.jsonl`);
    const lines = [
      JSON.stringify({ type: "session", version: 1, id: sessionId }),
      JSON.stringify({ message: { role: "assistant", content: "Legacy alias transcript" } }),
    ];
    await fs.writeFile(transcriptPath, lines.join("\n"), "utf-8");
    await fs.writeFile(
      storePath,
      JSON.stringify(
        {
          "agent:ops:MAIN": {
            sessionId,
            updatedAt: Date.now(),
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const { ws } = await openClient();
    const entry = await getMainPreviewEntry(ws);
    expect(entry?.items[0]?.text).toContain("Legacy alias transcript");

    ws.close();
  });

  test("sessions.delete does not emit lifecycle events when nothing was deleted", async () => {
    const { dir } = await createSessionStoreDir();
    await writeSingleLineSession(dir, "sess-main", "hello");
    await writeSessionStore({
      entries: {
        main: { sessionId: "sess-main", updatedAt: Date.now() },
      },
    });

    const { ws } = await openClient();
    const deleted = await rpcReq<{ ok: true; deleted: boolean }>(ws, "sessions.delete", {
      key: "agent:main:subagent:missing",
    });

    expect(deleted.ok).toBe(true);
    expect(deleted.payload?.deleted).toBe(false);
    expect(subagentLifecycleHookMocks.runSubagentEnded).not.toHaveBeenCalled();
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).not.toHaveBeenCalled();

    ws.close();
  });

  test("sessions.delete emits subagent targetKind for subagent sessions", async () => {
    const { dir } = await createSessionStoreDir();
    await writeSingleLineSession(dir, "sess-subagent", "hello");
    await writeSessionStore({
      entries: {
        "agent:main:subagent:worker": {
          sessionId: "sess-subagent",
          updatedAt: Date.now(),
        },
      },
    });

    const { ws } = await openClient();
    const deleted = await rpcReq<{ ok: true; deleted: boolean }>(ws, "sessions.delete", {
      key: "agent:main:subagent:worker",
    });
    expect(deleted.ok).toBe(true);
    expect(deleted.payload?.deleted).toBe(true);
    expect(subagentLifecycleHookMocks.runSubagentEnded).toHaveBeenCalledTimes(1);
    const event = (subagentLifecycleHookMocks.runSubagentEnded.mock.calls as unknown[][])[0]?.[0] as
      | { targetKind?: string; targetSessionKey?: string; reason?: string; outcome?: string }
      | undefined;
    expect(event).toMatchObject({
      targetSessionKey: "agent:main:subagent:worker",
      targetKind: "subagent",
      reason: "session-delete",
      outcome: "deleted",
    });
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledTimes(1);
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledWith({
      targetSessionKey: "agent:main:subagent:worker",
      targetKind: "subagent",
      reason: "session-delete",
      sendFarewell: true,
    });

    ws.close();
  });

  test("sessions.delete can skip lifecycle hooks while still unbinding thread bindings", async () => {
    const { dir } = await createSessionStoreDir();
    await writeSingleLineSession(dir, "sess-subagent", "hello");
    await writeSessionStore({
      entries: {
        "agent:main:subagent:worker": {
          sessionId: "sess-subagent",
          updatedAt: Date.now(),
        },
      },
    });

    const { ws } = await openClient();
    const deleted = await rpcReq<{ ok: true; deleted: boolean }>(ws, "sessions.delete", {
      key: "agent:main:subagent:worker",
      emitLifecycleHooks: false,
    });
    expect(deleted.ok).toBe(true);
    expect(deleted.payload?.deleted).toBe(true);
    expect(subagentLifecycleHookMocks.runSubagentEnded).not.toHaveBeenCalled();
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledTimes(1);
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledWith({
      targetSessionKey: "agent:main:subagent:worker",
      targetKind: "subagent",
      reason: "session-delete",
      sendFarewell: true,
    });

    ws.close();
  });

  test("sessions.delete directly unbinds thread bindings when hooks are unavailable", async () => {
    const { dir } = await createSessionStoreDir();
    await writeSingleLineSession(dir, "sess-subagent", "hello");
    await writeSessionStore({
      entries: {
        "agent:main:subagent:worker": {
          sessionId: "sess-subagent",
          updatedAt: Date.now(),
        },
      },
    });
    subagentLifecycleHookState.hasSubagentEndedHook = false;

    const { ws } = await openClient();
    const deleted = await rpcReq<{ ok: true; deleted: boolean }>(ws, "sessions.delete", {
      key: "agent:main:subagent:worker",
    });
    expect(deleted.ok).toBe(true);
    expect(subagentLifecycleHookMocks.runSubagentEnded).not.toHaveBeenCalled();
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledTimes(1);
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledWith({
      targetSessionKey: "agent:main:subagent:worker",
      targetKind: "subagent",
      reason: "session-delete",
      sendFarewell: true,
    });

    ws.close();
  });

  test("sessions.reset does not emit lifecycle events when key does not exist", async () => {
    const { dir } = await createSessionStoreDir();
    await writeSingleLineSession(dir, "sess-main", "hello");
    await writeSessionStore({
      entries: {
        main: { sessionId: "sess-main", updatedAt: Date.now() },
      },
    });

    const { ws } = await openClient();
    const reset = await rpcReq<{ ok: true; key: string; entry: { sessionId: string } }>(
      ws,
      "sessions.reset",
      {
        key: "agent:main:subagent:missing",
      },
    );

    expect(reset.ok).toBe(true);
    expect(subagentLifecycleHookMocks.runSubagentEnded).not.toHaveBeenCalled();
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).not.toHaveBeenCalled();

    ws.close();
  });

  test("sessions.reset emits subagent targetKind for subagent sessions", async () => {
    const { dir } = await createSessionStoreDir();
    await writeSingleLineSession(dir, "sess-subagent", "hello");
    await writeSessionStore({
      entries: {
        "agent:main:subagent:worker": {
          sessionId: "sess-subagent",
          updatedAt: Date.now(),
        },
      },
    });

    const { ws } = await openClient();
    const reset = await rpcReq<{ ok: true; key: string; entry: { sessionId: string } }>(
      ws,
      "sessions.reset",
      {
        key: "agent:main:subagent:worker",
      },
    );
    expect(reset.ok).toBe(true);
    expect(reset.payload?.key).toBe("agent:main:subagent:worker");
    expect(reset.payload?.entry.sessionId).not.toBe("sess-subagent");
    expect(subagentLifecycleHookMocks.runSubagentEnded).toHaveBeenCalledTimes(1);
    const event = (subagentLifecycleHookMocks.runSubagentEnded.mock.calls as unknown[][])[0]?.[0] as
      | { targetKind?: string; targetSessionKey?: string; reason?: string; outcome?: string }
      | undefined;
    expect(event).toMatchObject({
      targetSessionKey: "agent:main:subagent:worker",
      targetKind: "subagent",
      reason: "session-reset",
      outcome: "reset",
    });
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledTimes(1);
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledWith({
      targetSessionKey: "agent:main:subagent:worker",
      targetKind: "subagent",
      reason: "session-reset",
      sendFarewell: true,
    });

    ws.close();
  });

  test("sessions.reset directly unbinds thread bindings when hooks are unavailable", async () => {
    const { dir } = await createSessionStoreDir();
    await writeSingleLineSession(dir, "sess-main", "hello");
    await writeSessionStore({
      entries: {
        main: {
          sessionId: "sess-main",
          updatedAt: Date.now(),
        },
      },
    });
    subagentLifecycleHookState.hasSubagentEndedHook = false;

    const { ws } = await openClient();
    const reset = await rpcReq<{ ok: true; key: string }>(ws, "sessions.reset", {
      key: "main",
    });
    expect(reset.ok).toBe(true);
    expect(subagentLifecycleHookMocks.runSubagentEnded).not.toHaveBeenCalled();
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledTimes(1);
    expect(threadBindingMocks.unbindThreadBindingsBySessionKey).toHaveBeenCalledWith({
      targetSessionKey: "agent:main:main",
      targetKind: "acp",
      reason: "session-reset",
      sendFarewell: true,
    });

    ws.close();
  });

  test("sessions.reset emits internal command hook with reason", async () => {
    const { dir } = await createSessionStoreDir();
    await writeSingleLineSession(dir, "sess-main", "hello");

    await writeSessionStore({
      entries: {
        main: { sessionId: "sess-main", updatedAt: Date.now() },
      },
    });

    const { ws } = await openClient();
    const reset = await rpcReq<{ ok: true; key: string }>(ws, "sessions.reset", {
      key: "main",
      reason: "new",
    });
    expect(reset.ok).toBe(true);
    expect(sessionHookMocks.triggerInternalHook).toHaveBeenCalledTimes(1);
    const event = (
      sessionHookMocks.triggerInternalHook.mock.calls as unknown as Array<[unknown]>
    )[0]?.[0] as { context?: { previousSessionEntry?: unknown } } | undefined;
    if (!event) {
      throw new Error("expected session hook event");
    }
    expect(event).toMatchObject({
      type: "command",
      action: "new",
      sessionKey: "agent:main:main",
      context: {
        commandSource: "gateway:sessions.reset",
      },
    });
    expect(event.context?.previousSessionEntry).toMatchObject({ sessionId: "sess-main" });
    ws.close();
  });

  test("webchat clients cannot patch or delete sessions", async () => {
    await createSessionStoreDir();

    await writeSessionStore({
      entries: {
        main: {
          sessionId: "sess-main",
          updatedAt: Date.now(),
        },
        "discord:group:dev": {
          sessionId: "sess-group",
          updatedAt: Date.now(),
        },
      },
    });

    const ws = new WebSocket(`ws://127.0.0.1:${harness.port}`, {
      headers: { origin: `http://127.0.0.1:${harness.port}` },
    });
    trackConnectChallengeNonce(ws);
    await new Promise<void>((resolve) => ws.once("open", resolve));
    await connectOk(ws, {
      client: {
        id: GATEWAY_CLIENT_IDS.WEBCHAT_UI,
        version: "1.0.0",
        platform: "test",
        mode: GATEWAY_CLIENT_MODES.UI,
      },
      scopes: ["operator.admin"],
    });

    const patched = await rpcReq(ws, "sessions.patch", {
      key: "agent:main:discord:group:dev",
      label: "should-fail",
    });
    expect(patched.ok).toBe(false);
    expect(patched.error?.message ?? "").toMatch(/webchat clients cannot patch sessions/i);

    const deleted = await rpcReq(ws, "sessions.delete", {
      key: "agent:main:discord:group:dev",
    });
    expect(deleted.ok).toBe(false);
    expect(deleted.error?.message ?? "").toMatch(/webchat clients cannot delete sessions/i);

    ws.close();
  });

  test("control-ui client can delete sessions even in webchat mode", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-sessions-control-ui-delete-"));
    const storePath = path.join(dir, "sessions.json");
    testState.sessionStorePath = storePath;

    await writeSessionStore({
      entries: {
        main: {
          sessionId: "sess-main",
          updatedAt: Date.now(),
        },
        "discord:group:dev": {
          sessionId: "sess-group",
          updatedAt: Date.now(),
        },
      },
    });

    const ws = new WebSocket(`ws://127.0.0.1:${harness.port}`, {
      headers: { origin: `http://127.0.0.1:${harness.port}` },
    });
    trackConnectChallengeNonce(ws);
    await new Promise<void>((resolve) => ws.once("open", resolve));
    await connectOk(ws, {
      client: {
        id: GATEWAY_CLIENT_IDS.CONTROL_UI,
        version: "1.0.0",
        platform: "test",
        mode: GATEWAY_CLIENT_MODES.WEBCHAT,
      },
      scopes: ["operator.admin"],
    });

    const deleted = await rpcReq<{ ok: true; deleted: boolean }>(ws, "sessions.delete", {
      key: "agent:main:discord:group:dev",
    });
    expect(deleted.ok).toBe(true);
    expect(deleted.payload?.deleted).toBe(true);

    const store = JSON.parse(await fs.readFile(storePath, "utf-8")) as Record<
      string,
      { sessionId?: string }
    >;
    expect(store["agent:main:discord:group:dev"]).toBeUndefined();

    ws.close();
  });
});
