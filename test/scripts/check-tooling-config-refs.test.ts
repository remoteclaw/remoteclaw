import { describe, expect, it } from "vitest";
import {
  compareToLedger,
  extractConfigRefs,
  findDanglingRefs,
  KNOWN_MISSING_CONFIG_REFS,
} from "../../scripts/check-tooling-config-refs.mjs";

describe("extractConfigRefs", () => {
  it("captures the upstream config/ paths this fork does not have", () => {
    const source = [
      `const EXTENSION_TS_CONFIG = "config/tsconfig/oxlint.extensions.json";`,
      `const KNIP = "config/knip.config.ts";`,
    ].join("\n");

    expect(extractConfigRefs(source, "scripts/example.mjs")).toEqual([
      { file: "scripts/example.mjs", line: 1, value: "config/tsconfig/oxlint.extensions.json" },
      { file: "scripts/example.mjs", line: 2, value: "config/knip.config.ts" },
    ]);
  });

  it("captures root tsconfig and knip literals", () => {
    const source = `args: ["--tsconfig", "tsconfig.oxlint.core.json"], config: "knip.config.ts"`;

    expect(extractConfigRefs(source, "scripts/example.mjs").map((ref) => ref.value)).toEqual([
      "tsconfig.oxlint.core.json",
      "knip.config.ts",
    ]);
  });

  it("ignores module specifiers and temp-file basenames", () => {
    // A broken import already fails loudly at runtime, and run-extension-oxlint
    // legitimately synthesizes path.join(tempDir, "oxlint.json"). Matching either
    // would make the gate demand edits to working code.
    const source = [
      `import { runShard } from "./lib/run-extension-oxlint.mjs";`,
      `const tempConfigPath = path.join(tempDir, "oxlint.json");`,
      `["scripts/run-oxlint-shards.mjs", ["test/scripts/run-oxlint.test.ts"]],`,
    ].join("\n");

    expect(extractConfigRefs(source, "scripts/example.mjs")).toEqual([]);
  });

  it("ignores comment-only lines so prose about a path is not a finding", () => {
    const source = `  // historically pointed at "config/tsconfig/oxlint.core.json"`;

    expect(extractConfigRefs(source, "scripts/example.mjs")).toEqual([]);
  });

  it("skips literals that resolve relative to a nested package, not the root", () => {
    const source = `{ "extends": "../tsconfig.json" }\nconst canary = "tsconfig.rootdir-canary.json";`;

    expect(extractConfigRefs(source, "scripts/example.mjs")).toEqual([]);
  });
});

describe("findDanglingRefs", () => {
  it("keeps only references whose target is absent", () => {
    const refs = [
      { file: "scripts/a.mjs", line: 1, value: "tsconfig.json" },
      { file: "scripts/a.mjs", line: 2, value: "config/tsconfig/oxlint.core.json" },
    ];
    const exists = (candidate: string) => candidate.endsWith("/tsconfig.json");

    expect(findDanglingRefs(refs, { repoRoot: "/repo", exists })).toEqual([refs[1]]);
  });
});

describe("compareToLedger", () => {
  const ledgerEntry = {
    file: "scripts/lib/local-heavy-check-runtime.mjs",
    line: 92,
    value: "tsconfig.oxlint.json",
    issue: "#3076",
  };

  it("treats an unledgered dangling reference as unreviewed", () => {
    const ref = { file: "scripts/new.mjs", line: 7, value: "config/knip.config.ts" };

    expect(compareToLedger([ref], [ledgerEntry]).unreviewed).toEqual([ref]);
  });

  it("accepts a dangling reference that matches its ledger entry exactly", () => {
    const ref = { file: ledgerEntry.file, line: ledgerEntry.line, value: ledgerEntry.value };
    const result = compareToLedger([ref], [ledgerEntry]);

    expect(result.unreviewed).toEqual([]);
    expect(result.stale).toEqual([]);
  });

  it("reports a paid-off ledger entry as stale so the ledger drains", () => {
    expect(compareToLedger([], [ledgerEntry]).stale).toEqual([ledgerEntry]);
  });

  it("re-reviews a moved callsite from both directions", () => {
    // The ledger pins file:line precisely so relocating the reference cannot
    // silently inherit the exception.
    const moved = { file: ledgerEntry.file, line: 120, value: ledgerEntry.value };
    const result = compareToLedger([moved], [ledgerEntry]);

    expect(result.unreviewed).toEqual([moved]);
    expect(result.stale).toEqual([ledgerEntry]);
  });
});

describe("KNOWN_MISSING_CONFIG_REFS", () => {
  it("requires a tracking issue on every entry — it is a debt ledger, not an escape hatch", () => {
    for (const entry of KNOWN_MISSING_CONFIG_REFS) {
      expect(entry.issue, `${entry.file}:${entry.line}`).toMatch(/^#\d+$/u);
    }
  });
});
