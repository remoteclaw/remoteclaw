import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import { ensureAgentWorkspace } from "./workspace.js";

// Gutted in RemoteClaw fork — these constants and functions were removed
// during workspace architecture cleanup (WI-166–178, WI-181).
// Tests below that depended on them are skipped.
const DEFAULT_AGENTS_FILENAME = "AGENTS.md";
const DEFAULT_BOOTSTRAP_FILENAME = "BOOTSTRAP.md";
const DEFAULT_IDENTITY_FILENAME = "IDENTITY.md";
const _DEFAULT_MEMORY_ALT_FILENAME = "memory.md";
const _DEFAULT_MEMORY_FILENAME = "MEMORY.md";
const DEFAULT_TOOLS_FILENAME = "TOOLS.md";
const DEFAULT_USER_FILENAME = "USER.md";

type WorkspaceBootstrapFile = {
  name: string;
  path: string;
  content?: string;
  missing: boolean;
};

describe.skip("resolveDefaultAgentWorkspaceDir — gutted in RemoteClaw fork", () => {
  it("uses REMOTECLAW_HOME for default workspace resolution", () => {
    // resolveDefaultAgentWorkspaceDir was removed in workspace cleanup
  });
});

const WORKSPACE_STATE_PATH_SEGMENTS = [".remoteclaw", "workspace-state.json"] as const;

async function readOnboardingState(dir: string): Promise<{
  version: number;
  bootstrapSeededAt?: string;
  onboardingCompletedAt?: string;
}> {
  const raw = await fs.readFile(path.join(dir, ...WORKSPACE_STATE_PATH_SEGMENTS), "utf-8");
  return JSON.parse(raw) as {
    version: number;
    bootstrapSeededAt?: string;
    onboardingCompletedAt?: string;
  };
}

async function expectBootstrapSeeded(dir: string) {
  await expect(fs.access(path.join(dir, DEFAULT_BOOTSTRAP_FILENAME))).resolves.toBeUndefined();
  const state = await readOnboardingState(dir);
  expect(state.bootstrapSeededAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
}

async function expectCompletedWithoutBootstrap(dir: string) {
  await expect(fs.access(path.join(dir, DEFAULT_IDENTITY_FILENAME))).resolves.toBeUndefined();
  await expect(fs.access(path.join(dir, DEFAULT_BOOTSTRAP_FILENAME))).rejects.toMatchObject({
    code: "ENOENT",
  });
  const state = await readOnboardingState(dir);
  expect(state.onboardingCompletedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
}

function _expectSubagentAllowedBootstrapNames(files: WorkspaceBootstrapFile[]) {
  const names = files.map((file: WorkspaceBootstrapFile) => file.name);
  expect(names).toContain("AGENTS.md");
  expect(names).toContain("TOOLS.md");
  expect(names).toContain("SOUL.md");
  expect(names).toContain("IDENTITY.md");
  expect(names).toContain("USER.md");
  expect(names).not.toContain("HEARTBEAT.md");
  expect(names).not.toContain("BOOTSTRAP.md");
  expect(names).not.toContain("MEMORY.md");
}

// Gutted in RemoteClaw fork — ensureAgentWorkspace was reduced to a simple
// mkdir during workspace architecture cleanup (WI-166–178, WI-181).
// It no longer creates template files (BOOTSTRAP.md, IDENTITY.md, etc.)
// or workspace-state.json. All tests below depend on that removed behavior.
describe.skip("ensureAgentWorkspace — gutted in RemoteClaw fork", () => {
  it("creates BOOTSTRAP.md and records a seeded marker for brand new workspaces", async () => {
    const tempDir = await makeTempWorkspace("remoteclaw-workspace-");

    await ensureAgentWorkspace({ dir: tempDir, ensureBootstrapFiles: true });

    await expectBootstrapSeeded(tempDir);
    expect((await readOnboardingState(tempDir)).onboardingCompletedAt).toBeUndefined();
  });

  it("recovers partial initialization by creating BOOTSTRAP.md when marker is missing", async () => {
    const tempDir = await makeTempWorkspace("remoteclaw-workspace-");
    await writeWorkspaceFile({ dir: tempDir, name: DEFAULT_AGENTS_FILENAME, content: "existing" });

    await ensureAgentWorkspace({ dir: tempDir, ensureBootstrapFiles: true });

    await expectBootstrapSeeded(tempDir);
  });

  it("does not recreate BOOTSTRAP.md after completion, even when a core file is recreated", async () => {
    const tempDir = await makeTempWorkspace("remoteclaw-workspace-");
    await ensureAgentWorkspace({ dir: tempDir, ensureBootstrapFiles: true });
    await writeWorkspaceFile({ dir: tempDir, name: DEFAULT_IDENTITY_FILENAME, content: "custom" });
    await writeWorkspaceFile({ dir: tempDir, name: DEFAULT_USER_FILENAME, content: "custom" });
    await fs.unlink(path.join(tempDir, DEFAULT_BOOTSTRAP_FILENAME));
    await fs.unlink(path.join(tempDir, DEFAULT_TOOLS_FILENAME));

    await ensureAgentWorkspace({ dir: tempDir, ensureBootstrapFiles: true });

    await expect(fs.access(path.join(tempDir, DEFAULT_BOOTSTRAP_FILENAME))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.access(path.join(tempDir, DEFAULT_TOOLS_FILENAME))).resolves.toBeUndefined();
    const state = await readOnboardingState(tempDir);
    expect(state.onboardingCompletedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("does not re-seed BOOTSTRAP.md for legacy completed workspaces without state marker", async () => {
    const tempDir = await makeTempWorkspace("remoteclaw-workspace-");
    await writeWorkspaceFile({ dir: tempDir, name: DEFAULT_IDENTITY_FILENAME, content: "custom" });
    await writeWorkspaceFile({ dir: tempDir, name: DEFAULT_USER_FILENAME, content: "custom" });

    await ensureAgentWorkspace({ dir: tempDir, ensureBootstrapFiles: true });

    await expect(fs.access(path.join(tempDir, DEFAULT_BOOTSTRAP_FILENAME))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const state = await readOnboardingState(tempDir);
    expect(state.bootstrapSeededAt).toBeUndefined();
    expect(state.onboardingCompletedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("treats memory-backed workspaces as existing even when template files are missing", async () => {
    const tempDir = await makeTempWorkspace("remoteclaw-workspace-");
    await fs.mkdir(path.join(tempDir, "memory"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "memory", "2026-02-25.md"), "# Daily log\nSome notes");
    await fs.writeFile(path.join(tempDir, "MEMORY.md"), "# Long-term memory\nImportant stuff");

    await ensureAgentWorkspace({ dir: tempDir, ensureBootstrapFiles: true });

    await expect(fs.access(path.join(tempDir, DEFAULT_IDENTITY_FILENAME))).resolves.toBeUndefined();
    await expect(fs.access(path.join(tempDir, DEFAULT_BOOTSTRAP_FILENAME))).rejects.toMatchObject({
      code: "ENOENT",
    });
    const state = await readOnboardingState(tempDir);
    expect(state.onboardingCompletedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
    const memoryContent = await fs.readFile(path.join(tempDir, "MEMORY.md"), "utf-8");
    expect(memoryContent).toBe("# Long-term memory\nImportant stuff");
  });

  it("treats git-backed workspaces as existing even when template files are missing", async () => {
    const tempDir = await makeTempWorkspace("remoteclaw-workspace-");
    await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
    await fs.writeFile(path.join(tempDir, ".git", "HEAD"), "ref: refs/heads/main\n");

    await ensureAgentWorkspace({ dir: tempDir, ensureBootstrapFiles: true });

    await expectCompletedWithoutBootstrap(tempDir);
  });
});

describe.skip("loadWorkspaceBootstrapFiles — gutted in RemoteClaw fork", () => {
  it("includes MEMORY.md when present", () => {});
  it("includes memory.md when MEMORY.md is absent", () => {});
  it("omits memory entries when no memory files exist", () => {});
  it("treats hardlinked bootstrap aliases as missing", () => {});
});

describe.skip("filterBootstrapFilesForSession — gutted in RemoteClaw fork", () => {
  it("returns all files for main session (no sessionKey)", () => {});
  it("returns all files for normal (non-subagent, non-cron) session key", () => {});
  it("filters to allowlist for subagent sessions", () => {});
  it("filters to allowlist for cron sessions", () => {});
});
