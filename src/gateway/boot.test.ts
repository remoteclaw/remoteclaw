import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionScope } from "../config/sessions/types.js";

const agentCommand = vi.fn();

vi.mock("../commands/agent.js", () => ({ agentCommand }));

const { runBootOnce, resolveBootPrompt } = await import("./boot.js");
const { resolveAgentIdFromSessionKey, resolveAgentMainSessionKey, resolveMainSessionKey } =
  await import("../config/sessions/main-session.js");
const { resolveStorePath } = await import("../config/sessions/paths.js");
const { loadSessionStore, saveSessionStore } = await import("../config/sessions/store.js");

describe("resolveBootPrompt", () => {
  it("returns not-configured when boot is undefined", async () => {
    await expect(resolveBootPrompt(undefined, "/ws")).resolves.toEqual({
      status: "not-configured",
    });
  });

  it("returns not-configured when boot has neither prompt nor file", async () => {
    await expect(resolveBootPrompt({}, "/ws")).resolves.toEqual({
      status: "not-configured",
    });
  });

  it("returns ok with inline prompt", async () => {
    await expect(resolveBootPrompt({ prompt: "Check inbox" }, "/ws")).resolves.toEqual({
      status: "ok",
      content: "Check inbox",
    });
  });

  it("returns empty when prompt is whitespace-only", async () => {
    await expect(resolveBootPrompt({ prompt: "   \n\t " }, "/ws")).resolves.toEqual({
      status: "empty",
    });
  });

  it("returns ok with file content", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "boot-test-"));
    try {
      await fs.writeFile(path.join(workspaceDir, "boot.md"), "Do health check", "utf-8");
      await expect(resolveBootPrompt({ file: "boot.md" }, workspaceDir)).resolves.toEqual({
        status: "ok",
        content: "Do health check",
      });
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("returns read-error when file does not exist", async () => {
    const result = await resolveBootPrompt({ file: "missing.md" }, "/nonexistent");
    expect(result.status).toBe("read-error");
    if (result.status === "read-error") {
      expect(result.error).toBeTruthy();
    }
  });

  it("returns empty when file is whitespace-only", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "boot-test-"));
    try {
      await fs.writeFile(path.join(workspaceDir, "boot.md"), "  \n ", "utf-8");
      await expect(resolveBootPrompt({ file: "boot.md" }, workspaceDir)).resolves.toEqual({
        status: "empty",
      });
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("prompt takes precedence over file", async () => {
    await expect(
      resolveBootPrompt({ prompt: "Inline prompt", file: "ignored.md" }, "/ws"),
    ).resolves.toEqual({
      status: "ok",
      content: "Inline prompt",
    });
  });
});

describe("runBootOnce", () => {
  const resolveMainStore = (
    cfg: {
      session?: { store?: string; scope?: SessionScope; mainKey?: string };
      agents?: { list?: Array<{ id?: string; default?: boolean }> };
    } = {},
  ) => {
    const sessionKey = resolveMainSessionKey(cfg);
    const agentId = resolveAgentIdFromSessionKey(sessionKey);
    const storePath = resolveStorePath(cfg.session?.store, { agentId });
    return { sessionKey, storePath };
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { storePath } = resolveMainStore();
    await fs.rm(storePath, { force: true });
  });

  const makeDeps = () => ({
    sendMessageWhatsApp: vi.fn(),
    sendMessageTelegram: vi.fn(),
    sendMessageDiscord: vi.fn(),
    sendMessageSlack: vi.fn(),
    sendMessageSignal: vi.fn(),
    sendMessageIMessage: vi.fn(),
  });

  const mockAgentUpdatesMainSession = (storePath: string, sessionKey: string) => {
    agentCommand.mockImplementation(async (opts: { sessionId?: string }) => {
      const current = loadSessionStore(storePath, { skipCache: true });
      current[sessionKey] = {
        sessionId: String(opts.sessionId),
        updatedAt: Date.now(),
      };
      await saveSessionStore(storePath, current);
    });
  };

  const expectMainSessionRestored = (params: {
    storePath: string;
    sessionKey: string;
    expectedSessionId?: string;
  }) => {
    const restored = loadSessionStore(params.storePath, { skipCache: true });
    if (params.expectedSessionId === undefined) {
      expect(restored[params.sessionKey]).toBeUndefined();
      return;
    }
    expect(restored[params.sessionKey]?.sessionId).toBe(params.expectedSessionId);
  };

  it("skips when boot config is undefined", async () => {
    await expect(
      runBootOnce({ cfg: {}, deps: makeDeps(), boot: undefined, workspaceDir: "/ws" }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "not-configured",
    });
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("skips when boot config has neither prompt nor file", async () => {
    await expect(
      runBootOnce({ cfg: {}, deps: makeDeps(), boot: {}, workspaceDir: "/ws" }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "not-configured",
    });
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("skips when prompt is empty", async () => {
    await expect(
      runBootOnce({ cfg: {}, deps: makeDeps(), boot: { prompt: "  \n " }, workspaceDir: "/ws" }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "empty",
    });
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("returns failed when boot file cannot be read", async () => {
    const result = await runBootOnce({
      cfg: {},
      deps: makeDeps(),
      boot: { file: "nonexistent.md" },
      workspaceDir: "/nonexistent",
    });
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.reason.length).toBeGreaterThan(0);
    }
    expect(agentCommand).not.toHaveBeenCalled();
  });

  it("runs agent command with inline prompt", async () => {
    const prompt = "Say hello when you wake up.";
    agentCommand.mockResolvedValue(undefined);
    await expect(
      runBootOnce({ cfg: {}, deps: makeDeps(), boot: { prompt }, workspaceDir: "/ws" }),
    ).resolves.toEqual({ status: "ran" });

    expect(agentCommand).toHaveBeenCalledTimes(1);
    const call = agentCommand.mock.calls[0]?.[0];
    expect(call).toEqual(
      expect.objectContaining({
        deliver: false,
        sessionKey: resolveMainSessionKey({}),
      }),
    );
    expect(call?.message).toContain("Boot instructions:");
    expect(call?.message).toContain(prompt);
    expect(call?.message).toContain("NO_REPLY");
  });

  it("runs agent command with file-based prompt", async () => {
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "boot-test-"));
    try {
      const content = "Run diagnostics on startup.";
      await fs.writeFile(path.join(workspaceDir, "boot-instructions.md"), content, "utf-8");
      agentCommand.mockResolvedValue(undefined);
      await expect(
        runBootOnce({
          cfg: {},
          deps: makeDeps(),
          boot: { file: "boot-instructions.md" },
          workspaceDir,
        }),
      ).resolves.toEqual({ status: "ran" });

      expect(agentCommand).toHaveBeenCalledTimes(1);
      const call = agentCommand.mock.calls[0]?.[0];
      expect(call?.message).toContain(content);
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true });
    }
  });

  it("returns failed when agent command throws", async () => {
    agentCommand.mockRejectedValue(new Error("boom"));
    await expect(
      runBootOnce({
        cfg: {},
        deps: makeDeps(),
        boot: { prompt: "Wake up and report." },
        workspaceDir: "/ws",
      }),
    ).resolves.toEqual({
      status: "failed",
      reason: expect.stringContaining("agent run failed: boom"),
    });
    expect(agentCommand).toHaveBeenCalledTimes(1);
  });

  it("uses per-agent session key when agentId is provided", async () => {
    agentCommand.mockResolvedValue(undefined);
    const cfg = {};
    const agentId = "ops";
    await expect(
      runBootOnce({
        cfg,
        deps: makeDeps(),
        boot: { prompt: "Check status." },
        workspaceDir: "/ws",
        agentId,
      }),
    ).resolves.toEqual({ status: "ran" });

    expect(agentCommand).toHaveBeenCalledTimes(1);
    const perAgentCall = agentCommand.mock.calls[0]?.[0];
    expect(perAgentCall?.sessionKey).toBe(resolveAgentMainSessionKey({ cfg, agentId }));
  });

  it("generates new session ID when no existing session exists", async () => {
    agentCommand.mockResolvedValue(undefined);
    await expect(
      runBootOnce({
        cfg: {},
        deps: makeDeps(),
        boot: { prompt: "Say hello when you wake up." },
        workspaceDir: "/ws",
      }),
    ).resolves.toEqual({ status: "ran" });

    expect(agentCommand).toHaveBeenCalledTimes(1);
    const call = agentCommand.mock.calls[0]?.[0];
    expect(call?.sessionId).toMatch(/^boot-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-[0-9a-f]{8}$/);
  });

  it("uses a fresh boot session ID even when main session mapping already exists", async () => {
    const cfg = {};
    const { sessionKey, storePath } = resolveMainStore(cfg);
    const existingSessionId = "main-session-abc123";

    await saveSessionStore(storePath, {
      [sessionKey]: {
        sessionId: existingSessionId,
        updatedAt: Date.now(),
      },
    });

    agentCommand.mockResolvedValue(undefined);
    await expect(
      runBootOnce({
        cfg,
        deps: makeDeps(),
        boot: { prompt: "Say hello when you wake up." },
        workspaceDir: "/ws",
      }),
    ).resolves.toEqual({ status: "ran" });

    expect(agentCommand).toHaveBeenCalledTimes(1);
    const call = agentCommand.mock.calls[0]?.[0];

    expect(call?.sessionId).not.toBe(existingSessionId);
    expect(call?.sessionId).toMatch(/^boot-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}-[0-9a-f]{8}$/);
    expect(call?.sessionKey).toBe(sessionKey);
  });

  it("restores the original main session mapping after the boot run", async () => {
    const cfg = {};
    const { sessionKey, storePath } = resolveMainStore(cfg);
    const existingSessionId = "main-session-xyz789";

    await saveSessionStore(storePath, {
      [sessionKey]: {
        sessionId: existingSessionId,
        updatedAt: Date.now() - 60_000,
      },
    });

    mockAgentUpdatesMainSession(storePath, sessionKey);
    await expect(
      runBootOnce({
        cfg,
        deps: makeDeps(),
        boot: { prompt: "Check if the system is healthy." },
        workspaceDir: "/ws",
      }),
    ).resolves.toEqual({ status: "ran" });

    expectMainSessionRestored({ storePath, sessionKey, expectedSessionId: existingSessionId });
  });

  it("removes a boot-created main-session mapping when none existed before", async () => {
    const cfg = {};
    const { sessionKey, storePath } = resolveMainStore(cfg);

    mockAgentUpdatesMainSession(storePath, sessionKey);

    await expect(
      runBootOnce({
        cfg,
        deps: makeDeps(),
        boot: { prompt: "health check" },
        workspaceDir: "/ws",
      }),
    ).resolves.toEqual({ status: "ran" });

    expectMainSessionRestored({ storePath, sessionKey });
  });
});
