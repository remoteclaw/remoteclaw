import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importCommand } from "./import.js";

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-import-test-"));
}

function createRuntime() {
  return {
    log: vi.fn(),
    error: vi.fn(),
    exit: vi.fn(),
  };
}

describe("importCommand", () => {
  let sourceDir: string;
  let destDir: string;
  let runtime: ReturnType<typeof createRuntime>;

  beforeEach(() => {
    sourceDir = createTempDir();
    destDir = createTempDir();
    runtime = createRuntime();
    // Point canonical config path to our temp dest
    vi.stubEnv("REMOTECLAW_CONFIG_PATH", path.join(destDir, "remoteclaw.json"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    fs.rmSync(sourceDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
  });

  function writeSourceConfig(config: Record<string, unknown>, filename = "openclaw.json") {
    fs.writeFileSync(path.join(sourceDir, filename), JSON.stringify(config, null, 2), "utf-8");
  }

  function destConfigPath(): string {
    return path.join(destDir, "remoteclaw.json");
  }

  function readDestConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(destConfigPath(), "utf-8"));
  }

  it("imports openclaw.json and writes remoteclaw.json", async () => {
    writeSourceConfig({
      channels: { telegram: { enabled: true } },
      agents: { list: [{ id: "main" }] },
    });

    await importCommand(sourceDir, {}, runtime);

    expect(runtime.exit).not.toHaveBeenCalled();
    expect(runtime.error).not.toHaveBeenCalled();
    expect(fs.existsSync(destConfigPath())).toBe(true);

    const config = readDestConfig();
    expect(config).toHaveProperty("channels");
    expect(config).toHaveProperty("agents");
  });

  it("prefers openclaw.json over remoteclaw.json in source dir", async () => {
    writeSourceConfig({ channels: { telegram: {} } }, "openclaw.json");
    writeSourceConfig({ channels: { discord: {} } }, "remoteclaw.json");

    await importCommand(sourceDir, {}, runtime);

    const config = readDestConfig();
    expect((config.channels as Record<string, unknown>).telegram).toBeDefined();
    expect((config.channels as Record<string, unknown>).discord).toBeUndefined();
  });

  it("falls back to remoteclaw.json when openclaw.json is absent", async () => {
    writeSourceConfig({ channels: { discord: {} } }, "remoteclaw.json");

    await importCommand(sourceDir, {}, runtime);

    const config = readDestConfig();
    expect((config.channels as Record<string, unknown>).discord).toBeDefined();
  });

  it("errors when no source config found", async () => {
    await importCommand(sourceDir, {}, runtime);

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("No config file found"));
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("errors by default when destination already exists", async () => {
    writeSourceConfig({ channels: {} });
    fs.writeFileSync(destConfigPath(), "{}", "utf-8");

    await importCommand(sourceDir, {}, runtime);

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    expect(runtime.exit).toHaveBeenCalledWith(1);
  });

  it("overwrites destination with --overwrite", async () => {
    writeSourceConfig({ channels: { telegram: {} } });
    fs.writeFileSync(destConfigPath(), JSON.stringify({ agents: {} }), "utf-8");

    await importCommand(sourceDir, { overwrite: true }, runtime);

    expect(runtime.exit).not.toHaveBeenCalled();
    const config = readDestConfig();
    expect(config).toHaveProperty("channels");
    expect(config).not.toHaveProperty("agents");
  });

  it("merges with existing config using --merge (existing wins)", async () => {
    writeSourceConfig({
      channels: { telegram: {} },
      gateway: { port: 18789 },
    });
    fs.writeFileSync(destConfigPath(), JSON.stringify({ gateway: { port: 9999 } }), "utf-8");

    await importCommand(sourceDir, { merge: true }, runtime);

    expect(runtime.exit).not.toHaveBeenCalled();
    const config = readDestConfig();
    expect(config).toHaveProperty("channels");
    expect((config.gateway as Record<string, unknown>).port).toBe(9999);
  });

  it("does not write in dry-run mode", async () => {
    writeSourceConfig({ channels: { telegram: {} } });

    await importCommand(sourceDir, { dryRun: true }, runtime);

    expect(runtime.exit).not.toHaveBeenCalled();
    expect(fs.existsSync(destConfigPath())).toBe(false);

    // Verify report was printed
    const output = runtime.log.mock.calls.map(String).join("\n");
    expect(output).toContain("[dry run]");
    expect(output).toContain("Importing from:");
  });

  it("drops skills, plugins, models, wizard, update with reasons", async () => {
    writeSourceConfig({
      channels: {},
      skills: { load: {} },
      plugins: { enabled: true },
      models: { defaults: {} },
      wizard: { lastRunAt: "2024" },
      update: { channel: "stable" },
    });

    await importCommand(sourceDir, {}, runtime);

    const config = readDestConfig();
    expect(config).not.toHaveProperty("skills");
    expect(config).not.toHaveProperty("plugins");
    expect(config).not.toHaveProperty("models");
    expect(config).not.toHaveProperty("wizard");
    expect(config).not.toHaveProperty("update");

    const output = runtime.log.mock.calls.map(String).join("\n");
    expect(output).toContain("skills");
    expect(output).toContain("plugins");
    expect(output).toContain("models");
    expect(output).toContain("wizard");
    expect(output).toContain("update");
  });

  it("never modifies the source directory", async () => {
    const sourceFile = path.join(sourceDir, "openclaw.json");
    writeSourceConfig({ channels: { telegram: {} } });
    const beforeMtime = fs.statSync(sourceFile).mtimeMs;

    await importCommand(sourceDir, {}, runtime);

    const afterMtime = fs.statSync(sourceFile).mtimeMs;
    expect(afterMtime).toBe(beforeMtime);

    // Verify no new files were created in source dir
    const sourceFiles = fs.readdirSync(sourceDir);
    expect(sourceFiles).toEqual(["openclaw.json"]);
  });

  it("includes session migration note in output", async () => {
    writeSourceConfig({ channels: {} });

    await importCommand(sourceDir, {}, runtime);

    const output = runtime.log.mock.calls.map(String).join("\n");
    expect(output).toContain("Sessions not migrated");
  });

  it("prints import report with section summaries", async () => {
    writeSourceConfig({
      channels: { telegram: {}, slack: {}, discord: {} },
      agents: { list: [{ id: "main" }, { id: "second" }] },
      gateway: { port: 18789, auth: { token: "secret" } },
    });

    await importCommand(sourceDir, {}, runtime);

    const output = runtime.log.mock.calls.map(String).join("\n");
    expect(output).toContain("3 adapters");
    expect(output).toContain("2 agents");
    expect(output).toContain("port 18789");
    expect(output).toContain("token ******");
    expect(output).not.toContain("secret");
  });

  it("creates destination directory if it does not exist", async () => {
    const nestedDir = path.join(destDir, "nested", "dir");
    vi.stubEnv("REMOTECLAW_CONFIG_PATH", path.join(nestedDir, "remoteclaw.json"));
    writeSourceConfig({ channels: {} });

    await importCommand(sourceDir, {}, runtime);

    expect(runtime.exit).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(nestedDir, "remoteclaw.json"))).toBe(true);
  });

  it("prints env var reminder when OPENCLAW_* vars are set", async () => {
    writeSourceConfig({ channels: {} });
    const env = { OPENCLAW_STATE_DIR: "/old/dir", OPENCLAW_GATEWAY_PORT: "8080" };

    await importCommand(sourceDir, {}, runtime, env);

    const output = runtime.log.mock.calls.map(String).join("\n");
    expect(output).toContain("Environment variables:");
    expect(output).toContain("OPENCLAW_STATE_DIR is set");
    expect(output).toContain("REMOTECLAW_STATE_DIR");
    expect(output).toContain("OPENCLAW_GATEWAY_PORT is set");
    expect(output).toContain("REMOTECLAW_GATEWAY_PORT");
  });

  it("omits env var section when no OPENCLAW_* vars are set", async () => {
    writeSourceConfig({ channels: {} });
    const env = { HOME: os.homedir(), PATH: "/usr/bin" };

    await importCommand(sourceDir, {}, runtime, env);

    const output = runtime.log.mock.calls.map(String).join("\n");
    expect(output).not.toContain("Environment variables:");
  });

  it("does not trigger reminders for CLAWDBOT_* vars", async () => {
    writeSourceConfig({ channels: {} });
    const env = { CLAWDBOT_STATE_DIR: "/old/clawdbot" };

    await importCommand(sourceDir, {}, runtime, env);

    const output = runtime.log.mock.calls.map(String).join("\n");
    expect(output).not.toContain("Environment variables:");
    expect(output).not.toContain("CLAWDBOT_STATE_DIR");
  });

  it("shows env var reminders in dry-run mode", async () => {
    writeSourceConfig({ channels: {} });
    const env = { OPENCLAW_STATE_DIR: "/old/dir" };

    await importCommand(sourceDir, { dryRun: true }, runtime, env);

    const output = runtime.log.mock.calls.map(String).join("\n");
    expect(output).toContain("[dry run]");
    expect(output).toContain("Environment variables:");
    expect(output).toContain("OPENCLAW_STATE_DIR is set");
    expect(output).toContain("REMOTECLAW_STATE_DIR");
  });
});
