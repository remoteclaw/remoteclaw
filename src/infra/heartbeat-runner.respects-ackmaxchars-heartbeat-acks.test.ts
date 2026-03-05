import { describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { runHeartbeatOnce, type HeartbeatDeps } from "./heartbeat-runner.js";
import { installHeartbeatRunnerTestRuntime } from "./heartbeat-runner.test-harness.js";
import { seedMainSessionStore, withTempHeartbeatSandbox } from "./heartbeat-runner.test-utils.js";

// Avoid pulling optional runtime deps during isolated runs.
vi.mock("jiti", () => ({ createJiti: () => () => ({}) }));

installHeartbeatRunnerTestRuntime();

describe("runHeartbeatOnce heartbeat_report handling", () => {
  const WHATSAPP_GROUP = "120363140186826074@g.us";

  function createHeartbeatConfig(params: {
    tmpDir: string;
    storePath: string;
    heartbeat: Record<string, unknown>;
    channels: Record<string, unknown>;
    messages?: Record<string, unknown>;
  }): RemoteClawConfig {
    return {
      agents: {
        defaults: {
          workspace: params.tmpDir,
          heartbeat: params.heartbeat as never,
        },
      },
      channels: params.channels as never,
      ...(params.messages ? { messages: params.messages as never } : {}),
      session: { store: params.storePath },
    };
  }

  function makeWhatsAppDeps(
    params: {
      sendWhatsApp?: ReturnType<typeof vi.fn>;
      getQueueSize?: () => number;
      nowMs?: () => number;
      webAuthExists?: () => Promise<boolean>;
      hasActiveWebListener?: () => boolean;
    } = {},
  ) {
    return {
      ...(params.sendWhatsApp
        ? { sendWhatsApp: params.sendWhatsApp as unknown as HeartbeatDeps["sendWhatsApp"] }
        : {}),
      getQueueSize: params.getQueueSize ?? (() => 0),
      nowMs: params.nowMs ?? (() => 0),
      webAuthExists: params.webAuthExists ?? (async () => true),
      hasActiveWebListener: params.hasActiveWebListener ?? (() => true),
    } satisfies HeartbeatDeps;
  }

  function createMessageSendSpy(extra: Record<string, unknown> = {}) {
    return vi.fn().mockResolvedValue({
      messageId: "m1",
      toJid: "jid",
      ...extra,
    });
  }

  function createWhatsAppHeartbeatConfig(params: {
    tmpDir: string;
    storePath: string;
    heartbeat?: Record<string, unknown>;
    visibility?: Record<string, unknown>;
  }): RemoteClawConfig {
    return createHeartbeatConfig({
      tmpDir: params.tmpDir,
      storePath: params.storePath,
      heartbeat: {
        every: "5m",
        target: "whatsapp",
        ...params.heartbeat,
      },
      channels: {
        whatsapp: {
          allowFrom: ["*"],
          ...(params.visibility ? { heartbeat: params.visibility } : {}),
        },
      },
    });
  }

  it("skips delivery when heartbeat_report says anythingDone=false", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createWhatsAppHeartbeatConfig({
        tmpDir,
        storePath,
      });

      await seedMainSessionStore(storePath, cfg, {
        lastChannel: "whatsapp",
        lastProvider: "whatsapp",
        lastTo: WHATSAPP_GROUP,
      });

      replySpy.mockResolvedValue({
        text: "All clear",
        heartbeatReport: { anythingDone: false, summary: "All clear" },
      });
      const sendWhatsApp = createMessageSendSpy();

      await runHeartbeatOnce({
        cfg,
        deps: makeWhatsAppDeps({ sendWhatsApp }),
      });

      // Should not deliver alert — anythingDone is false
      expect(sendWhatsApp).not.toHaveBeenCalled();
    });
  });

  it("delivers when heartbeat_report says anythingDone=true", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createWhatsAppHeartbeatConfig({
        tmpDir,
        storePath,
      });

      await seedMainSessionStore(storePath, cfg, {
        lastChannel: "whatsapp",
        lastProvider: "whatsapp",
        lastTo: WHATSAPP_GROUP,
      });

      replySpy.mockResolvedValue({
        text: "Cleaned up disk",
        heartbeatReport: { anythingDone: true, summary: "Cleaned up disk" },
      });
      const sendWhatsApp = createMessageSendSpy();

      await runHeartbeatOnce({
        cfg,
        deps: makeWhatsAppDeps({ sendWhatsApp }),
      });

      expect(sendWhatsApp).toHaveBeenCalled();
    });
  });

  it("delivers summary text from heartbeat_report when showOk is true and anythingDone is false", async () => {
    await withTempHeartbeatSandbox(async ({ tmpDir, storePath, replySpy }) => {
      const cfg = createWhatsAppHeartbeatConfig({
        tmpDir,
        storePath,
        visibility: { showOk: true },
      });

      await seedMainSessionStore(storePath, cfg, {
        lastChannel: "whatsapp",
        lastProvider: "whatsapp",
        lastTo: WHATSAPP_GROUP,
      });

      replySpy.mockResolvedValue({
        text: "All systems nominal",
        heartbeatReport: { anythingDone: false, summary: "All systems nominal" },
      });
      const sendWhatsApp = createMessageSendSpy();

      await runHeartbeatOnce({
        cfg,
        deps: makeWhatsAppDeps({ sendWhatsApp }),
      });

      // showOk=true, so the summary should be delivered
      expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    });
  });
});
