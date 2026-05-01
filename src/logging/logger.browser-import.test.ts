import { afterEach, describe, expect, it, vi } from "vitest";

type LoggerModule = typeof import("./logger.js");

const originalGetBuiltinModule = (
  process as NodeJS.Process & { getBuiltinModule?: (id: string) => unknown }
).getBuiltinModule;

async function importBrowserSafeLogger(params?: {
  resolvePreferredRemoteClawTmpDir?: ReturnType<typeof vi.fn>;
}): Promise<{
  module: LoggerModule;
  resolvePreferredRemoteClawTmpDir: ReturnType<typeof vi.fn>;
}> {
  vi.resetModules();
  const resolvePreferredRemoteClawTmpDir =
    params?.resolvePreferredRemoteClawTmpDir ??
    vi.fn(() => {
      throw new Error("resolvePreferredRemoteClawTmpDir should not run during browser-safe import");
    });

  vi.doMock("../infra/tmp-remoteclaw-dir.js", async () => {
    const actual = await vi.importActual<typeof import("../infra/tmp-remoteclaw-dir.js")>(
      "../infra/tmp-remoteclaw-dir.js",
    );
    return {
      ...actual,
      resolvePreferredRemoteClawTmpDir,
    };
  });

  Object.defineProperty(process, "getBuiltinModule", {
    configurable: true,
    value: undefined,
  });

  const module = await import("./logger.js");
  return { module, resolvePreferredRemoteClawTmpDir };
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
    const { module, resolvePreferredRemoteClawTmpDir } = await importBrowserSafeLogger();

    expect(resolvePreferredRemoteClawTmpDir).not.toHaveBeenCalled();
    expect(module.DEFAULT_LOG_DIR).toBe("/tmp/remoteclaw");
    expect(module.DEFAULT_LOG_FILE).toBe("/tmp/remoteclaw/remoteclaw.log");
  });

  it("disables file logging when imported in a browser-like environment", async () => {
    const { module, resolvePreferredRemoteClawTmpDir } = await importBrowserSafeLogger();

    expect(module.getResolvedLoggerSettings()).toMatchObject({
      level: "silent",
      file: "/tmp/remoteclaw/remoteclaw.log",
    });
    expect(module.isFileLogLevelEnabled("info")).toBe(false);
    expect(() => module.getLogger().info("browser-safe")).not.toThrow();
    expect(resolvePreferredRemoteClawTmpDir).not.toHaveBeenCalled();
  });
});
