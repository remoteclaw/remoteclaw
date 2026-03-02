import "./reply.directive.directive-behavior.e2e-mocks.js";
import { describe, expect, it } from "vitest";
import { loadSessionStore } from "../config/sessions.js";
import {
  installDirectiveBehaviorE2EHooks,
  makeWhatsAppDirectiveConfig,
  replyText,
  runAgent,
  sessionStorePath,
  withTempHome,
} from "./reply.directive.directive-behavior.e2e-harness.js";
import { getReplyFromConfig } from "./reply.js";

const COMMAND_MESSAGE_BASE = {
  From: "+1222",
  To: "+1222",
  CommandAuthorized: true,
} as const;

async function runCommand(
  home: string,
  body: string,
  options: { defaults?: Record<string, unknown>; extra?: Record<string, unknown> } = {},
) {
  const res = await getReplyFromConfig(
    { ...COMMAND_MESSAGE_BASE, Body: body },
    {},
    makeWhatsAppDirectiveConfig(
      home,
      {
        model: "anthropic/claude-opus-4-5",
        ...options.defaults,
      },
      options.extra ?? {},
    ),
  );
  return replyText(res);
}

async function runQueueDirective(home: string, body: string) {
  return runCommand(home, body);
}

describe("directive behavior", () => {
  installDirectiveBehaviorE2EHooks();

  it("reports current verbose level when no arguments are provided", async () => {
    await withTempHome(async (home) => {
      const verboseText = await runCommand(home, "/verbose", {
        defaults: { verboseDefault: "on" },
      });
      expect(verboseText).toContain("Current verbose level: on");
      expect(verboseText).toContain("Options: on, full, off.");

      expect(runAgent).not.toHaveBeenCalled();
    });
  });
  it("persists queue overrides and reset behavior", async () => {
    await withTempHome(async (home) => {
      const storePath = sessionStorePath(home);

      const interruptText = await runQueueDirective(home, "/queue interrupt");
      expect(interruptText).toMatch(/^⚙️ Queue mode set to interrupt\./);
      let store = loadSessionStore(storePath);
      let entry = Object.values(store)[0];
      expect(entry?.queueMode).toBe("interrupt");

      const collectText = await runQueueDirective(
        home,
        "/queue collect debounce:2s cap:5 drop:old",
      );

      expect(collectText).toMatch(/^⚙️ Queue mode set to collect\./);
      expect(collectText).toMatch(/Queue debounce set to 2000ms/);
      expect(collectText).toMatch(/Queue cap set to 5/);
      expect(collectText).toMatch(/Queue drop set to old/);
      store = loadSessionStore(storePath);
      entry = Object.values(store)[0];
      expect(entry?.queueMode).toBe("collect");
      expect(entry?.queueDebounceMs).toBe(2000);
      expect(entry?.queueCap).toBe(5);
      expect(entry?.queueDrop).toBe("old");

      const resetText = await runQueueDirective(home, "/queue reset");
      expect(resetText).toMatch(/^⚙️ Queue mode reset to default\./);
      store = loadSessionStore(storePath);
      entry = Object.values(store)[0];
      expect(entry?.queueMode).toBeUndefined();
      expect(entry?.queueDebounceMs).toBeUndefined();
      expect(entry?.queueCap).toBeUndefined();
      expect(entry?.queueDrop).toBeUndefined();
      expect(runAgent).not.toHaveBeenCalled();
    });
  });
});
