import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { setLoggerOverride } from "../logging/logger.js";
import { loggingState } from "../logging/state.js";
import { stripAnsi } from "../terminal/ansi.js";
import { captureEnv } from "../test-utils/env.js";
import { hasConfiguredInternalHooks, resolveConfiguredInternalHookNames } from "./configured.js";
import {
  clearInternalHooks,
  getRegisteredEventKeys,
  triggerInternalHook,
  createInternalHookEvent,
} from "./internal-hooks.js";
import { loadInternalHooks } from "./loader.js";

describe("loader", () => {
  let fixtureRoot = "";
  let caseId = 0;
  let tmpDir: string;
  let envSnapshot: ReturnType<typeof captureEnv>;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-hooks-loader-"));
  });

  beforeEach(async () => {
    clearInternalHooks();
    // Create a temp directory for test modules
    tmpDir = path.join(fixtureRoot, `case-${caseId++}`);
    await fs.mkdir(tmpDir, { recursive: true });

    // Disable bundled hooks during tests by setting env var to non-existent directory
    envSnapshot = captureEnv(["REMOTECLAW_BUNDLED_HOOKS_DIR"]);
    process.env.REMOTECLAW_BUNDLED_HOOKS_DIR = "/nonexistent/bundled/hooks";
    setLoggerOverride({ level: "silent", consoleLevel: "error" });
    loggingState.rawConsole = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  async function writeHandlerModule(
    fileName: string,
    code = "export default async function() {}",
  ): Promise<string> {
    const handlerPath = path.join(tmpDir, fileName);
    await fs.writeFile(handlerPath, code, "utf-8");
    return handlerPath;
  }

  function createEnabledHooksConfig(
    handlers?: Array<{ event: string; module: string; export?: string }>,
  ): RemoteClawConfig {
    return {
      hooks: {
        internal: handlers ? { enabled: true, handlers } : { enabled: true },
      },
    };
  }

  afterEach(async () => {
    clearInternalHooks();
    loggingState.rawConsole = null;
    setLoggerOverride(null);
    envSnapshot.restore();
  });

  afterAll(async () => {
    if (!fixtureRoot) {
      return;
    }
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  });

  describe("loadInternalHooks", () => {
    it("detects configured internal hook surfaces", () => {
      expect(hasConfiguredInternalHooks({} satisfies RemoteClawConfig)).toBe(false);
      expect(
        hasConfiguredInternalHooks({
          hooks: { internal: { entries: { "session-memory": { enabled: true } } } },
        } satisfies RemoteClawConfig),
      ).toBe(true);
      expect(
        hasConfiguredInternalHooks({
          hooks: { internal: { entries: { "session-memory": { enabled: false } } } },
        } satisfies RemoteClawConfig),
      ).toBe(false);
      expect(
        hasConfiguredInternalHooks({
          hooks: { internal: { load: { extraDirs: ["/tmp/hooks"] } } },
        } satisfies RemoteClawConfig),
      ).toBe(true);
      expect(
        resolveConfiguredInternalHookNames({
          hooks: { internal: { entries: { "session-memory": { enabled: true } } } },
        } satisfies RemoteClawConfig),
      ).toEqual(new Set(["session-memory"]));
      expect(
        resolveConfiguredInternalHookNames({
          hooks: { internal: { enabled: true } },
        } satisfies RemoteClawConfig),
      ).toBeNull();
      expect(
        resolveConfiguredInternalHookNames({
          hooks: { internal: { installs: { pack: { source: "path" } } } },
        } satisfies RemoteClawConfig),
      ).toBeNull();
    });

    const createLegacyHandlerConfig = () =>
      createEnabledHooksConfig([
        {
          event: "command:new",
          module: "legacy-handler.js",
        },
      ]);

    const expectNoCommandHookRegistration = async (cfg: RemoteClawConfig) => {
      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(0);
      expect(getRegisteredEventKeys()).not.toContain("command:new");
    };

    it("should return 0 when hooks are not enabled", async () => {
      const cfg: RemoteClawConfig = {
        hooks: {
          internal: {
            enabled: false,
          },
        },
      };

      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(0);
    });

    it("should return 0 when hooks config is missing", async () => {
      const cfg: RemoteClawConfig = {};
      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(0);
    });

    it("loads only explicitly configured discovered hooks", async () => {
      const hooksDir = path.join(tmpDir, "managed-hooks");
      await writeDiscoveredHook({ sourceDir: hooksDir, hookName: "keep-hook" });
      await writeDiscoveredHook({ sourceDir: hooksDir, hookName: "skip-hook" });

      const count = await loadInternalHooks(
        {
          hooks: {
            internal: {
              entries: {
                "keep-hook": { enabled: true },
              },
            },
          },
        } satisfies RemoteClawConfig,
        tmpDir,
        { managedHooksDir: hooksDir, bundledHooksDir: "/nonexistent/bundled/hooks" },
      );

      expect(count).toBe(1);
      const event = createInternalHookEvent("command", "new", "test-session");
      await triggerInternalHook(event);
      expect(event.messages).toEqual(["keep-hook"]);
    });

    it("should load a handler from a module", async () => {
      // Create a test handler module
      const handlerCode = `
        export default async function(event) {
          // Test handler
        }
      `;
      const handlerPath = await writeHandlerModule("test-handler.js", handlerCode);
      const cfg = createEnabledHooksConfig([
        {
          event: "command:new",
          module: path.basename(handlerPath),
        },
      ]);

      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(1);

      const keys = getRegisteredEventKeys();
      expect(keys).toContain("command:new");
    });

    it("should load multiple handlers", async () => {
      // Create test handler modules
      const handler1Path = await writeHandlerModule("handler1.js");
      const handler2Path = await writeHandlerModule("handler2.js");

      const cfg = createEnabledHooksConfig([
        { event: "command:new", module: path.basename(handler1Path) },
        { event: "command:stop", module: path.basename(handler2Path) },
      ]);

      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(2);

      const keys = getRegisteredEventKeys();
      expect(keys).toContain("command:new");
      expect(keys).toContain("command:stop");
    });

    it("should support named exports", async () => {
      // Create a handler module with named export
      const handlerCode = `
        export const myHandler = async function(event) {
          // Named export handler
        }
      `;
      const handlerPath = await writeHandlerModule("named-export.js", handlerCode);

      const cfg = createEnabledHooksConfig([
        {
          event: "command:new",
          module: path.basename(handlerPath),
          export: "myHandler",
        },
      ]);

      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(1);
    });

    it("should handle module loading errors gracefully", async () => {
      const cfg = createEnabledHooksConfig([
        {
          event: "command:new",
          module: "missing-handler.js",
        },
      ]);

      // Should not throw and should return 0 (handler failed to load)
      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(0);
    });

    it("should handle non-function exports", async () => {
      // Create a module with a non-function export
      const handlerPath = await writeHandlerModule(
        "bad-export.js",
        'export default "not a function";',
      );

      const cfg = createEnabledHooksConfig([
        {
          event: "command:new",
          module: path.basename(handlerPath),
        },
      ]);

      // Should not throw and should return 0 (handler is not a function)
      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(0);
    });

    it("should handle relative paths", async () => {
      // Create a handler module
      const handlerPath = await writeHandlerModule("relative-handler.js");

      // Relative to workspaceDir (tmpDir)
      const relativePath = path.relative(tmpDir, handlerPath);

      const cfg = createEnabledHooksConfig([
        {
          event: "command:new",
          module: relativePath,
        },
      ]);

      const count = await loadInternalHooks(cfg, tmpDir);
      expect(count).toBe(1);
    });

    it("should actually call the loaded handler", async () => {
      // Create a handler that we can verify was called
      const handlerCode = `
        let callCount = 0;
        export default async function(event) {
          callCount++;
        }
        export function getCallCount() {
          return callCount;
        }
      `;
      const handlerPath = await writeHandlerModule("callable-handler.js", handlerCode);

      const cfg = createEnabledHooksConfig([
        {
          event: "command:new",
          module: path.basename(handlerPath),
        },
      ]);

      await loadInternalHooks(cfg, tmpDir);

      // Trigger the hook
      const event = createInternalHookEvent("command", "new", "test-session");
      await triggerInternalHook(event);

      // The handler should have been called, but we can't directly verify
      // the call count from this context without more complex test infrastructure
      // This test mainly verifies that loading and triggering doesn't crash
      expect(getRegisteredEventKeys()).toContain("command:new");
    });

    it("rejects directory hook handlers that escape hook dir via symlink", async () => {
      const outsideHandlerPath = path.join(fixtureRoot, `outside-handler-${caseId}.js`);
      await fs.writeFile(outsideHandlerPath, "export default async function() {}", "utf-8");

      const hookDir = path.join(tmpDir, "hooks", "symlink-hook");
      await fs.mkdir(hookDir, { recursive: true });
      await fs.writeFile(
        path.join(hookDir, "HOOK.md"),
        [
          "---",
          "name: symlink-hook",
          "description: symlink test",
          'metadata: {"remoteclaw":{"events":["command:new"]}}',
          "---",
          "",
          "# Symlink Hook",
        ].join("\n"),
        "utf-8",
      );
      try {
        await fs.symlink(outsideHandlerPath, path.join(hookDir, "handler.js"));
      } catch {
        return;
      }

      await expectNoCommandHookRegistration(createEnabledHooksConfig());
    });

    it("rejects legacy handler modules that escape workspace via symlink", async () => {
      const outsideHandlerPath = path.join(fixtureRoot, `outside-legacy-${caseId}.js`);
      await fs.writeFile(outsideHandlerPath, "export default async function() {}", "utf-8");

      const linkedHandlerPath = path.join(tmpDir, "legacy-handler.js");
      try {
        await fs.symlink(outsideHandlerPath, linkedHandlerPath);
      } catch {
        return;
      }

      await expectNoCommandHookRegistration(createLegacyHandlerConfig());
    });

    it("rejects directory hook handlers that escape hook dir via hardlink", async () => {
      if (process.platform === "win32") {
        return;
      }
      const outsideHandlerPath = path.join(fixtureRoot, `outside-handler-hardlink-${caseId}.js`);
      await fs.writeFile(outsideHandlerPath, "export default async function() {}", "utf-8");

      const hookDir = path.join(tmpDir, "hooks", "hardlink-hook");
      await fs.mkdir(hookDir, { recursive: true });
      await fs.writeFile(
        path.join(hookDir, "HOOK.md"),
        [
          "---",
          "name: hardlink-hook",
          "description: hardlink test",
          'metadata: {"remoteclaw":{"events":["command:new"]}}',
          "---",
          "",
          "# Hardlink Hook",
        ].join("\n"),
        "utf-8",
      );
      try {
        await fs.link(outsideHandlerPath, path.join(hookDir, "handler.js"));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EXDEV") {
          return;
        }
        throw err;
      }

      await expectNoCommandHookRegistration(createEnabledHooksConfig());
    });

    it("rejects legacy handler modules that escape workspace via hardlink", async () => {
      if (process.platform === "win32") {
        return;
      }
      const outsideHandlerPath = path.join(fixtureRoot, `outside-legacy-hardlink-${caseId}.js`);
      await fs.writeFile(outsideHandlerPath, "export default async function() {}", "utf-8");

      const linkedHandlerPath = path.join(tmpDir, "legacy-handler.js");
      try {
        await fs.link(outsideHandlerPath, linkedHandlerPath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EXDEV") {
          return;
        }
        throw err;
      }

      await expectNoCommandHookRegistration(createLegacyHandlerConfig());
    });

    it("sanitizes control characters in loader error logs", async () => {
      const error = loggingState.rawConsole?.error;
      expect(error).toBeTypeOf("function");

      const cfg = createEnabledHooksConfig([
        {
          event: "command:new",
          module: `${tmpDir}\u001b[31m\nforged-log`,
        },
      ]);

      await expectNoCommandHookRegistration(cfg);

      const messages = stripAnsi(
        (error as ReturnType<typeof vi.fn>).mock.calls
          .map((call) => String(call[0] ?? ""))
          .join("\n"),
      );
      expect(messages).toContain("forged-log");
      expect(messages).not.toContain("\u001b[31m");
      expect(messages).not.toContain("\nforged-log");
    });
  });
});
