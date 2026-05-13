import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ensureDir,
  resolveConfigDir,
  resolveHomeDir,
  resolveUserPath,
  shortenHomeInString,
  shortenHomePath,
  sleep,
} from "./utils.js";

async function withTempDir<T>(
  prefix: string,
  run: (dir: string) => T | Promise<T>,
): Promise<Awaited<T>> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("ensureDir", () => {
  it("creates nested directory", async () => {
    await withTempDir("remoteclaw-test-", async (tmp) => {
      const target = path.join(tmp, "nested", "dir");
      await ensureDir(target);
      expect(fs.existsSync(target)).toBe(true);
    });
  });
});

describe("sleep", () => {
  it("resolves after delay using fake timers", async () => {
    vi.useFakeTimers();
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

describe("resolveConfigDir", () => {
  it("prefers ~/.remoteclaw when legacy dir is missing", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "remoteclaw-config-dir-"));
    try {
      const newDir = path.join(root, ".remoteclaw");
      await fs.promises.mkdir(newDir, { recursive: true });
      const resolved = resolveConfigDir({} as NodeJS.ProcessEnv, () => root);
      expect(resolved).toBe(newDir);
    } finally {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it("expands REMOTECLAW_STATE_DIR using the provided env", () => {
    const env = {
      HOME: "/tmp/remoteclaw-home",
      REMOTECLAW_STATE_DIR: "~/state",
    } as NodeJS.ProcessEnv;

    expect(resolveConfigDir(env)).toBe(path.resolve("/tmp/remoteclaw-home", "state"));
  });
});

describe("resolveHomeDir", () => {
  it("prefers REMOTECLAW_HOME over HOME", () => {
    vi.stubEnv("REMOTECLAW_HOME", "/srv/remoteclaw-home");
    vi.stubEnv("HOME", "/home/other");

    expect(resolveHomeDir()).toBe(path.resolve("/srv/remoteclaw-home"));

    vi.unstubAllEnvs();
  });
});

describe("shortenHomePath", () => {
  it("uses $REMOTECLAW_HOME prefix when REMOTECLAW_HOME is set", () => {
    vi.stubEnv("REMOTECLAW_HOME", "/srv/remoteclaw-home");
    vi.stubEnv("HOME", "/home/other");

    expect(
      shortenHomePath(`${path.resolve("/srv/remoteclaw-home")}/.remoteclaw/remoteclaw.json`),
    ).toBe("$REMOTECLAW_HOME/.remoteclaw/remoteclaw.json");

    vi.unstubAllEnvs();
  });
});

describe("shortenHomeInString", () => {
  it("uses $REMOTECLAW_HOME replacement when REMOTECLAW_HOME is set", () => {
    vi.stubEnv("REMOTECLAW_HOME", "/srv/remoteclaw-home");
    vi.stubEnv("HOME", "/home/other");

    expect(
      shortenHomeInString(
        `config: ${path.resolve("/srv/remoteclaw-home")}/.remoteclaw/remoteclaw.json`,
      ),
    ).toBe("config: $REMOTECLAW_HOME/.remoteclaw/remoteclaw.json");

    vi.unstubAllEnvs();
  });
});

describe("resolveUserPath", () => {
  it("expands ~ to home dir", () => {
    expect(resolveUserPath("~", {}, () => "/Users/thoffman")).toBe(path.resolve("/Users/thoffman"));
  });

  it("expands ~/ to home dir", () => {
    expect(resolveUserPath("~/remoteclaw", {}, () => "/Users/thoffman")).toBe(
      path.resolve("/Users/thoffman", "remoteclaw"),
    );
  });

  it("resolves relative paths", () => {
    expect(resolveUserPath("tmp/dir")).toBe(path.resolve("tmp/dir"));
  });

  it("prefers REMOTECLAW_HOME for tilde expansion", () => {
    vi.stubEnv("REMOTECLAW_HOME", "/srv/remoteclaw-home");
    vi.stubEnv("HOME", "/home/other");

    expect(resolveUserPath("~/remoteclaw")).toBe(
      path.resolve("/srv/remoteclaw-home", "remoteclaw"),
    );

    vi.unstubAllEnvs();
  });

  it("uses the provided env for tilde expansion", () => {
    const env = {
      HOME: "/tmp/remoteclaw-home",
      REMOTECLAW_HOME: "/srv/remoteclaw-home",
    } as NodeJS.ProcessEnv;

    expect(resolveUserPath("~/remoteclaw", env)).toBe(
      path.resolve("/srv/remoteclaw-home", "remoteclaw"),
    );
  });

  it("keeps blank paths blank", () => {
    expect(resolveUserPath("")).toBe("");
    expect(resolveUserPath("   ")).toBe("");
  });

  it("returns empty string for undefined/null input", () => {
    expect(resolveUserPath(undefined as unknown as string)).toBe("");
    expect(resolveUserPath(null as unknown as string)).toBe("");
  });
});
