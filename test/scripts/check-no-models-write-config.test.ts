import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { FORBIDDEN_TOKEN, parseMatches } from "../../scripts/check-no-models-write-config.mjs";

const SCRIPT = fileURLToPath(
  new URL("../../scripts/check-no-models-write-config.mjs", import.meta.url),
);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-models-write-"));
  tempDirs.push(dir);
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Run the gate in `cwd`; returns { status, stdout, stderr }. status 0 = clean. */
function runGate(cwd: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [SCRIPT], { cwd, encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe("check-no-models-write-config: match parsing", () => {
  it("parses `git grep -n` lines into file/line/content", () => {
    const line = `src/config/zod-schema.session.ts:203:    ${FORBIDDEN_TOKEN}: z.boolean(),`;
    expect(parseMatches(line)).toEqual([
      {
        file: "src/config/zod-schema.session.ts",
        line: 203,
        content: `    ${FORBIDDEN_TOKEN}: z.boolean(),`,
        raw: line,
      },
    ]);
  });

  it("returns [] on empty output", () => {
    expect(parseMatches("")).toEqual([]);
  });
});

describe("check-no-models-write-config: end-to-end gate", () => {
  function initRepo(): string {
    const root = makeTempDir();
    git(root, "init", "-q");
    git(root, "config", "user.email", "test@example.com");
    git(root, "config", "user.name", "Test User");
    return root;
  }

  function write(root: string, rel: string, content: string): void {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    git(root, "add", rel);
  }

  it("passes (exit 0) when src/config has no forbidden token", () => {
    const root = initRepo();
    write(root, "src/config/zod-schema.session.ts", "export const x = 1;\n");
    expect(runGate(root).status).toBe(0);
  });

  it("fails (exit 1) when the token reappears under src/config and names file:line", () => {
    const root = initRepo();
    write(
      root,
      "src/config/zod-schema.session.ts",
      `const a = 1;\nexport const flag = "${FORBIDDEN_TOKEN}";\n`,
    );
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("src/config/zod-schema.session.ts:2");
  });

  it("ignores the token OUTSIDE src/config (scope is src/config only)", () => {
    const root = initRepo();
    write(
      root,
      "scripts/check-no-models-write-config.mjs",
      `export const FORBIDDEN_TOKEN = "${FORBIDDEN_TOKEN}";\n`,
    );
    expect(runGate(root).status).toBe(0);
  });
});
