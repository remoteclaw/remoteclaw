import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeEnv } from "../runtime.js";
import {
  clearWizardSection,
  detectOpenClawInstallation,
  discoverSourceAuthProfileIds,
  importCommand,
  materializeAuthDefaults,
  materializeWorkspaceDefaults,
  resolveTargetFilename,
  stripUnrecognizedConfigKeys,
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

describe("materializeWorkspaceDefaults", () => {
  it("sets workspace on default agent when missing", () => {
    const input = JSON.stringify({
      agents: { list: [{ id: "main" }] },
    });
    const result = JSON.parse(materializeWorkspaceDefaults(input));
    expect(result.agents.list[0].workspace).toBe("~/.remoteclaw/workspace");
  });

  it("sets workspace on non-default agent using id suffix", () => {
    const input = JSON.stringify({
      agents: {
        list: [{ id: "main", default: true, workspace: "~/ws" }, { id: "helper" }],
      },
    });
    const result = JSON.parse(materializeWorkspaceDefaults(input));
    expect(result.agents.list[0].workspace).toBe("~/ws");
    expect(result.agents.list[1].workspace).toBe("~/.remoteclaw/workspace-helper");
  });

  it("uses agents.defaults.workspace as fallback", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { workspace: "~/custom-ws", model: "x" },
        list: [{ id: "main" }, { id: "helper" }],
      },
    });
    const result = JSON.parse(materializeWorkspaceDefaults(input));
    expect(result.agents.list[0].workspace).toBe("~/custom-ws");
    expect(result.agents.list[1].workspace).toBe("~/custom-ws");
  });

  it("removes agents.defaults.workspace after consuming", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { workspace: "~/custom-ws", model: "x" },
        list: [{ id: "main" }],
      },
    });
    const result = JSON.parse(materializeWorkspaceDefaults(input));
    expect(result.agents.defaults.workspace).toBeUndefined();
    expect(result.agents.defaults.model).toBe("x");
  });

  it("removes agents.defaults entirely when workspace was the only key", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { workspace: "~/custom-ws" },
        list: [{ id: "main" }],
      },
    });
    const result = JSON.parse(materializeWorkspaceDefaults(input));
    expect(result.agents.defaults).toBeUndefined();
  });

  it("creates default agent when agents.list is empty but config has substantive content", () => {
    const input = JSON.stringify({
      gateway: { port: 18789 },
      channels: { whatsapp: {} },
    });
    const result = JSON.parse(materializeWorkspaceDefaults(input));
    expect(result.agents.list).toHaveLength(1);
    expect(result.agents.list[0].id).toBe("main");
    expect(result.agents.list[0].workspace).toBe("~/.remoteclaw/workspace");
  });

  it("creates default agent when agents key is missing but config has substantive content", () => {
    const input = JSON.stringify({
      plugins: { entries: {} },
    });
    const result = JSON.parse(materializeWorkspaceDefaults(input));
    expect(result.agents.list[0].id).toBe("main");
    expect(result.agents.list[0].workspace).toBe("~/.remoteclaw/workspace");
  });

  it("does not create agent entry for non-substantive config", () => {
    const input = JSON.stringify({
      env: { vars: { FOO: "bar" } },
    });
    const output = materializeWorkspaceDefaults(input);
    expect(output).toBe(input);
  });

  it("preserves existing workspace values", () => {
    const input = JSON.stringify({
      agents: {
        list: [{ id: "main", workspace: "~/my-workspace" }],
      },
    });
    const output = materializeWorkspaceDefaults(input);
    // No mutation needed — return original
    expect(output).toBe(input);
  });

  it("returns non-JSON content unchanged", () => {
    const input = "not valid json {{{";
    expect(materializeWorkspaceDefaults(input)).toBe(input);
  });

  it("handles sole agent without explicit default flag as default", () => {
    const input = JSON.stringify({
      agents: { list: [{ id: "worker" }] },
    });
    const result = JSON.parse(materializeWorkspaceDefaults(input));
    expect(result.agents.list[0].workspace).toBe("~/.remoteclaw/workspace");
  });
});

describe("stripUnrecognizedConfigKeys", () => {
  it("strips unknown top-level keys", () => {
    const input = JSON.stringify({
      gateway: { port: 18789 },
      deadTopLevel: true,
    });
    const result = JSON.parse(stripUnrecognizedConfigKeys(input));
    expect(result.gateway.port).toBe(18789);
    expect(result.deadTopLevel).toBeUndefined();
  });

  it("strips unknown keys from agents.defaults", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { compaction: { mode: "default" }, workspace: "~/ws" },
        list: [{ id: "main" }],
      },
    });
    const result = JSON.parse(stripUnrecognizedConfigKeys(input));
    expect(result.agents.defaults.workspace).toBe("~/ws");
    expect(result.agents.defaults.compaction).toBeUndefined();
  });

  it("strips unknown nested keys from agents.defaults.heartbeat", () => {
    const input = JSON.stringify({
      agents: {
        defaults: {
          heartbeat: { every: "30m", includeReasoning: true },
        },
        list: [{ id: "main" }],
      },
    });
    const result = JSON.parse(stripUnrecognizedConfigKeys(input));
    expect(result.agents.defaults.heartbeat.every).toBe("30m");
    expect(result.agents.defaults.heartbeat.includeReasoning).toBeUndefined();
  });

  it("strips unknown nested keys from agents.defaults.subagents", () => {
    const input = JSON.stringify({
      agents: {
        defaults: {
          subagents: { maxConcurrent: 2, thinking: "high" },
        },
        list: [{ id: "main" }],
      },
    });
    const result = JSON.parse(stripUnrecognizedConfigKeys(input));
    expect(result.agents.defaults.subagents.maxConcurrent).toBe(2);
    expect(result.agents.defaults.subagents.thinking).toBeUndefined();
  });

  it("strips unknown keys from nested gateway sub-objects", () => {
    const input = JSON.stringify({
      gateway: {
        port: 18789,
        auth: { mode: "token", legacyField: true },
      },
    });
    const result = JSON.parse(stripUnrecognizedConfigKeys(input));
    expect(result.gateway.auth.mode).toBe("token");
    expect(result.gateway.auth.legacyField).toBeUndefined();
  });

  it("returns content unchanged when all keys are recognized", () => {
    const input = JSON.stringify({
      gateway: { port: 18789 },
      agents: {
        defaults: { workspace: "~/ws", timeoutSeconds: 60 },
        list: [{ id: "main" }],
      },
    });
    expect(stripUnrecognizedConfigKeys(input)).toBe(input);
  });

  it("preserves dynamic keys in catchall objects like broadcast", () => {
    const input = JSON.stringify({
      broadcast: {
        strategy: "parallel",
        "whatsapp-main": ["main", "helper"],
        "telegram-ops": ["ops"],
      },
    });
    const result = JSON.parse(stripUnrecognizedConfigKeys(input));
    expect(result.broadcast.strategy).toBe("parallel");
    expect(result.broadcast["whatsapp-main"]).toEqual(["main", "helper"]);
    expect(result.broadcast["telegram-ops"]).toEqual(["ops"]);
  });

  it("preserves dynamic keys in env catchall", () => {
    const input = JSON.stringify({
      env: {
        vars: { FOO: "bar" },
        CUSTOM_KEY: "custom-value",
      },
    });
    const result = JSON.parse(stripUnrecognizedConfigKeys(input));
    expect(result.env.vars.FOO).toBe("bar");
    expect(result.env.CUSTOM_KEY).toBe("custom-value");
  });

  it("returns non-JSON content unchanged", () => {
    const input = "not valid json {{{";
    expect(stripUnrecognizedConfigKeys(input)).toBe(input);
  });
});

describe("clearWizardSection", () => {
  it("removes wizard section from config", () => {
    const input = JSON.stringify({
      gateway: { port: 18789 },
      wizard: {
        lastRunAt: "2025-01-01T00:00:00Z",
        lastRunVersion: "2026.2.6-3",
        lastRunCommit: "abc123",
        lastRunCommand: "openclaw onboard",
        lastRunMode: "full",
      },
    });
    const result = JSON.parse(clearWizardSection(input));
    expect(result.wizard).toBeUndefined();
    expect(result.gateway.port).toBe(18789);
  });

  it("returns unchanged when no wizard section exists", () => {
    const input = JSON.stringify({
      gateway: { port: 18789 },
    });
    expect(clearWizardSection(input)).toBe(input);
  });

  it("returns non-JSON content unchanged", () => {
    const input = "not valid json {{{";
    expect(clearWizardSection(input)).toBe(input);
  });

  it("handles empty wizard section", () => {
    const input = JSON.stringify({
      gateway: { port: 18789 },
      wizard: {},
    });
    const result = JSON.parse(clearWizardSection(input));
    expect(result.wizard).toBeUndefined();
    expect(result.gateway.port).toBe(18789);
  });
});

describe("discoverSourceAuthProfileIds", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), "auth-discover-test-"));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  it("discovers profiles from modern auth-profiles.json", async () => {
    const agentDir = path.join(tmpDir, "agents", "main", "agent");
    await fsp.mkdir(agentDir, { recursive: true });
    await fsp.writeFile(
      path.join(agentDir, "auth-profiles.json"),
      JSON.stringify({
        version: 1,
        profiles: {
          "anthropic:default": { type: "api_key", provider: "anthropic", key: "fake-key" },
          "google:my-key": { type: "api_key", provider: "google", key: "fake-key" },
        },
      }),
    );

    const ids = discoverSourceAuthProfileIds(tmpDir);
    expect(ids).toContain("anthropic:default");
    expect(ids).toContain("google:my-key");
    expect(ids).toHaveLength(2);
  });

  it("discovers profiles from legacy auth.json", async () => {
    const agentDir = path.join(tmpDir, "agents", "main", "agent");
    await fsp.mkdir(agentDir, { recursive: true });
    await fsp.writeFile(
      path.join(agentDir, "auth.json"),
      JSON.stringify({
        anthropic: { type: "api_key", provider: "anthropic", key: "fake-key" },
        google: { type: "api_key", provider: "google", key: "fake-key" },
      }),
    );

    const ids = discoverSourceAuthProfileIds(tmpDir);
    expect(ids).toContain("anthropic:default");
    expect(ids).toContain("google:default");
    expect(ids).toHaveLength(2);
  });

  it("returns empty array when no auth files exist", () => {
    expect(discoverSourceAuthProfileIds(tmpDir)).toEqual([]);
  });

  it("returns empty array for malformed auth files", async () => {
    const agentDir = path.join(tmpDir, "agents", "main", "agent");
    await fsp.mkdir(agentDir, { recursive: true });
    await fsp.writeFile(path.join(agentDir, "auth-profiles.json"), "not valid json {{{");

    expect(discoverSourceAuthProfileIds(tmpDir)).toEqual([]);
  });

  it("deduplicates profile IDs across multiple auth files", async () => {
    const agent1 = path.join(tmpDir, "agents", "main", "agent");
    const agent2 = path.join(tmpDir, "agents", "helper", "agent");
    await fsp.mkdir(agent1, { recursive: true });
    await fsp.mkdir(agent2, { recursive: true });

    const store = JSON.stringify({
      version: 1,
      profiles: { "anthropic:default": { type: "api_key", provider: "anthropic" } },
    });
    await fsp.writeFile(path.join(agent1, "auth-profiles.json"), store);
    await fsp.writeFile(path.join(agent2, "auth-profiles.json"), store);

    const ids = discoverSourceAuthProfileIds(tmpDir);
    expect(ids).toEqual(["anthropic:default"]);
  });

  it("skips legacy auth.json that has profiles key (modern format)", async () => {
    const agentDir = path.join(tmpDir, "agents", "main", "agent");
    await fsp.mkdir(agentDir, { recursive: true });
    // A file named auth.json but with modern format should not produce legacy-style IDs
    await fsp.writeFile(
      path.join(agentDir, "auth.json"),
      JSON.stringify({
        version: 1,
        profiles: { "anthropic:default": { type: "api_key", provider: "anthropic" } },
      }),
    );

    // auth.json with "profiles" key is treated as modern and skipped by legacy collector,
    // and it's not named auth-profiles.json so modern collector also skips it
    expect(discoverSourceAuthProfileIds(tmpDir)).toEqual([]);
  });
});

describe("materializeAuthDefaults", () => {
  it("sets auth for claude runtime with anthropic profile", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const result = JSON.parse(materializeAuthDefaults(input, ["anthropic:default"]));
    expect(result.agents.defaults.auth).toBe("anthropic:default");
  });

  it("sets auth for gemini runtime with google profile", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "gemini" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const result = JSON.parse(materializeAuthDefaults(input, ["google:my-key"]));
    expect(result.agents.defaults.auth).toBe("google:my-key");
  });

  it("sets auth for codex runtime with openai-codex profile", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "codex" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const result = JSON.parse(materializeAuthDefaults(input, ["openai-codex:codex-cli"]));
    expect(result.agents.defaults.auth).toBe("openai-codex:codex-cli");
  });

  it("sets auth for opencode runtime with anthropic profile", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "opencode" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const result = JSON.parse(materializeAuthDefaults(input, ["anthropic:default"]));
    expect(result.agents.defaults.auth).toBe("anthropic:default");
  });

  it("selects first matching profile when multiple exist", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const result = JSON.parse(
      materializeAuthDefaults(input, ["google:key", "anthropic:first", "anthropic:second"]),
    );
    expect(result.agents.defaults.auth).toBe("anthropic:first");
  });

  it("does not set auth when no runtime configured", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { workspace: "~/ws" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const output = materializeAuthDefaults(input, ["anthropic:default"]);
    expect(output).toBe(input);
  });

  it("does not set auth when auth already configured", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "claude", auth: "existing:profile" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const output = materializeAuthDefaults(input, ["anthropic:default"]);
    expect(output).toBe(input);
  });

  it("does not set auth when auth is explicitly false", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "claude", auth: false },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const output = materializeAuthDefaults(input, ["anthropic:default"]);
    expect(output).toBe(input);
  });

  it("does not set auth when no matching profile exists", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const output = materializeAuthDefaults(input, ["google:key"]);
    expect(output).toBe(input);
  });

  it("returns unchanged for empty profile IDs", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const output = materializeAuthDefaults(input, []);
    expect(output).toBe(input);
  });

  it("returns non-JSON content unchanged", () => {
    const input = "not valid json {{{";
    expect(materializeAuthDefaults(input, ["anthropic:default"])).toBe(input);
  });

  it("handles config without agents key", () => {
    const input = JSON.stringify({ gateway: { port: 18789 } });
    const output = materializeAuthDefaults(input, ["anthropic:default"]);
    expect(output).toBe(input);
  });

  it("matches claude provider prefix for claude runtime", () => {
    const input = JSON.stringify({
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    const result = JSON.parse(materializeAuthDefaults(input, ["claude:custom-profile"]));
    expect(result.agents.defaults.auth).toBe("claude:custom-profile");
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
      "token": "\${OPENCLAW_GATEWAY_TOKEN}",
      "workspace": "/home/user/.openclaw/workspace"
    }
  }
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

  it("materializes workspace defaults in main config during import", async () => {
    const configContent = JSON.stringify({
      gateway: { port: 18789 },
      channels: { whatsapp: {} },
      agents: { list: [{ id: "main" }] },
    });
    await fsp.writeFile(path.join(sourceDir, "openclaw.json"), configContent);

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    const result = await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    const written = await fsp.readFile(path.join(targetDir, "remoteclaw.json"), "utf-8");
    const parsed = JSON.parse(written);
    expect(parsed.agents.list[0].workspace).toBe("~/.remoteclaw/workspace");
    expect(result.transformedFiles).toHaveLength(1);
  });

  it("materializes auth defaults when auth profiles and runtime exist", async () => {
    const configContent = JSON.stringify({
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    await fsp.writeFile(path.join(sourceDir, "openclaw.json"), configContent);

    // Create auth profiles in the source
    const agentDir = path.join(sourceDir, "agents", "main", "agent");
    await fsp.mkdir(agentDir, { recursive: true });
    await fsp.writeFile(
      path.join(agentDir, "auth-profiles.json"),
      JSON.stringify({
        version: 1,
        profiles: {
          "anthropic:default": { type: "api_key", provider: "anthropic", key: "fake-key" },
        },
      }),
    );

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    const written = await fsp.readFile(path.join(targetDir, "remoteclaw.json"), "utf-8");
    const parsed = JSON.parse(written);
    expect(parsed.agents.defaults.auth).toBe("anthropic:default");
  });

  it("clears wizard section from main config during import", async () => {
    const configContent = JSON.stringify({
      gateway: { port: 18789 },
      agents: { list: [{ id: "main", workspace: "~/ws" }] },
      wizard: {
        lastRunAt: "2025-01-01T00:00:00Z",
        lastRunVersion: "2026.2.6-3",
        lastRunCommit: "abc123",
        lastRunCommand: "openclaw onboard",
        lastRunMode: "full",
      },
    });
    await fsp.writeFile(path.join(sourceDir, "openclaw.json"), configContent);

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    const written = await fsp.readFile(path.join(targetDir, "remoteclaw.json"), "utf-8");
    const parsed = JSON.parse(written);
    expect(parsed.wizard).toBeUndefined();
    expect(parsed.gateway.port).toBe(18789);
  });

  it("does not set auth when no auth profiles exist in source", async () => {
    const configContent = JSON.stringify({
      agents: {
        defaults: { runtime: "claude" },
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    await fsp.writeFile(path.join(sourceDir, "openclaw.json"), configContent);

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    const written = await fsp.readFile(path.join(targetDir, "remoteclaw.json"), "utf-8");
    const parsed = JSON.parse(written);
    expect(parsed.agents.defaults.auth).toBeUndefined();
  });

  it("does not set auth when no runtime is configured", async () => {
    const configContent = JSON.stringify({
      agents: {
        list: [{ id: "main", workspace: "~/ws" }],
      },
    });
    await fsp.writeFile(path.join(sourceDir, "openclaw.json"), configContent);

    const agentDir = path.join(sourceDir, "agents", "main", "agent");
    await fsp.mkdir(agentDir, { recursive: true });
    await fsp.writeFile(
      path.join(agentDir, "auth-profiles.json"),
      JSON.stringify({
        version: 1,
        profiles: {
          "anthropic:default": { type: "api_key", provider: "anthropic", key: "fake-key" },
        },
      }),
    );

    const pathsMod = await import("../config/paths.js");
    vi.spyOn(pathsMod, "resolveNewStateDir").mockReturnValue(targetDir);

    await importCommand({ sourcePath: sourceDir, yes: true }, runtime as RuntimeEnv);

    const written = await fsp.readFile(path.join(targetDir, "remoteclaw.json"), "utf-8");
    const parsed = JSON.parse(written);
    expect(parsed.agents.defaults).toBeUndefined();
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
