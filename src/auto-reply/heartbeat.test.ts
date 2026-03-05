import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveHeartbeatPrompt } from "./heartbeat.js";

let fixtureRoot = "";

beforeAll(async () => {
  fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-heartbeat-test-"));
});

afterAll(async () => {
  if (fixtureRoot) {
    await fs.rm(fixtureRoot, { recursive: true, force: true });
  }
});

describe("resolveHeartbeatPrompt", () => {
  it("returns empty string when neither prompt nor file is set", async () => {
    expect(await resolveHeartbeatPrompt({})).toBe("");
    expect(await resolveHeartbeatPrompt({ prompt: "", file: "" })).toBe("");
    expect(await resolveHeartbeatPrompt({ prompt: "   " })).toBe("");
  });

  it("returns trimmed prompt when set", async () => {
    expect(await resolveHeartbeatPrompt({ prompt: "  ping  " })).toBe("ping");
    expect(await resolveHeartbeatPrompt({ prompt: "Check health" })).toBe("Check health");
  });

  it("prompt takes precedence over file", async () => {
    const dir = path.join(fixtureRoot, "precedence");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "hb.md"), "File content", "utf-8");

    expect(
      await resolveHeartbeatPrompt({
        prompt: "Config prompt",
        file: "hb.md",
        workspaceDir: dir,
      }),
    ).toBe("Config prompt");
  });

  it("reads file relative to workspaceDir", async () => {
    const dir = path.join(fixtureRoot, "file-read");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "HEARTBEAT.md"), "- Check server\n- Review PRs\n", "utf-8");

    expect(
      await resolveHeartbeatPrompt({
        file: "HEARTBEAT.md",
        workspaceDir: dir,
      }),
    ).toBe("- Check server\n- Review PRs");
  });

  it("reads file with absolute path", async () => {
    const dir = path.join(fixtureRoot, "abs-path");
    await fs.mkdir(dir, { recursive: true });
    const absPath = path.join(dir, "custom.md");
    await fs.writeFile(absPath, "Absolute file content", "utf-8");

    expect(await resolveHeartbeatPrompt({ file: absPath })).toBe("Absolute file content");
  });

  it("returns empty string when file is missing", async () => {
    const dir = path.join(fixtureRoot, "missing-file");
    await fs.mkdir(dir, { recursive: true });

    expect(
      await resolveHeartbeatPrompt({
        file: "nonexistent.md",
        workspaceDir: dir,
      }),
    ).toBe("");
  });

  it("returns empty string when file is empty", async () => {
    const dir = path.join(fixtureRoot, "empty-file");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "empty.md"), "   \n\n  ", "utf-8");

    expect(
      await resolveHeartbeatPrompt({
        file: "empty.md",
        workspaceDir: dir,
      }),
    ).toBe("");
  });
});
