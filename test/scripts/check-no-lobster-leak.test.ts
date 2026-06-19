import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  ALLOWLIST_REL,
  findViolations,
  isAllowlisted,
  loadAllowlist,
  parseHits,
} from "../../scripts/check-no-lobster-leak.mjs";

// Built from codepoints so this test source holds no literal emoji (the gate would
// otherwise flag its own test fixtures as a leak).
const LOBSTER = String.fromCodePoint(0x1f99e);
const CRAB = String.fromCodePoint(0x1f980);
const SLOTH = String.fromCodePoint(0x1f9a5);

const SCRIPT = fileURLToPath(new URL("../../scripts/check-no-lobster-leak.mjs", import.meta.url));

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-lobster-leak-"));
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

describe("check-no-lobster-leak: allowlist parsing", () => {
  it("parses `<path> <context-substring>` rules and ignores blanks/comments", () => {
    const rules = loadAllowlist(
      [
        "# a comment",
        "",
        `src/infra/system-events.test.ts HEARTBEAT_OK ${LOBSTER}`,
        `   src/config/x.test.ts emoji: "${LOBSTER}"   `,
      ].join("\n"),
    );
    expect(rules).toEqual([
      { file: "src/infra/system-events.test.ts", context: `HEARTBEAT_OK ${LOBSTER}` },
      { file: "src/config/x.test.ts", context: `emoji: "${LOBSTER}"` },
    ]);
  });

  it("rejects a rule that has a path but no context anchor", () => {
    expect(() => loadAllowlist("src/infra/system-events.test.ts")).toThrow(/context-substring/u);
  });
});

describe("check-no-lobster-leak: hit parsing", () => {
  it("parses `git grep -n` lines into file/line/content", () => {
    const hits = parseHits(
      [
        `src/infra/system-events.test.ts:116:    expect(x("HEARTBEAT_OK ${LOBSTER}")).toBe(false);`,
      ].join("\n"),
    );
    expect(hits).toEqual([
      {
        file: "src/infra/system-events.test.ts",
        line: 116,
        content: `    expect(x("HEARTBEAT_OK ${LOBSTER}")).toBe(false);`,
        raw: `src/infra/system-events.test.ts:116:    expect(x("HEARTBEAT_OK ${LOBSTER}")).toBe(false);`,
      },
    ]);
  });
});

describe("check-no-lobster-leak: exemption logic", () => {
  const rules = [
    { file: "src/infra/system-events.test.ts", context: `HEARTBEAT_OK ${LOBSTER}` },
    { file: "src/config/config.identity-defaults.test.ts", context: `emoji: "${LOBSTER}"` },
  ];

  it("exempts a hit whose file AND context match a rule", () => {
    const hit = {
      file: "src/infra/system-events.test.ts",
      line: 116,
      content: `  expect(x("HEARTBEAT_OK ${LOBSTER}")).toBe(false);`,
      raw: "",
    };
    expect(isAllowlisted(hit, rules)).toBe(true);
  });

  it("does NOT exempt the same context substring in a DIFFERENT file (file-scoped)", () => {
    // `emoji: "<lobster>"` is allowlisted only for the identity-defaults test, not docs.
    const hit = {
      file: "docs/cli/agents.md",
      line: 213,
      content: `          emoji: "${LOBSTER}",`,
      raw: "",
    };
    expect(isAllowlisted(hit, rules)).toBe(false);
  });

  it("does NOT exempt a NEW unrelated lobster added to an allowlisted file", () => {
    const hit = {
      file: "src/infra/system-events.test.ts",
      line: 200,
      content: `  const brand = "${LOBSTER}"; // new leak`,
      raw: "",
    };
    expect(isAllowlisted(hit, rules)).toBe(false);
  });

  it("always exempts the allowlist file itself (its anchors necessarily contain the lobster)", () => {
    const hit = {
      file: ALLOWLIST_REL,
      line: 1,
      content: `src/infra/system-events.test.ts HEARTBEAT_OK ${LOBSTER}`,
      raw: "",
    };
    expect(isAllowlisted(hit, [])).toBe(true);
  });

  it("findViolations returns only non-allowlisted hits, preserving file:line", () => {
    const hits = [
      {
        file: "src/infra/system-events.test.ts",
        line: 116,
        content: `HEARTBEAT_OK ${LOBSTER}`,
        raw: "",
      },
      { file: "ui/src/ui/views/config-quick.ts", line: 42, content: `"JD or ${LOBSTER}"`, raw: "" },
    ];
    const violations = findViolations(hits, rules);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: "ui/src/ui/views/config-quick.ts", line: 42 });
  });
});

describe("check-no-lobster-leak: end-to-end gate", () => {
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

  it("passes (exit 0) on a tree with no lobster at all", () => {
    const root = initRepo();
    write(root, "src/app.ts", `export const mascot = "${CRAB}";\n`);
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it("fails (exit 1) on a new lobster outside the allowlist and names file:line", () => {
    const root = initRepo();
    write(root, "src/leak.ts", `const a = 1;\nexport const oops = "${LOBSTER}";\n`);
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("src/leak.ts:2");
    expect(r.stderr).toContain(CRAB); // suggests the crab as the fix
  });

  it("passes (exit 0) when the only lobster is matched by a context-anchored allowlist rule", () => {
    const root = initRepo();
    write(
      root,
      "src/infra/system-events.test.ts",
      `expect(isCronSystemEvent("HEARTBEAT_OK ${LOBSTER}")).toBe(false);\n`,
    );
    write(
      root,
      ALLOWLIST_REL,
      `# allowlist\nsrc/infra/system-events.test.ts HEARTBEAT_OK ${LOBSTER}\n`,
    );
    const r = runGate(root);
    expect(r.status).toBe(0);
  });

  it("still fails when an allowlisted file gains a SECOND, unanchored lobster", () => {
    const root = initRepo();
    write(
      root,
      "src/infra/system-events.test.ts",
      `expect(isCronSystemEvent("HEARTBEAT_OK ${LOBSTER}")).toBe(false);\nconst brand = "${LOBSTER}";\n`,
    );
    write(
      root,
      ALLOWLIST_REL,
      `# allowlist\nsrc/infra/system-events.test.ts HEARTBEAT_OK ${LOBSTER}\n`,
    );
    const r = runGate(root);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("src/infra/system-events.test.ts:2");
  });

  it("does not flag the sloth (default identity emoji) — only the lobster", () => {
    const root = initRepo();
    write(root, "src/identity.ts", `export const emoji = "${SLOTH}";\n`);
    const r = runGate(root);
    expect(r.status).toBe(0);
  });
});
