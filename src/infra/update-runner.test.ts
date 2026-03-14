import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { withEnvAsync } from "../test-utils/env.js";
import { pathExists } from "../utils.js";
import { runGatewayUpdate } from "./update-runner.js";

type CommandResult = { stdout: string; stderr: string; code: number | null };

describe("runGatewayUpdate", () => {
  let fixtureRoot = "";
  let caseId = 0;
  let tempDir: string;

  beforeAll(async () => {
    fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "remoteclaw-update-"));
  });

  afterAll(async () => {
    if (fixtureRoot) {
      await fs.rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    tempDir = path.join(fixtureRoot, `case-${caseId++}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    // Shared fixtureRoot cleaned up in afterAll.
  });

  async function seedGlobalPackageRoot(pkgRoot: string, version = "1.0.0") {
    await fs.mkdir(pkgRoot, { recursive: true });
    await fs.writeFile(
      path.join(pkgRoot, "package.json"),
      JSON.stringify({ name: "remoteclaw", version }),
      "utf-8",
    );
  }

  function createGlobalInstallHarness(params: {
    pkgRoot: string;
    npmRootOutput?: string;
    installCommand: string;
    onInstall?: () => Promise<void>;
  }) {
    const calls: string[] = [];
    const runCommand = async (argv: string[]) => {
      const key = argv.join(" ");
      calls.push(key);
      if (key === "npm root -g") {
        if (params.npmRootOutput) {
          return { stdout: params.npmRootOutput, stderr: "", code: 0 };
        }
        return { stdout: "", stderr: "", code: 1 };
      }
      if (key === "pnpm root -g") {
        return { stdout: "", stderr: "", code: 1 };
      }
      if (key === params.installCommand) {
        await params.onInstall?.();
        return { stdout: "ok", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };
    return { calls, runCommand };
  }

  async function runWithCommand(
    runCommand: (argv: string[]) => Promise<CommandResult>,
    options?: { channel?: "stable" | "beta" | "next"; tag?: string; cwd?: string },
  ) {
    return runGatewayUpdate({
      cwd: options?.cwd ?? tempDir,
      runCommand: async (argv, _runOptions) => runCommand(argv),
      timeoutMs: 5000,
      ...(options?.channel ? { channel: options.channel } : {}),
      ...(options?.tag ? { tag: options.tag } : {}),
    });
  }

  async function runNpmGlobalUpdateCase(params: {
    expectedInstallCommand: string;
    channel?: "stable" | "beta" | "next";
    tag?: string;
  }): Promise<{ calls: string[]; result: Awaited<ReturnType<typeof runGatewayUpdate>> }> {
    const nodeModules = path.join(tempDir, "node_modules");
    const pkgRoot = path.join(nodeModules, "remoteclaw");
    await seedGlobalPackageRoot(pkgRoot);

    const { calls, runCommand } = createGlobalInstallHarness({
      pkgRoot,
      npmRootOutput: nodeModules,
      installCommand: params.expectedInstallCommand,
      onInstall: async () => {
        await fs.writeFile(
          path.join(pkgRoot, "package.json"),
          JSON.stringify({ name: "remoteclaw", version: "2.0.0" }),
          "utf-8",
        );
      },
    });

    const result = await runWithCommand(runCommand, {
      cwd: pkgRoot,
      channel: params.channel,
      tag: params.tag,
    });

    return { calls, result };
  }

  it("returns skipped when cwd has no package root and process.cwd fallback has no PM", async () => {
    const emptyDir = path.join(tempDir, "empty");
    await fs.mkdir(emptyDir, { recursive: true });
    const runCommand = async () => ({ stdout: "", stderr: "", code: 0 });

    const result = await runWithCommand(runCommand, { cwd: emptyDir });

    // process.cwd() (project root) is always a candidate, so a root is found
    // but no package manager matches the mock → "skipped".
    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no-package-manager");
  });

  it("returns skipped when no package manager detected", async () => {
    await fs.writeFile(
      path.join(tempDir, "package.json"),
      JSON.stringify({ name: "remoteclaw" }),
      "utf-8",
    );

    const runCommand = async (argv: string[]) => {
      const key = argv.join(" ");
      if (key === "npm root -g") {
        return { stdout: "", stderr: "", code: 1 };
      }
      if (key === "pnpm root -g") {
        return { stdout: "", stderr: "", code: 1 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };

    const result = await runWithCommand(runCommand);

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("no-package-manager");
  });

  it.each([
    {
      title: "updates global npm installs when detected (default next channel)",
      expectedInstallCommand: "npm i -g remoteclaw@next --no-fund --no-audit --loglevel=error",
    },
    {
      title: "updates global npm installs on stable channel",
      expectedInstallCommand: "npm i -g remoteclaw@latest --no-fund --no-audit --loglevel=error",
      channel: "stable" as const,
    },
    {
      title: "uses update channel for global npm installs when tag is omitted",
      expectedInstallCommand: "npm i -g remoteclaw@beta --no-fund --no-audit --loglevel=error",
      channel: "beta" as const,
    },
    {
      title: "uses next channel for global npm installs",
      expectedInstallCommand: "npm i -g remoteclaw@next --no-fund --no-audit --loglevel=error",
      channel: "next" as const,
    },
    {
      title: "updates global npm installs with tag override",
      expectedInstallCommand: "npm i -g remoteclaw@beta --no-fund --no-audit --loglevel=error",
      tag: "beta",
    },
  ])("$title", async ({ expectedInstallCommand, channel, tag }) => {
    const { calls, result } = await runNpmGlobalUpdateCase({
      expectedInstallCommand,
      channel,
      tag,
    });

    expect(result.status).toBe("ok");
    expect(result.mode).toBe("npm");
    expect(result.before?.version).toBe("1.0.0");
    expect(result.after?.version).toBe("2.0.0");
    expect(calls.some((call) => call === expectedInstallCommand)).toBe(true);
  });

  it("cleans stale npm rename dirs before global update", async () => {
    const nodeModules = path.join(tempDir, "node_modules");
    const pkgRoot = path.join(nodeModules, "remoteclaw");
    const staleDir = path.join(nodeModules, ".remoteclaw-stale");
    await fs.mkdir(staleDir, { recursive: true });
    await seedGlobalPackageRoot(pkgRoot);

    let stalePresentAtInstall = true;
    const runCommand = async (argv: string[]) => {
      const key = argv.join(" ");
      if (key === "npm root -g") {
        return { stdout: nodeModules, stderr: "", code: 0 };
      }
      if (key === "pnpm root -g") {
        return { stdout: "", stderr: "", code: 1 };
      }
      if (key === "npm i -g remoteclaw@next --no-fund --no-audit --loglevel=error") {
        stalePresentAtInstall = await pathExists(staleDir);
        return { stdout: "ok", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };

    const result = await runWithCommand(runCommand, { cwd: pkgRoot });

    expect(result.status).toBe("ok");
    expect(stalePresentAtInstall).toBe(false);
    expect(await pathExists(staleDir)).toBe(false);
  });

  it("retries global npm update with --omit=optional when initial install fails", async () => {
    const nodeModules = path.join(tempDir, "node_modules");
    const pkgRoot = path.join(nodeModules, "remoteclaw");
    await seedGlobalPackageRoot(pkgRoot);

    let firstAttempt = true;
    const runCommand = async (argv: string[]) => {
      const key = argv.join(" ");
      if (key === `git -C ${pkgRoot} rev-parse --show-toplevel`) {
        return { stdout: "", stderr: "not a git repository", code: 128 };
      }
      if (key === "npm root -g") {
        return { stdout: nodeModules, stderr: "", code: 0 };
      }
      if (key === "pnpm root -g") {
        return { stdout: "", stderr: "", code: 1 };
      }
      if (key === "npm i -g remoteclaw@next --no-fund --no-audit --loglevel=error") {
        firstAttempt = false;
        return { stdout: "", stderr: "node-gyp failed", code: 1 };
      }
      if (
        key === "npm i -g remoteclaw@next --omit=optional --no-fund --no-audit --loglevel=error"
      ) {
        await fs.writeFile(
          path.join(pkgRoot, "package.json"),
          JSON.stringify({ name: "remoteclaw", version: "2.0.0" }),
          "utf-8",
        );
        return { stdout: "ok", stderr: "", code: 0 };
      }
      return { stdout: "", stderr: "", code: 0 };
    };

    const result = await runWithCommand(runCommand, { cwd: pkgRoot });

    expect(firstAttempt).toBe(false);
    expect(result.status).toBe("ok");
    expect(result.mode).toBe("npm");
    expect(result.steps.map((s) => s.name)).toEqual([
      "global update",
      "global update (omit optional)",
    ]);
  });

  it("updates global bun installs when detected", async () => {
    const bunInstall = path.join(tempDir, "bun-install");
    await withEnvAsync({ BUN_INSTALL: bunInstall }, async () => {
      const bunGlobalRoot = path.join(bunInstall, "install", "global", "node_modules");
      const pkgRoot = path.join(bunGlobalRoot, "remoteclaw");
      await seedGlobalPackageRoot(pkgRoot);

      const { calls, runCommand } = createGlobalInstallHarness({
        pkgRoot,
        installCommand: "bun add -g remoteclaw@next",
        onInstall: async () => {
          await fs.writeFile(
            path.join(pkgRoot, "package.json"),
            JSON.stringify({ name: "remoteclaw", version: "2.0.0" }),
            "utf-8",
          );
        },
      });

      const result = await runWithCommand(runCommand, { cwd: pkgRoot });

      expect(result.status).toBe("ok");
      expect(result.mode).toBe("bun");
      expect(result.before?.version).toBe("1.0.0");
      expect(result.after?.version).toBe("2.0.0");
      expect(calls.some((call) => call === "bun add -g remoteclaw@next")).toBe(true);
    });
  });

  it("defaults to next channel", async () => {
    const { result } = await runNpmGlobalUpdateCase({
      expectedInstallCommand: "npm i -g remoteclaw@next --no-fund --no-audit --loglevel=error",
    });

    expect(result.status).toBe("ok");
  });
});
