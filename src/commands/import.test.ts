import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import {
  detectOpenClawInstallation,
  importCommand,
  resolveTargetFilename,
  transformConfigContent,
} from "./import.js";
import { createTestRuntime, type TestRuntime } from "./test-runtime-config-helpers.js";

describe("transformConfigContent", () => {
  it("replaces ${OPENCLAW_*} template references with ${REMOTECLAW_*}", () => {
    const input = `{
  "env": {
    "vars": {
      "token": "\${OPENCLAW_GATEWAY_TOKEN}",
      "password": "\${OPENCLAW_GATEWAY_PASSWORD}"
    }
  }
}`;
    const { content, renames } = transformConfigContent(input);
    expect(content).toContain("${REMOTECLAW_GATEWAY_TOKEN}");
    expect(content).toContain("${REMOTECLAW_GATEWAY_PASSWORD}");
    expect(content).not.toContain("${OPENCLAW_");
    expect(renames).toContain("${OPENCLAW_GATEWAY_TOKEN} -> ${REMOTECLAW_GATEWAY_TOKEN}");
    expect(renames).toContain("${OPENCLAW_GATEWAY_PASSWORD} -> ${REMOTECLAW_GATEWAY_PASSWORD}");
  });

  it("replaces bare OPENCLAW_* string values in JSON", () => {
    const input = `{
  "envVar": "OPENCLAW_STATE_DIR",
  "other": "OPENCLAW_CONFIG_PATH"
}`;
    const { content, renames } = transformConfigContent(input);
    expect(content).toContain('"REMOTECLAW_STATE_DIR"');
    expect(content).toContain('"REMOTECLAW_CONFIG_PATH"');
    expect(renames).toContain("OPENCLAW_STATE_DIR -> REMOTECLAW_STATE_DIR");
    expect(renames).toContain("OPENCLAW_CONFIG_PATH -> REMOTECLAW_CONFIG_PATH");
  });

  it("replaces .openclaw path references with .remoteclaw", () => {
    const input = `{
  "workspace": "/home/user/.openclaw/workspace",
  "sessions": "/home/user/.openclaw/sessions"
}`;
    const { content } = transformConfigContent(input);
    expect(content).toContain("/.remoteclaw/workspace");
    expect(content).toContain("/.remoteclaw/sessions");
    expect(content).not.toContain("/.openclaw/");
  });

  it("returns empty renames when no OPENCLAW_ references exist", () => {
    const input = `{
  "gateway": {
    "port": 18789
  }
}`;
    const { content, renames } = transformConfigContent(input);
    expect(content).toBe(input);
    expect(renames).toHaveLength(0);
  });

  it("deduplicates renames", () => {
    const input = `{
  "a": "\${OPENCLAW_TOKEN}",
  "b": "\${OPENCLAW_TOKEN}"
}`;
    const { renames } = transformConfigContent(input);
    const tokenRenames = renames.filter((r) => r.includes("OPENCLAW_TOKEN"));
    expect(tokenRenames).toHaveLength(1);
  });

  it("does not modify non-string JSON content", () => {
    const input = `{
  "port": 18789,
  "enabled": true,
  "items": [1, 2, 3]
}`;
    const { content, renames } = transformConfigContent(input);
    expect(content).toBe(input);
    expect(renames).toHaveLength(0);
  });
});

describe("resolveTargetFilename", () => {
  it("renames openclaw.json to remoteclaw.json", () => {
    expect(resolveTargetFilename("openclaw.json")).toBe("remoteclaw.json");
  });

  it("keeps other filenames unchanged", () => {
    expect(resolveTargetFilename("sessions.json")).toBe("sessions.json");
    expect(resolveTargetFilename("config.json5")).toBe("config.json5");
    expect(resolveTargetFilename("data.bin")).toBe("data.bin");
  });
});

describe("detectOpenClawInstallation", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "import-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns path when .openclaw directory exists", async () => {
    await fsp.mkdir(path.join(tmpDir, ".openclaw"));
    expect(detectOpenClawInstallation(tmpDir)).toBe(path.join(tmpDir, ".openclaw"));
  });

  it("returns null when .openclaw does not exist", () => {
    expect(detectOpenClawInstallation(tmpDir)).toBeNull();
  });

  it("returns null when .openclaw is a file not a directory", async () => {
    await fsp.writeFile(path.join(tmpDir, ".openclaw"), "not a dir");
    expect(detectOpenClawInstallation(tmpDir)).toBeNull();
  });
});

describe("importCommand", () => {
  let tmpDir: string;
  let sourceDir: string;
  let targetDir: string;
  let runtime: TestRuntime;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "import-cmd-test-"));
    sourceDir = path.join(tmpDir, "source");
    targetDir = path.join(tmpDir, "target");
    await fsp.mkdir(sourceDir, { recursive: true });

    runtime = createTestRuntime();
    runtime.exit.mockImplementation((_code: number) => {
      throw new Error("exit");
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("copies files from source to target directory", async () => {
    await fsp.writeFile(path.join(sourceDir, "data.bin"), "binary data");
    await fsp.mkdir(path.join(sourceDir, "subdir"));
    await fsp.writeFile(path.join(sourceDir, "subdir", "nested.txt"), "nested");

    // Mock resolveNewStateDir to use our temp target
    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    const result = await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    expect(result.copiedFiles).toHaveLength(2);
    expect(fs.existsSync(path.join(targetDir, "data.bin"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "subdir", "nested.txt"))).toBe(true);
    expect(await fsp.readFile(path.join(targetDir, "data.bin"), "utf-8")).toBe("binary data");
  });

  it("transforms config files during copy", async () => {
    const configContent = `{
  "env": {
    "vars": {
      "token": "\${OPENCLAW_GATEWAY_TOKEN}"
    }
  },
  "workspace": "/home/user/.openclaw/workspace"
}`;
    await fsp.writeFile(path.join(sourceDir, "openclaw.json"), configContent);

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    const result = await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    // File should be renamed
    expect(fs.existsSync(path.join(targetDir, "remoteclaw.json"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "openclaw.json"))).toBe(false);

    // Content should be transformed
    const written = await fsp.readFile(path.join(targetDir, "remoteclaw.json"), "utf-8");
    expect(written).toContain("${REMOTECLAW_GATEWAY_TOKEN}");
    expect(written).toContain("/.remoteclaw/workspace");
    expect(written).not.toContain("OPENCLAW_");
    expect(written).not.toContain("/.openclaw/");

    expect(result.transformedFiles).toHaveLength(1);
    expect(result.envVarRenames.length).toBeGreaterThan(0);
  });

  it("dry-run does not write files", async () => {
    await fsp.writeFile(path.join(sourceDir, "config.json"), '{"key": "value"}');

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    const result = await importCommand(
      { sourcePath: sourceDir, dryRun: true },
      runtime as RuntimeEnv,
    );

    expect(result.copiedFiles).toHaveLength(1);
    expect(fs.existsSync(targetDir)).toBe(false);
  });

  it("exits with error when source path does not exist", async () => {
    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    await expect(
      importCommand({ sourcePath: path.join(tmpDir, "nonexistent") }, runtime as RuntimeEnv),
    ).rejects.toThrow("exit");

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("does not exist"));
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("exits with error when source path is not a directory", async () => {
    const filePath = path.join(tmpDir, "afile");
    await fsp.writeFile(filePath, "not a dir");

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    await expect(importCommand({ sourcePath: filePath }, runtime as RuntimeEnv)).rejects.toThrow(
      "exit",
    );

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("not a directory"));
  });

  it("warns and exits in non-interactive mode when target exists without --yes", async () => {
    await fsp.writeFile(path.join(sourceDir, "data.bin"), "data");
    await fsp.mkdir(targetDir, { recursive: true });

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    await expect(
      importCommand({ sourcePath: sourceDir, nonInteractive: true }, runtime as RuntimeEnv),
    ).rejects.toThrow("exit");

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("already exists"));
  });

  it("proceeds when target exists and --yes is provided", async () => {
    await fsp.writeFile(path.join(sourceDir, "data.bin"), "data");
    await fsp.mkdir(targetDir, { recursive: true });

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    const result = await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    expect(result.copiedFiles).toHaveLength(1);
    expect(fs.existsSync(path.join(targetDir, "data.bin"))).toBe(true);
  });

  it("handles nested directory structures with mixed file types", async () => {
    // Create a realistic OpenClaw directory structure
    await fsp.mkdir(path.join(sourceDir, "agents", "default", "sessions"), { recursive: true });
    await fsp.mkdir(path.join(sourceDir, "credentials"), { recursive: true });

    await fsp.writeFile(
      path.join(sourceDir, "openclaw.json"),
      '{"gateway": {"port": 18789}, "env": {"vars": {"token": "${OPENCLAW_GATEWAY_TOKEN}"}}}',
    );
    await fsp.writeFile(
      path.join(sourceDir, "agents", "default", "sessions", "sessions.json"),
      '{"sessions": []}',
    );
    await fsp.writeFile(
      path.join(sourceDir, "credentials", "oauth.json"),
      '{"token": "fake-token"}',
    );

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    const result = await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    expect(result.copiedFiles.length).toBeGreaterThanOrEqual(3);
    expect(fs.existsSync(path.join(targetDir, "remoteclaw.json"))).toBe(true);
    expect(
      fs.existsSync(path.join(targetDir, "agents", "default", "sessions", "sessions.json")),
    ).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "credentials", "oauth.json"))).toBe(true);

    // Verify main config was transformed
    const mainConfig = await fsp.readFile(path.join(targetDir, "remoteclaw.json"), "utf-8");
    expect(mainConfig).toContain("${REMOTECLAW_GATEWAY_TOKEN}");
  });
});
