import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredOpenClawTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredOpenClawTmpDir: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const resolvePreferredOpenClawTmpDir =
    params?.resolvePreferredOpenClawTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredOpenClawTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-remoteclaw-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-remoteclaw-dir.js")>(
      "../infra/tmp-remoteclaw-dir.js",
    );
    return {
      ...actual,
      resolvePreferredOpenClawTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await import("./logger.js");
  return { module, resolvePreferredOpenClawTmpDir };
}

describe("logging/logger browser-safe import", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../infra/tmp-remoteclaw-dir.js");
    Object.defineProperty(process, "getBuiltinModule", {
      configurable: true,
      value: originalGetBuiltinModule,
    });
  });

  it("does not resolve the preferred temp dir at import time when node fs is unavailable", async () => {
    const { module, resolvePreferredOpenClawTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredOpenClawTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/remoteclaw");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/remoteclaw/remoteclaw.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredOpenClawTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/remoteclaw/remoteclaw.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredOpenClawTmpDir).not.toHaveBeenCalled();
  });
});
