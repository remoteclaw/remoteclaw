// Discord tests cover thread bindings.lifecycle plugin behavior.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
  type RemoteClawConfig,
} from "../../../../src/config/config.js";

const hoisted = vi.hoisted(() => {
  const sendMessageDiscord = vi.fn(async (_to: string, _text: string, _opts?: unknown) => ({}));
  const sendWebhookMessageDiscord = vi.fn(async (_text: string, _opts?: unknown) => ({}));
  const restGet = vi.fn(async () => ({
    id: "thread-1",
    type: 11,
    parent_id: "parent-1",
  }));
  const restPost = vi.fn(async () => ({
    id: "wh-created",
    token: "tok-created",
  }));
  const createDiscordRestClient = vi.fn((..._args: unknown[]) => ({
    rest: {
      get: restGet,
      post: restPost,
    },
  }));
  const createThreadDiscord = vi.fn(async (..._args: unknown[]) => ({ id: "thread-created" }));
  const readAcpSessionEntry = vi.fn();
  return {
    sendMessageDiscord,
    sendWebhookMessageDiscord,
    restGet,
    restPost,
    createDiscordRestClient,
    createThreadDiscord,
    readAcpSessionEntry,
  };
});

vi.mock("../send.js", () => ({
  sendMessageDiscord: hoisted.sendMessageDiscord,
  sendWebhookMessageDiscord: hoisted.sendWebhookMessageDiscord,
}));

vi.mock("../client.js", () => ({
  createDiscordRestClient: hoisted.createDiscordRestClient,
}));

vi.mock("../send.messages.js", () => ({
  createThreadDiscord: hoisted.createThreadDiscord,
}));

vi.mock("../../../../src/acp/runtime/session-meta.js", () => ({
  readAcpSessionEntry: hoisted.readAcpSessionEntry,
}));

const {
  __testing,
  autoBindSpawnedDiscordSubagent,
  createThreadBindingManager,
  reconcileAcpThreadBindingsOnStartup,
  resolveThreadBindingInactivityExpiresAt,
  resolveThreadBindingIntroText,
  resolveThreadBindingMaxAgeExpiresAt,
  setThreadBindingIdleTimeoutBySessionKey,
  setThreadBindingMaxAgeBySessionKey,
  unbindThreadBindingsBySessionKey,
} = await import("./thread-bindings.js");

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected ${label}`);
  }
  return value as Record<string, unknown>;
}

function expectFields(
  value: unknown,
  label: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const record = requireRecord(value, label);
  for (const [key, expected] of Object.entries(fields)) {
    expect(record[key]).toEqual(expected);
  }
  return record;
}

function mockCallArg(mock: unknown, callIndex: number, argIndex: number, label: string) {
  const calls = (mock as { mock?: { calls?: unknown[][] } }).mock?.calls;
  if (!Array.isArray(calls)) {
    throw new Error(`Expected ${label} mock calls`);
  }
  const call = calls[callIndex];
  if (!call) {
    throw new Error(`Expected ${label} call ${callIndex + 1}`);
  }
  return call[argIndex];
}

describe("thread binding lifecycle", () => {
  beforeEach(() => {
    __testing.resetThreadBindingsForTests();
    clearRuntimeConfigSnapshot();
    hoisted.sendMessageDiscord.mockClear();
    hoisted.sendWebhookMessageDiscord.mockClear();
    hoisted.restGet.mockClear();
    hoisted.restPost.mockClear();
    hoisted.createDiscordRestClient.mockClear();
    hoisted.createThreadDiscord.mockClear();
    hoisted.readAcpSessionEntry.mockReset().mockReturnValue(null);
    vi.useRealTimers();
  });

  const createDefaultSweeperManager = () =>
    createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: true,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

  const bindDefaultThreadTarget = async (
    manager: ReturnType<typeof createThreadBindingManager>,
  ) => {
    await manager.bindTarget({
      threadId: "thread-1",
      channelId: "parent-1",
      targetKind: "subagent",
      targetSessionKey: "agent:test-agent:subagent:child",
      agentId: "test-agent",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });
  };

  it("does not emit intro text (gutted in the RemoteClaw fork — Middleware Boundary Principle)", () => {
    // thread-bindings-messages is intentionally gutted in the fork; the message
    // generators return "" (see thread-bindings.messages.ts).
    expect(
      resolveThreadBindingIntroText({
        agentId: "test-agent",
        label: "worker",
        idleTimeoutMs: 24 * 60 * 60 * 1000,
        maxAgeMs: 48 * 60 * 60 * 1000,
      }),
    ).toBe("");
  });

  it("auto-unfocuses idle-expired bindings (farewell message gutted in fork)", async () => {
    vi.useFakeTimers();
    try {
      const manager = createThreadBindingManager({
        accountId: "default",
        persist: false,
        enableSweeper: true,
        idleTimeoutMs: 60_000,
        maxAgeMs: 0,
      });

      const binding = await manager.bindTarget({
        threadId: "thread-1",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:child",
        agentId: "test-agent",
        webhookId: "wh-1",
        webhookToken: "tok-1",
        introText: "intro",
      });
      expectFields(binding, "binding", {
        threadId: "thread-1",
        targetSessionKey: "agent:test-agent:subagent:child",
      });
      hoisted.sendMessageDiscord.mockClear();
      hoisted.sendWebhookMessageDiscord.mockClear();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(manager.getByThreadId("thread-1")).toBeUndefined();
      expect(hoisted.restGet).not.toHaveBeenCalled();
      expect(hoisted.sendWebhookMessageDiscord).not.toHaveBeenCalled();
      // Farewell messages are gutted in the RemoteClaw fork (Middleware Boundary
      // Principle — thread-bindings-messages removed → empty text is not sent).
      expect(hoisted.sendMessageDiscord).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-unfocuses max-age-expired bindings (farewell message gutted in fork)", async () => {
    vi.useFakeTimers();
    try {
      const manager = createThreadBindingManager({
        accountId: "default",
        persist: false,
        enableSweeper: true,
        idleTimeoutMs: 0,
        maxAgeMs: 60_000,
      });

      const binding = await manager.bindTarget({
        threadId: "thread-1",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:child",
        agentId: "test-agent",
        webhookId: "wh-1",
        webhookToken: "tok-1",
      });
      expectFields(binding, "binding", {
        threadId: "thread-1",
        targetSessionKey: "agent:test-agent:subagent:child",
      });
      hoisted.sendMessageDiscord.mockClear();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(manager.getByThreadId("thread-1")).toBeUndefined();
      // Farewell messages are gutted in the RemoteClaw fork (Middleware Boundary
      // Principle — thread-bindings-messages removed → empty text is not sent).
      expect(hoisted.sendMessageDiscord).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps binding when thread sweep probe fails transiently", async () => {
    vi.useFakeTimers();
    try {
      const manager = createDefaultSweeperManager();
      await bindDefaultThreadTarget(manager);

      hoisted.restGet.mockRejectedValueOnce(new Error("ECONNRESET"));

      await vi.advanceTimersByTimeAsync(120_000);

      expect(manager.getByThreadId("thread-1")).toBeDefined();
      expect(hoisted.sendWebhookMessageDiscord).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("unbinds when thread sweep probe reports unknown channel", async () => {
    vi.useFakeTimers();
    try {
      const manager = createDefaultSweeperManager();
      await bindDefaultThreadTarget(manager);

      hoisted.restGet.mockRejectedValueOnce({
        status: 404,
        rawError: { code: 10003, message: "Unknown Channel" },
      });

      await vi.advanceTimersByTimeAsync(120_000);

      expect(manager.getByThreadId("thread-1")).toBeUndefined();
      expect(hoisted.sendWebhookMessageDiscord).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates idle timeout by target session key", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-20T23:00:00.000Z"));
      const manager = createThreadBindingManager({
        accountId: "default",
        persist: false,
        enableSweeper: false,
        idleTimeoutMs: 24 * 60 * 60 * 1000,
        maxAgeMs: 0,
      });

      await manager.bindTarget({
        threadId: "thread-1",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:child",
        agentId: "test-agent",
        webhookId: "wh-1",
        webhookToken: "tok-1",
      });

      const boundAt = manager.getByThreadId("thread-1")?.boundAt;
      vi.setSystemTime(new Date("2026-02-20T23:15:00.000Z"));

      const updated = setThreadBindingIdleTimeoutBySessionKey({
        accountId: "default",
        targetSessionKey: "agent:test-agent:subagent:child",
        idleTimeoutMs: 2 * 60 * 60 * 1000,
      });

      expect(updated).toHaveLength(1);
      expect(updated[0]?.lastActivityAt).toBe(new Date("2026-02-20T23:15:00.000Z").getTime());
      expect(updated[0]?.boundAt).toBe(boundAt);
      expect(
        resolveThreadBindingInactivityExpiresAt({
          record: updated[0],
          defaultIdleTimeoutMs: manager.getIdleTimeoutMs(),
        }),
      ).toBe(new Date("2026-02-21T01:15:00.000Z").getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates max age by target session key", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-20T10:00:00.000Z"));
      const manager = createThreadBindingManager({
        accountId: "default",
        persist: false,
        enableSweeper: false,
        idleTimeoutMs: 24 * 60 * 60 * 1000,
        maxAgeMs: 0,
      });

      await manager.bindTarget({
        threadId: "thread-1",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:child",
        agentId: "test-agent",
      });

      vi.setSystemTime(new Date("2026-02-20T10:30:00.000Z"));
      const updated = setThreadBindingMaxAgeBySessionKey({
        accountId: "default",
        targetSessionKey: "agent:test-agent:subagent:child",
        maxAgeMs: 3 * 60 * 60 * 1000,
      });

      expect(updated).toHaveLength(1);
      expect(updated[0]?.boundAt).toBe(new Date("2026-02-20T10:30:00.000Z").getTime());
      expect(updated[0]?.lastActivityAt).toBe(new Date("2026-02-20T10:30:00.000Z").getTime());
      expect(
        resolveThreadBindingMaxAgeExpiresAt({
          record: updated[0],
          defaultMaxAgeMs: manager.getMaxAgeMs(),
        }),
      ).toBe(new Date("2026-02-20T13:30:00.000Z").getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps binding when idle timeout is disabled per session key", async () => {
    vi.useFakeTimers();
    try {
      const manager = createThreadBindingManager({
        accountId: "default",
        persist: false,
        enableSweeper: true,
        idleTimeoutMs: 60_000,
        maxAgeMs: 0,
      });

      await manager.bindTarget({
        threadId: "thread-1",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:child",
        agentId: "test-agent",
        webhookId: "wh-1",
        webhookToken: "tok-1",
      });

      const updated = setThreadBindingIdleTimeoutBySessionKey({
        accountId: "default",
        targetSessionKey: "agent:test-agent:subagent:child",
        idleTimeoutMs: 0,
      });
      expect(updated).toHaveLength(1);
      expect(updated[0]?.idleTimeoutMs).toBe(0);

      await vi.advanceTimersByTimeAsync(240_000);

      expect(manager.getByThreadId("thread-1")).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a binding when activity is touched during the same sweep pass", async () => {
    vi.useFakeTimers();
    try {
      const manager = createThreadBindingManager({
        accountId: "default",
        persist: false,
        enableSweeper: true,
        idleTimeoutMs: 60_000,
        maxAgeMs: 0,
      });

      await manager.bindTarget({
        threadId: "thread-1",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:first",
        agentId: "test-agent",
        webhookId: "wh-1",
        webhookToken: "tok-1",
      });
      await manager.bindTarget({
        threadId: "thread-2",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:second",
        agentId: "test-agent",
        webhookId: "wh-2",
        webhookToken: "tok-2",
      });

      // Keep the first binding off the idle-expire path so the sweep performs
      // an awaited probe and gives a window for in-pass touches.
      setThreadBindingIdleTimeoutBySessionKey({
        accountId: "default",
        targetSessionKey: "agent:test-agent:subagent:first",
        idleTimeoutMs: 0,
      });

      hoisted.restGet.mockImplementation(async (...args: unknown[]) => {
        const route = typeof args[0] === "string" ? args[0] : "";
        if (route.includes("thread-1")) {
          manager.touchThread({ threadId: "thread-2", persist: false });
        }
        return {
          id: route.split("/").at(-1) ?? "thread-1",
          type: 11,
          parent_id: "parent-1",
        };
      });
      hoisted.sendMessageDiscord.mockClear();

      await vi.advanceTimersByTimeAsync(120_000);

      expect(manager.getByThreadId("thread-2")).toBeDefined();
      expect(hoisted.sendMessageDiscord).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes inactivity window when thread activity is touched", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-02-20T00:00:00.000Z"));
      const manager = createThreadBindingManager({
        accountId: "default",
        persist: false,
        enableSweeper: false,
        idleTimeoutMs: 60_000,
        maxAgeMs: 0,
      });

      await manager.bindTarget({
        threadId: "thread-1",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:child",
        agentId: "test-agent",
      });

      vi.setSystemTime(new Date("2026-02-20T00:00:30.000Z"));
      const touched = manager.touchThread({ threadId: "thread-1", persist: false });
      expectFields(touched, "touched binding", {
        threadId: "thread-1",
        lastActivityAt: new Date("2026-02-20T00:00:30.000Z").getTime(),
      });

      const record = manager.getByThreadId("thread-1");
      expect(record).toBeDefined();
      expect(record?.lastActivityAt).toBe(new Date("2026-02-20T00:00:30.000Z").getTime());
      expect(
        resolveThreadBindingInactivityExpiresAt({
          record: record!,
          defaultIdleTimeoutMs: manager.getIdleTimeoutMs(),
        }),
      ).toBe(new Date("2026-02-20T00:01:30.000Z").getTime());
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists touched activity timestamps across restart when persistence is enabled", async () => {
    vi.useFakeTimers();
    const previousStateDir = process.env.REMOTECLAW_STATE_DIR;
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-thread-bindings-"));
    process.env.REMOTECLAW_STATE_DIR = stateDir;
    try {
      __testing.resetThreadBindingsForTests();
      vi.setSystemTime(new Date("2026-02-20T00:00:00.000Z"));
      const manager = createThreadBindingManager({
        accountId: "default",
        persist: true,
        enableSweeper: false,
        idleTimeoutMs: 60_000,
        maxAgeMs: 0,
      });

      await manager.bindTarget({
        threadId: "thread-1",
        channelId: "parent-1",
        targetKind: "subagent",
        targetSessionKey: "agent:test-agent:subagent:child",
        agentId: "test-agent",
        webhookId: "wh-1",
        webhookToken: "tok-1",
      });

      const touchedAt = new Date("2026-02-20T00:00:30.000Z").getTime();
      vi.setSystemTime(touchedAt);
      manager.touchThread({ threadId: "thread-1" });

      __testing.resetThreadBindingsForTests();
      const reloaded = createThreadBindingManager({
        accountId: "default",
        persist: true,
        enableSweeper: false,
        idleTimeoutMs: 60_000,
        maxAgeMs: 0,
      });

      const record = reloaded.getByThreadId("thread-1");
      expect(record).toBeDefined();
      expect(record?.lastActivityAt).toBe(touchedAt);
      expect(
        resolveThreadBindingInactivityExpiresAt({
          record: record!,
          defaultIdleTimeoutMs: reloaded.getIdleTimeoutMs(),
        }),
      ).toBe(new Date("2026-02-20T00:01:30.000Z").getTime());
    } finally {
      __testing.resetThreadBindingsForTests();
      if (previousStateDir === undefined) {
        delete process.env.REMOTECLAW_STATE_DIR;
      } else {
        process.env.REMOTECLAW_STATE_DIR = previousStateDir;
      }
      fs.rmSync(stateDir, { recursive: true, force: true });
      vi.useRealTimers();
    }
  });

  it("reuses webhook credentials after unbind when rebinding in the same channel", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    const first = await manager.bindTarget({
      threadId: "thread-1",
      channelId: "parent-1",
      targetKind: "subagent",
      targetSessionKey: "agent:test-agent:subagent:child-1",
      agentId: "test-agent",
    });
    expectFields(first, "first binding", {
      threadId: "thread-1",
      targetSessionKey: "agent:test-agent:subagent:child-1",
    });
    expect(hoisted.restPost).toHaveBeenCalledTimes(1);

    manager.unbindThread({
      threadId: "thread-1",
      sendFarewell: false,
    });

    const second = await manager.bindTarget({
      threadId: "thread-2",
      channelId: "parent-1",
      targetKind: "subagent",
      targetSessionKey: "agent:test-agent:subagent:child-2",
      agentId: "test-agent",
    });
    expectFields(second, "second binding", {
      webhookId: "wh-created",
      webhookToken: "tok-created",
    });
    expect(hoisted.restPost).toHaveBeenCalledTimes(1);
  });

  it("creates a new thread when spawning from an already bound thread", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    await manager.bindTarget({
      threadId: "thread-1",
      channelId: "parent-1",
      targetKind: "subagent",
      targetSessionKey: "agent:test-agent:subagent:parent",
      agentId: "test-agent",
    });
    hoisted.createThreadDiscord.mockClear();
    hoisted.createThreadDiscord.mockResolvedValueOnce({ id: "thread-created-2" });

    const childBinding = await autoBindSpawnedDiscordSubagent({
      accountId: "default",
      channel: "discord",
      to: "channel:thread-1",
      threadId: "thread-1",
      childSessionKey: "agent:test-agent:subagent:child-2",
      agentId: "test-agent",
    });

    expectFields(childBinding, "child binding", {
      threadId: "thread-created-2",
      targetSessionKey: "agent:test-agent:subagent:child-2",
    });
    expect(hoisted.createThreadDiscord).toHaveBeenCalledTimes(1);
    expect(mockCallArg(hoisted.createThreadDiscord, 0, 0, "createThreadDiscord")).toBe("parent-1");
    expectFields(
      mockCallArg(hoisted.createThreadDiscord, 0, 1, "createThreadDiscord"),
      "thread options",
      {
        autoArchiveMinutes: 60,
      },
    );
    expectFields(
      mockCallArg(hoisted.createThreadDiscord, 0, 2, "createThreadDiscord"),
      "thread context",
      {
        accountId: "default",
      },
    );
    expect(manager.getByThreadId("thread-1")?.targetSessionKey).toBe(
      "agent:test-agent:subagent:parent",
    );
    expect(manager.getByThreadId("thread-created-2")?.targetSessionKey).toBe(
      "agent:test-agent:subagent:child-2",
    );
  });

  it("resolves parent channel when thread target is passed via to without threadId", async () => {
    createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    hoisted.restGet.mockClear();
    hoisted.restGet.mockResolvedValueOnce({
      id: "thread-lookup",
      type: 11,
      parent_id: "parent-1",
    });
    hoisted.createThreadDiscord.mockClear();
    hoisted.createThreadDiscord.mockResolvedValueOnce({ id: "thread-created-lookup" });

    const childBinding = await autoBindSpawnedDiscordSubagent({
      accountId: "default",
      channel: "discord",
      to: "channel:thread-lookup",
      childSessionKey: "agent:test-agent:subagent:child-lookup",
      agentId: "test-agent",
    });

    expectFields(childBinding, "child binding", { channelId: "parent-1" });
    expect(hoisted.restGet).toHaveBeenCalledTimes(1);
    expect(mockCallArg(hoisted.createThreadDiscord, 0, 0, "createThreadDiscord")).toBe("parent-1");
    expectFields(
      mockCallArg(hoisted.createThreadDiscord, 0, 1, "createThreadDiscord"),
      "thread options",
      {
        autoArchiveMinutes: 60,
      },
    );
    expectFields(
      mockCallArg(hoisted.createThreadDiscord, 0, 2, "createThreadDiscord"),
      "thread context",
      {
        accountId: "default",
      },
    );
  });

  it("passes manager token when resolving parent channels for auto-bind", async () => {
    const cfg = {
      channels: { discord: { token: "tok" } },
    } as RemoteClawConfig;
    createThreadBindingManager({
      accountId: "runtime",
      token: "runtime-token",
      cfg,
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    hoisted.createDiscordRestClient.mockClear();
    hoisted.restGet.mockClear();
    hoisted.restGet.mockResolvedValueOnce({
      id: "thread-runtime",
      type: 11,
      parent_id: "parent-runtime",
    });
    hoisted.createThreadDiscord.mockClear();
    hoisted.createThreadDiscord.mockResolvedValueOnce({ id: "thread-created-runtime" });

    const childBinding = await autoBindSpawnedDiscordSubagent({
      cfg,
      accountId: "runtime",
      channel: "discord",
      to: "channel:thread-runtime",
      childSessionKey: "agent:test-agent:subagent:child-runtime",
      agentId: "test-agent",
    });

    expectFields(childBinding, "child binding", {
      threadId: "thread-created-runtime",
      targetSessionKey: "agent:test-agent:subagent:child-runtime",
    });
    const firstClientArgs = mockCallArg(
      hoisted.createDiscordRestClient,
      0,
      0,
      "createDiscordRestClient",
    ) as { accountId?: string; token?: string } | undefined;
    expectFields(firstClientArgs, "first client args", {
      accountId: "runtime",
      token: "runtime-token",
    });
    const usedCfg = hoisted.createDiscordRestClient.mock.calls.some((call) => {
      if (call?.[1] === cfg) {
        return true;
      }
      const first = call?.[0];
      return (
        typeof first === "object" && first !== null && (first as { cfg?: unknown }).cfg === cfg
      );
    });
    expect(usedCfg).toBe(true);
  });

  it("uses the active runtime snapshot cfg for manager operations", async () => {
    const startupCfg = {
      channels: { discord: { token: "startup-token" } },
    } as RemoteClawConfig;
    const refreshedCfg = {
      channels: { discord: { token: "refreshed-token" } },
    } as RemoteClawConfig;
    const manager = createThreadBindingManager({
      accountId: "runtime",
      token: "runtime-token",
      cfg: startupCfg,
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    setRuntimeConfigSnapshot(refreshedCfg);
    hoisted.createDiscordRestClient.mockClear();
    hoisted.createThreadDiscord.mockClear();
    hoisted.createThreadDiscord.mockResolvedValueOnce({ id: "thread-created-runtime-cfg" });

    const bound = await manager.bindTarget({
      createThread: true,
      channelId: "parent-runtime",
      targetKind: "subagent",
      targetSessionKey: "agent:main:subagent:runtime-cfg",
      agentId: "main",
    });

    expectFields(bound, "bound thread", {
      threadId: "thread-created-runtime-cfg",
      targetSessionKey: "agent:main:subagent:runtime-cfg",
    });
    const usedRefreshedCfg = hoisted.createDiscordRestClient.mock.calls.some((call) => {
      if (call?.[1] === refreshedCfg) {
        return true;
      }
      const first = call?.[0];
      return (
        typeof first === "object" &&
        first !== null &&
        (first as { cfg?: unknown }).cfg === refreshedCfg
      );
    });
    expect(usedRefreshedCfg).toBe(true);
    const usedStartupCfg = hoisted.createDiscordRestClient.mock.calls.some((call) => {
      if (call?.[1] === startupCfg) {
        return true;
      }
      const first = call?.[0];
      return (
        typeof first === "object" &&
        first !== null &&
        (first as { cfg?: unknown }).cfg === startupCfg
      );
    });
    expect(usedStartupCfg).toBe(false);
  });

  it("refreshes manager token when an existing manager is reused", async () => {
    createThreadBindingManager({
      accountId: "runtime",
      token: "token-old",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });
    const manager = createThreadBindingManager({
      accountId: "runtime",
      token: "token-new",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    hoisted.createThreadDiscord.mockClear();
    hoisted.createThreadDiscord.mockResolvedValueOnce({ id: "thread-created-token-refresh" });
    hoisted.createDiscordRestClient.mockClear();

    const bound = await manager.bindTarget({
      createThread: true,
      channelId: "parent-runtime",
      targetKind: "subagent",
      targetSessionKey: "agent:test-agent:subagent:token-refresh",
      agentId: "test-agent",
    });

    expectFields(bound, "bound thread", {
      threadId: "thread-created-token-refresh",
      targetSessionKey: "agent:test-agent:subagent:token-refresh",
    });
    expect(mockCallArg(hoisted.createThreadDiscord, 0, 0, "createThreadDiscord")).toBe(
      "parent-runtime",
    );
    expectFields(
      mockCallArg(hoisted.createThreadDiscord, 0, 1, "createThreadDiscord"),
      "thread options",
      {
        autoArchiveMinutes: 60,
      },
    );
    expectFields(
      mockCallArg(hoisted.createThreadDiscord, 0, 2, "createThreadDiscord"),
      "thread context",
      {
        accountId: "runtime",
        token: "token-new",
      },
    );
    const usedTokenNew = hoisted.createDiscordRestClient.mock.calls.some(
      (call) => (call?.[0] as { token?: string } | undefined)?.token === "token-new",
    );
    expect(usedTokenNew).toBe(true);
  });

  it("keeps overlapping thread ids isolated per account", async () => {
    const a = createThreadBindingManager({
      accountId: "a",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });
    const b = createThreadBindingManager({
      accountId: "b",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    const aBinding = await a.bindTarget({
      threadId: "thread-1",
      channelId: "parent-1",
      targetKind: "subagent",
      targetSessionKey: "agent:test-agent:subagent:a",
      agentId: "test-agent",
    });
    const bBinding = await b.bindTarget({
      threadId: "thread-1",
      channelId: "parent-1",
      targetKind: "subagent",
      targetSessionKey: "agent:test-agent:subagent:b",
      agentId: "test-agent",
    });

    expect(aBinding?.accountId).toBe("a");
    expect(bBinding?.accountId).toBe("b");
    expect(a.getByThreadId("thread-1")?.targetSessionKey).toBe("agent:test-agent:subagent:a");
    expect(b.getByThreadId("thread-1")?.targetSessionKey).toBe("agent:test-agent:subagent:b");

    const removedA = a.unbindBySessionKey({
      targetSessionKey: "agent:test-agent:subagent:a",
      sendFarewell: false,
    });
    expect(removedA).toHaveLength(1);
    expect(a.getByThreadId("thread-1")).toBeUndefined();
    expect(b.getByThreadId("thread-1")?.targetSessionKey).toBe("agent:test-agent:subagent:b");
  });

  it("removes stale ACP bindings during startup reconciliation", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    await manager.bindTarget({
      threadId: "thread-acp-healthy",
      channelId: "parent-1",
      targetKind: "acp",
      targetSessionKey: "agent:codex:acp:healthy",
      agentId: "codex",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });
    await manager.bindTarget({
      threadId: "thread-acp-stale",
      channelId: "parent-1",
      targetKind: "acp",
      targetSessionKey: "agent:codex:acp:stale",
      agentId: "codex",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });
    await manager.bindTarget({
      threadId: "thread-subagent",
      channelId: "parent-1",
      targetKind: "subagent",
      targetSessionKey: "agent:test-agent:subagent:child",
      agentId: "test-agent",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });

    hoisted.readAcpSessionEntry.mockImplementation((paramsUnknown: unknown) => {
      const sessionKey = (paramsUnknown as { sessionKey?: string }).sessionKey ?? "";
      if (sessionKey === "agent:codex:acp:healthy") {
        return {
          sessionKey,
          storeSessionKey: sessionKey,
          acp: {
            backend: "acpx",
            agent: "codex",
            runtimeSessionName: "runtime:healthy",
            mode: "persistent",
            state: "idle",
            lastActivityAt: Date.now(),
          },
        };
      }
      return {
        sessionKey,
        storeSessionKey: sessionKey,
        acp: undefined,
      };
    });

    const result = await reconcileAcpThreadBindingsOnStartup({
      cfg: {} as RemoteClawConfig,
      accountId: "default",
    });

    expect(result.checked).toBe(2);
    expect(result.removed).toBe(1);
    expect(result.staleSessionKeys).toContain("agent:codex:acp:stale");
    expect(manager.getByThreadId("thread-acp-healthy")).toBeDefined();
    expect(manager.getByThreadId("thread-acp-stale")).toBeUndefined();
    expect(manager.getByThreadId("thread-subagent")).toBeDefined();
    expect(hoisted.sendMessageDiscord).not.toHaveBeenCalled();
    expect(hoisted.sendWebhookMessageDiscord).not.toHaveBeenCalled();
  });

  it("keeps ACP bindings when session store reads fail during startup reconciliation", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    await manager.bindTarget({
      threadId: "thread-acp-uncertain",
      channelId: "parent-1",
      targetKind: "acp",
      targetSessionKey: "agent:codex:acp:uncertain",
      agentId: "codex",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });

    hoisted.readAcpSessionEntry.mockReturnValue({
      sessionKey: "agent:codex:acp:uncertain",
      storeSessionKey: "agent:codex:acp:uncertain",
      cfg: {} as RemoteClawConfig,
      storePath: "/tmp/mock-sessions.json",
      storeReadFailed: true,
      entry: undefined,
      acp: undefined,
    });

    const result = await reconcileAcpThreadBindingsOnStartup({
      cfg: {} as RemoteClawConfig,
      accountId: "default",
    });

    expect(result.checked).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.staleSessionKeys).toEqual([]);
    expect(manager.getByThreadId("thread-acp-uncertain")).toBeDefined();
  });

  it("removes ACP bindings when health probe marks running session as stale", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    await manager.bindTarget({
      threadId: "thread-acp-running",
      channelId: "parent-1",
      targetKind: "acp",
      targetSessionKey: "agent:codex:acp:running",
      agentId: "codex",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });

    hoisted.readAcpSessionEntry.mockReturnValue({
      sessionKey: "agent:codex:acp:running",
      storeSessionKey: "agent:codex:acp:running",
      acp: {
        backend: "acpx",
        agent: "codex",
        runtimeSessionName: "runtime:running",
        mode: "persistent",
        state: "running",
        lastActivityAt: Date.now() - 5 * 60 * 1000,
      },
    });

    const result = await reconcileAcpThreadBindingsOnStartup({
      cfg: {} as RemoteClawConfig,
      accountId: "default",
      healthProbe: async () => ({ status: "stale", reason: "status-timeout-running-stale" }),
    });

    expect(result.checked).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.staleSessionKeys).toContain("agent:codex:acp:running");
    expect(manager.getByThreadId("thread-acp-running")).toBeUndefined();
  });

  it("keeps running ACP bindings when health probe is uncertain", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    await manager.bindTarget({
      threadId: "thread-acp-running-uncertain",
      channelId: "parent-1",
      targetKind: "acp",
      targetSessionKey: "agent:codex:acp:running-uncertain",
      agentId: "codex",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });

    hoisted.readAcpSessionEntry.mockReturnValue({
      sessionKey: "agent:codex:acp:running-uncertain",
      storeSessionKey: "agent:codex:acp:running-uncertain",
      acp: {
        backend: "acpx",
        agent: "codex",
        runtimeSessionName: "runtime:running-uncertain",
        mode: "persistent",
        state: "running",
        lastActivityAt: Date.now(),
      },
    });

    const result = await reconcileAcpThreadBindingsOnStartup({
      cfg: {} as RemoteClawConfig,
      accountId: "default",
      healthProbe: async () => ({ status: "uncertain", reason: "status-timeout" }),
    });

    expect(result.checked).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.staleSessionKeys).toEqual([]);
    expect(manager.getByThreadId("thread-acp-running-uncertain")).toBeDefined();
  });

  it("keeps ACP bindings in stored error state when no explicit stale probe verdict exists", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    await manager.bindTarget({
      threadId: "thread-acp-error",
      channelId: "parent-1",
      targetKind: "acp",
      targetSessionKey: "agent:codex:acp:error",
      agentId: "codex",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });

    hoisted.readAcpSessionEntry.mockReturnValue({
      sessionKey: "agent:codex:acp:error",
      storeSessionKey: "agent:codex:acp:error",
      acp: {
        backend: "acpx",
        agent: "codex",
        runtimeSessionName: "runtime:error",
        mode: "persistent",
        state: "error",
        lastActivityAt: Date.now(),
      },
    });

    const result = await reconcileAcpThreadBindingsOnStartup({
      cfg: {} as RemoteClawConfig,
      accountId: "default",
    });

    expect(result.checked).toBe(1);
    expect(result.removed).toBe(0);
    expect(result.staleSessionKeys).toEqual([]);
    expect(manager.getByThreadId("thread-acp-error")).toBeDefined();
  });

  it("starts ACP health probes in parallel during startup reconciliation", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    await manager.bindTarget({
      threadId: "thread-acp-probe-1",
      channelId: "parent-1",
      targetKind: "acp",
      targetSessionKey: "agent:codex:acp:probe-1",
      agentId: "codex",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });
    await manager.bindTarget({
      threadId: "thread-acp-probe-2",
      channelId: "parent-1",
      targetKind: "acp",
      targetSessionKey: "agent:codex:acp:probe-2",
      agentId: "codex",
      webhookId: "wh-1",
      webhookToken: "tok-1",
    });

    hoisted.readAcpSessionEntry.mockImplementation((paramsUnknown: unknown) => {
      const sessionKey = (paramsUnknown as { sessionKey?: string }).sessionKey ?? "";
      return {
        sessionKey,
        storeSessionKey: sessionKey,
        acp: {
          backend: "acpx",
          agent: "codex",
          runtimeSessionName: `runtime:${sessionKey}`,
          mode: "persistent",
          state: "running",
          lastActivityAt: Date.now(),
        },
      };
    });

    let resolveFirstProbe: ((value: { status: "healthy" }) => void) | undefined;
    const firstProbe = new Promise<{ status: "healthy" }>((resolve) => {
      resolveFirstProbe = resolve;
    });
    let probeCallCount = 0;
    let secondProbeStartedBeforeFirstResolved = false;

    const reconcilePromise = reconcileAcpThreadBindingsOnStartup({
      cfg: {} as RemoteClawConfig,
      accountId: "default",
      healthProbe: async () => {
        probeCallCount += 1;
        if (probeCallCount === 1) {
          return await firstProbe;
        }
        secondProbeStartedBeforeFirstResolved = true;
        return { status: "healthy" as const };
      },
    });

    await Promise.resolve();
    await Promise.resolve();
    const observedParallelStart = secondProbeStartedBeforeFirstResolved;

    resolveFirstProbe?.({ status: "healthy" });
    const result = await reconcilePromise;

    expect(observedParallelStart).toBe(true);
    expect(result.checked).toBe(2);
    expect(result.removed).toBe(0);
  });

  it("caps ACP startup health probe concurrency", async () => {
    const manager = createThreadBindingManager({
      accountId: "default",
      persist: false,
      enableSweeper: false,
      idleTimeoutMs: 24 * 60 * 60 * 1000,
      maxAgeMs: 0,
    });

    for (let index = 0; index < 12; index += 1) {
      const key = `agent:codex:acp:cap-${index}`;
      await manager.bindTarget({
        threadId: `thread-acp-cap-${index}`,
        channelId: "parent-1",
        targetKind: "acp",
        targetSessionKey: key,
        agentId: "codex",
        webhookId: "wh-1",
        webhookToken: "tok-1",
      });
    }

    hoisted.readAcpSessionEntry.mockImplementation((paramsUnknown: unknown) => {
      const sessionKey = (paramsUnknown as { sessionKey?: string }).sessionKey ?? "";
      return {
        sessionKey,
        storeSessionKey: sessionKey,
        acp: {
          backend: "acpx",
          agent: "codex",
          runtimeSessionName: `runtime:${sessionKey}`,
          mode: "persistent",
          state: "running",
          lastActivityAt: Date.now(),
        },
      };
    });

    const PROBE_LIMIT = 8;
    let probeCalls = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    let releaseFirstWave: (() => void) | undefined;
    const firstWaveGate = new Promise<void>((resolve) => {
      releaseFirstWave = resolve;
    });

    const reconcilePromise = reconcileAcpThreadBindingsOnStartup({
      cfg: {} as RemoteClawConfig,
      accountId: "default",
      healthProbe: async () => {
        probeCalls += 1;
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (probeCalls <= PROBE_LIMIT) {
          await firstWaveGate;
        }
        inFlight -= 1;
        return { status: "healthy" as const };
      },
    });

    await vi.waitFor(() => {
      expect(probeCalls).toBe(PROBE_LIMIT);
    });
    expect(maxInFlight).toBe(PROBE_LIMIT);

    releaseFirstWave?.();
    const result = await reconcilePromise;
    expect(result.checked).toBe(12);
    expect(result.removed).toBe(0);
    expect(maxInFlight).toBeLessThanOrEqual(PROBE_LIMIT);
  });

  it("migrates legacy expiresAt bindings to idle/max-age semantics", () => {
    const previousStateDir = process.env.REMOTECLAW_STATE_DIR;
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-thread-bindings-"));
    process.env.REMOTECLAW_STATE_DIR = stateDir;
    try {
      __testing.resetThreadBindingsForTests();
      const bindingsPath = __testing.resolveThreadBindingsPath();
      fs.mkdirSync(path.dirname(bindingsPath), { recursive: true });
      const boundAt = Date.now() - 10_000;
      const expiresAt = boundAt + 60_000;
      fs.writeFileSync(
        bindingsPath,
        JSON.stringify(
          {
            version: 1,
            bindings: {
              "thread-legacy-active": {
                accountId: "default",
                channelId: "parent-1",
                threadId: "thread-legacy-active",
                targetKind: "subagent",
                targetSessionKey: "agent:test-agent:subagent:legacy-active",
                agentId: "test-agent",
                boundBy: "system",
                boundAt,
                expiresAt,
              },
              "thread-legacy-disabled": {
                accountId: "default",
                channelId: "parent-1",
                threadId: "thread-legacy-disabled",
                targetKind: "subagent",
                targetSessionKey: "agent:test-agent:subagent:legacy-disabled",
                agentId: "test-agent",
                boundBy: "system",
                boundAt,
                expiresAt: 0,
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const manager = createThreadBindingManager({
        accountId: "default",
        persist: false,
        enableSweeper: false,
        idleTimeoutMs: 24 * 60 * 60 * 1000,
        maxAgeMs: 0,
      });

      const active = manager.getByThreadId("thread-legacy-active");
      expect(active).toBeDefined();
      expect(active?.idleTimeoutMs).toBe(0);
      expect(active?.maxAgeMs).toBe(expiresAt - boundAt);
      expect(
        resolveThreadBindingMaxAgeExpiresAt({
          record: active!,
          defaultMaxAgeMs: manager.getMaxAgeMs(),
        }),
      ).toBe(expiresAt);
      expect(
        resolveThreadBindingInactivityExpiresAt({
          record: active!,
          defaultIdleTimeoutMs: manager.getIdleTimeoutMs(),
        }),
      ).toBeUndefined();

      const disabled = manager.getByThreadId("thread-legacy-disabled");
      if (!disabled) {
        throw new Error("missing migrated legacy disabled thread binding");
      }
      expect(disabled.idleTimeoutMs).toBe(0);
      expect(disabled.maxAgeMs).toBe(0);
      expect(
        resolveThreadBindingMaxAgeExpiresAt({
          record: disabled,
          defaultMaxAgeMs: manager.getMaxAgeMs(),
        }),
      ).toBeUndefined();
      expect(
        resolveThreadBindingInactivityExpiresAt({
          record: disabled,
          defaultIdleTimeoutMs: manager.getIdleTimeoutMs(),
        }),
      ).toBeUndefined();
    } finally {
      __testing.resetThreadBindingsForTests();
      if (previousStateDir === undefined) {
        delete process.env.REMOTECLAW_STATE_DIR;
      } else {
        process.env.REMOTECLAW_STATE_DIR = previousStateDir;
      }
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("persists unbinds even when no manager is active", () => {
    const previousStateDir = process.env.REMOTECLAW_STATE_DIR;
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-thread-bindings-"));
    process.env.REMOTECLAW_STATE_DIR = stateDir;
    try {
      __testing.resetThreadBindingsForTests();
      const bindingsPath = __testing.resolveThreadBindingsPath();
      fs.mkdirSync(path.dirname(bindingsPath), { recursive: true });
      const now = Date.now();
      fs.writeFileSync(
        bindingsPath,
        JSON.stringify(
          {
            version: 1,
            bindings: {
              "thread-1": {
                accountId: "default",
                channelId: "parent-1",
                threadId: "thread-1",
                targetKind: "subagent",
                targetSessionKey: "agent:test-agent:subagent:child",
                agentId: "test-agent",
                boundBy: "system",
                boundAt: now,
                lastActivityAt: now,
                idleTimeoutMs: 60_000,
                maxAgeMs: 0,
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const removed = unbindThreadBindingsBySessionKey({
        targetSessionKey: "agent:test-agent:subagent:child",
      });
      expect(removed).toHaveLength(1);

      const payload = JSON.parse(fs.readFileSync(bindingsPath, "utf-8")) as {
        bindings?: Record<string, unknown>;
      };
      expect(Object.keys(payload.bindings ?? {})).toStrictEqual([]);
    } finally {
      __testing.resetThreadBindingsForTests();
      if (previousStateDir === undefined) {
        delete process.env.REMOTECLAW_STATE_DIR;
      } else {
        process.env.REMOTECLAW_STATE_DIR = previousStateDir;
      }
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
