import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { wrapToolWorkspaceRootGuardWithOptions } from "./pi-tools.read.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

function createToolHarness() {
  const execute = vi.fn(async () => ({
    content: [{ type: "text", text: "ok" }],
  }));
  const tool = {
    name: "read",
    description: "test tool",
    inputSchema: { type: "object", properties: {} },
    execute,
  } as unknown as AnyAgentTool;
  return { execute, tool };
}

describe("wrapToolWorkspaceRootGuardWithOptions", () => {
  let root: string;

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-guard-"));
    // Create a file inside root so reads succeed
    await fs.mkdir(path.join(root, "docs"), { recursive: true });
    await fs.writeFile(path.join(root, "docs", "readme.md"), "test", "utf8");
  });

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("maps container workspace paths to host workspace root", async () => {
    const { tool, execute } = createToolHarness();
    const wrapped = wrapToolWorkspaceRootGuardWithOptions(tool, root, {
      containerWorkdir: "/workspace",
    });

    await wrapped.execute("tc1", { path: "/workspace/docs/readme.md" });

    // The execute function should be called with the mapped path
    expect(execute).toHaveBeenCalled();
  });

  it("maps file:// container workspace paths to host workspace root", async () => {
    const { tool, execute } = createToolHarness();
    const wrapped = wrapToolWorkspaceRootGuardWithOptions(tool, root, {
      containerWorkdir: "/workspace",
    });

    await wrapped.execute("tc2", { path: "file:///workspace/docs/readme.md" });

    expect(execute).toHaveBeenCalled();
  });

  it("maps @-prefixed container workspace paths to host workspace root", async () => {
    const { tool, execute } = createToolHarness();
    const wrapped = wrapToolWorkspaceRootGuardWithOptions(tool, root, {
      containerWorkdir: "/workspace",
    });

    await wrapped.execute("tc-at-container", { path: "@/workspace/docs/readme.md" });

    expect(execute).toHaveBeenCalled();
  });

  it("rejects @-prefixed absolute paths outside workspace root", async () => {
    const { tool } = createToolHarness();
    const wrapped = wrapToolWorkspaceRootGuardWithOptions(tool, root, {
      containerWorkdir: "/workspace",
    });

    await expect(wrapped.execute("tc-at-absolute", { path: "@/etc/passwd" })).rejects.toThrow(
      /outside workspace root/,
    );
  });

  it("rejects absolute paths outside the configured container workdir", async () => {
    const { tool } = createToolHarness();
    const wrapped = wrapToolWorkspaceRootGuardWithOptions(tool, root, {
      containerWorkdir: "/workspace",
    });

    await expect(wrapped.execute("tc3", { path: "/workspace-two/secret.txt" })).rejects.toThrow(
      /outside workspace root/,
    );
  });
});
