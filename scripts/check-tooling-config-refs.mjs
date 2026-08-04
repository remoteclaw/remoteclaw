#!/usr/bin/env node
// Fails when repo tooling references a config file that does not exist.
//
// Upstream OpenClaw keeps its tooling configs under `config/`; this fork keeps
// them at the repo root. Several scripts were ported with the upstream paths
// intact, so they pointed at `config/tsconfig/oxlint.*.json` and
// `config/knip.config.ts` — neither of which exists here. Nothing noticed,
// because every affected script was itself invoked by no package script and no
// workflow (#3076). A dangling config path is the quietest way for a gate to
// stop gating: the script still exists, its CI job name still reads
// authoritative, and the path from it to an enforcing run is broken invisibly.
//
// This gate closes that loop mechanically: every config-file path literal in
// the repo's own tooling must resolve to a real file.
//
// Reviewed exceptions live on KNOWN_MISSING_CONFIG_REFS below, pinned to
// `file:line` so a moved callsite re-fails the gate and gets re-reviewed rather
// than silently inheriting its exception (same discipline as the ledger in
// scripts/check-no-raw-channel-fetch.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Directories scanned for config-path literals.
 */
export const SCAN_DIRS = ["scripts"];

const SCAN_FILE_PATTERN = /\.(?:mjs|cjs|js|ts)$/u;
const SKIP_DIR_NAMES = new Set(["node_modules", "dist", "__snapshots__"]);

// This gate's own ledger below quotes the very literals it reports, so scanning
// it would make every reviewed exception look like a fresh callsite.
const SELF_RELATIVE_PATH = "scripts/check-tooling-config-refs.mjs";

// Config-file path literals this gate resolves. Deliberately narrow — it must
// match tooling *config files* and nothing else, because the cost of a false
// positive is a contributor editing working code to satisfy a lint:
//
//   - anything under `config/`  — the upstream config directory this fork does
//     not have, which is the root cause the gate exists for
//   - a `tsconfig*.json` basename
//   - a `knip.config.ts` basename
//   - an `.oxlintrc*.json` basename
//
// Notably absent: bare `oxlint*.json` (`run-extension-oxlint.mjs` legitimately
// synthesizes `path.join(tempDir, "oxlint.json")`), `*.mjs`/`*.ts` module
// specifiers (a broken import already fails loudly at runtime), and `*.test.ts`
// paths (owned by the test-projects mapping, not by config resolution).
const CONFIG_LITERAL_PATTERN = new RegExp(
  String.raw`(?<quote>["'])(?<value>` +
    [
      String.raw`config\/[A-Za-z0-9_./-]+`,
      String.raw`(?:[A-Za-z0-9_./-]*\/)?tsconfig[A-Za-z0-9_.-]*\.json`,
      String.raw`(?:[A-Za-z0-9_./-]*\/)?knip\.config\.ts`,
      String.raw`(?:[A-Za-z0-9_./-]*\/)?\.oxlintrc[A-Za-z0-9_.-]*\.json`,
    ].join("|") +
    String.raw`)\k<quote>`,
  "gu",
);

// Path literals that are legitimately not resolvable from the repo root:
// generated at runtime, or resolved relative to a nested package. Matched by
// exact literal value.
const NON_ROOT_RELATIVE_LITERALS = new Set([
  // Written into a temp/extension workspace by the boundary canary itself.
  "tsconfig.rootdir-canary.json",
  // Resolved relative to a nested extension/package directory, not the root.
  "../tsconfig.json",
  "./tsconfig.json",
  "../tsconfig.package-boundary.base.json",
]);

/**
 * Reviewed dangling config references, pinned to `file:line`.
 *
 * This is a debt ledger, not an escape hatch: every entry needs a tracking
 * issue and a note saying why the reference is not simply corrected.
 */
export const KNOWN_MISSING_CONFIG_REFS = [
  {
    // #3076. `applyLocalOxlintPolicy` injects `--tsconfig tsconfig.oxlint.json`
    // into LOCAL oxlint runs; no such root config exists, and oxlint exits 1 on
    // it — a loud failure, not a silent one. Repointing it at one of the three
    // sharded configs (core/extensions/scripts) changes local type-aware lint
    // scope for every wrapper caller, which is a behaviour change with
    // unmeasured blast radius and is out of scope for the gate-wiring fix.
    file: "scripts/lib/local-heavy-check-runtime.mjs",
    line: 92,
    value: "tsconfig.oxlint.json",
    issue: "#3076",
  },
  {
    // #3096. `packages/plugin-sdk/` does not exist in this fork — the plugin SDK
    // lives at `src/plugin-sdk/` and builds through `tsconfig.plugin-sdk.dts.json`.
    // The package-flavoured second copy is upstream residue, and its absence
    // makes `prepare-extension-package-boundary-artifacts.mjs` exit 1 on its
    // first step, which breaks every oxlint wrapper that calls it. Not repaired
    // here: `extensions/tsconfig.package-boundary.paths.json` maps 360+ entries
    // into `packages/plugin-sdk/dist/`, so this is a broken subsystem to
    // reconstruct or excise, not a path typo.
    file: "scripts/prepare-extension-package-boundary-artifacts.mjs",
    line: 144,
    value: "packages/plugin-sdk/tsconfig.json",
    issue: "#3096",
  },
  {
    // #3096. Same missing project, consumed as the tsgo `-p` argument.
    file: "scripts/prepare-extension-package-boundary-artifacts.mjs",
    line: 734,
    value: "packages/plugin-sdk/tsconfig.json",
    issue: "#3096",
  },
];

function listScannableFiles(dirPath) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIR_NAMES.has(entry.name)) {
        results.push(...listScannableFiles(entryPath));
      }
      continue;
    }
    if (entry.isFile() && SCAN_FILE_PATTERN.test(entry.name)) {
      results.push(entryPath);
    }
  }
  return results;
}

/**
 * Extracts config-path literals with their 1-based line numbers.
 */
export function extractConfigRefs(source, relativeFile) {
  const refs = [];
  const lines = source.split("\n");
  for (const [index, line] of lines.entries()) {
    // A `//`-only line is commentary (this file's own header, for one) and must
    // not seed findings; inline trailing comments stay in scope deliberately.
    if (line.trimStart().startsWith("//")) {
      continue;
    }
    for (const match of line.matchAll(CONFIG_LITERAL_PATTERN)) {
      const value = match.groups?.value;
      if (!value || NON_ROOT_RELATIVE_LITERALS.has(value)) {
        continue;
      }
      refs.push({ file: relativeFile, line: index + 1, value });
    }
  }
  return refs;
}

/**
 * Returns refs whose target does not exist, relative to the repo root.
 */
export function findDanglingRefs(refs, { repoRoot = REPO_ROOT, exists = fs.existsSync } = {}) {
  return refs.filter((ref) => !exists(path.resolve(repoRoot, ref.value)));
}

function ledgerKey(entry) {
  return `${entry.file}:${entry.line}:${entry.value}`;
}

/**
 * Compares dangling refs against the reviewed ledger.
 */
export function compareToLedger(danglingRefs, ledger = KNOWN_MISSING_CONFIG_REFS) {
  const ledgerKeys = new Set(ledger.map(ledgerKey));
  const seenKeys = new Set(danglingRefs.map(ledgerKey));
  return {
    unreviewed: danglingRefs.filter((ref) => !ledgerKeys.has(ledgerKey(ref))),
    stale: ledger.filter((entry) => !seenKeys.has(ledgerKey(entry))),
  };
}

/**
 * Runs the gate and returns a `{ ok, messages }` result.
 */
export function checkToolingConfigRefs({ repoRoot = REPO_ROOT, scanDirs = SCAN_DIRS } = {}) {
  const refs = [];
  for (const scanDir of scanDirs) {
    for (const filePath of listScannableFiles(path.resolve(repoRoot, scanDir))) {
      const relativeFile = path.relative(repoRoot, filePath).replaceAll("\\", "/");
      if (relativeFile === SELF_RELATIVE_PATH) {
        continue;
      }
      refs.push(...extractConfigRefs(fs.readFileSync(filePath, "utf8"), relativeFile));
    }
  }

  const { unreviewed, stale } = compareToLedger(findDanglingRefs(refs, { repoRoot }));
  const messages = [];

  for (const ref of unreviewed) {
    messages.push(
      `${ref.file}:${ref.line} references "${ref.value}", which does not exist. ` +
        `Point it at the real config file, or add a reviewed entry (with a tracking issue) ` +
        `to KNOWN_MISSING_CONFIG_REFS in scripts/check-tooling-config-refs.mjs.`,
    );
  }
  for (const entry of stale) {
    messages.push(
      `KNOWN_MISSING_CONFIG_REFS entry ${entry.file}:${entry.line} ("${entry.value}") no longer ` +
        `matches a dangling reference. Remove the ledger entry — it is debt that has been paid, ` +
        `or the callsite moved and needs re-review.`,
    );
  }

  return { ok: messages.length === 0, messages, scannedRefCount: refs.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkToolingConfigRefs();
  if (!result.ok) {
    console.error("Dangling tooling config references detected:\n");
    for (const message of result.messages) {
      console.error(`  - ${message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `[tooling-config-refs] ${result.scannedRefCount} config references checked; all resolve ` +
        `(${KNOWN_MISSING_CONFIG_REFS.length} reviewed exception(s)).`,
    );
  }
}
