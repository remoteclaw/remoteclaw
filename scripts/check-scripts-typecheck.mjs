#!/usr/bin/env node
// Typechecks scripts/ and enforces the result against a checked-in baseline.
//
// `tsconfig.json` includes only src/ ui/ extensions/ packages/, so nothing under
// scripts/ has ever been typechecked — 111 TypeScript files of release checks,
// CI helpers, catalog and inventory generators and build-entry computation, all
// outside every gate (#3076). Two defects landed there invisibly in the last
// upstream sync and were caught by hand.
//
// `scripts/tsconfig.json` already existed and is correctly shaped; it was simply
// referenced by nothing. This gate runs it and, because the accumulated backlog
// is 69 errors across 32 files, compares the result to
// `.scripts-typecheck-baseline` instead of demanding zero. New errors fail;
// grandfathered ones do not. That is the same debt-ledger discipline as
// `.throwing-stub-callers-allowlist` and `vitest.quarantine.ts` — and, like
// those, the ledger is meant to shrink: fixing an error without dropping its
// baseline line also fails, so the file cannot silently outlive its debt.
//
// Imports are kept in oxfmt's sort order so the formatter does not hoist one
// above this header and split it.
//
// Regenerate after an intentional change:  node scripts/check-scripts-typecheck.mjs --update
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Project consumed by the scripts/ typecheck lane.
 */
export const SCRIPTS_TSCONFIG = "scripts/tsconfig.json";
/**
 * Checked-in debt ledger for the scripts/ typecheck lane.
 */
export const BASELINE_FILE = ".scripts-typecheck-baseline";

const BASELINE_HEADER = [
  "# Baseline for `pnpm typecheck:scripts` (scripts/check-scripts-typecheck.mjs).",
  "#",
  "# Pre-existing scripts/ typecheck errors, grandfathered so the lane can be",
  "# required-and-green while still failing on NEW breakage. This is a debt",
  "# ledger, not an escape hatch: shrink it by fixing errors and deleting their",
  "# lines. Regenerate with: node scripts/check-scripts-typecheck.mjs --update",
  "#",
  "# Format: <count><TAB><file><TAB><TS code><TAB><message>",
  "# Source positions are deliberately omitted so unrelated edits above an error",
  "# do not churn the ledger.",
].join("\n");

// tsc/tsgo diagnostic line: `path/to/file.ts(12,34): error TS2307: message`.
const DIAGNOSTIC_PATTERN =
  /^(?<file>[^(]+)\((?<line>\d+),(?<column>\d+)\): error (?<code>TS\d+): (?<message>.*)$/u;

function normalizeRepoPath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//u, "");
}

/**
 * Strips machine-specific absolute paths out of a diagnostic message.
 *
 * tsgo spells resolution failures with absolute paths (including pnpm's
 * content-addressed `node_modules/.pnpm/<pkg>@<version>/...` segments), which
 * would pin the ledger to one checkout and one lockfile state, so it could
 * never match on CI.
 */
export function normalizeMessage(message, repoRoot = REPO_ROOT) {
  const normalizedRoot = normalizeRepoPath(repoRoot).replace(/\/$/u, "");
  return normalizeRepoPath(message)
    .replaceAll(`${normalizedRoot}/`, "")
    .replace(/node_modules\/\.pnpm\/[^/]+\//gu, "node_modules/.pnpm/<pkg>/")
    .trim();
}

/**
 * Parses tsgo diagnostics into `{ file, code, message }` records.
 *
 * Only diagnostics whose file lives under `scripts/` are kept: everything the
 * project pulls in transitively (src/, extensions/, packages/) already has its
 * own typecheck via the root `tsconfig.json`, and recording it here would make
 * this ledger fail for reasons that are not this lane's to enforce.
 *
 * Indented continuation lines (overload/assignability detail) are dropped: they
 * restate the same defect and would make the ledger churn on unrelated type
 * changes elsewhere in the graph.
 */
export function parseDiagnostics(output, { repoRoot = REPO_ROOT } = {}) {
  const diagnostics = [];
  for (const line of output.split("\n")) {
    const match = DIAGNOSTIC_PATTERN.exec(line.trimEnd());
    if (!match?.groups) {
      continue;
    }
    const file = normalizeRepoPath(match.groups.file);
    if (!file.startsWith("scripts/")) {
      continue;
    }
    diagnostics.push({
      file,
      code: match.groups.code,
      message: normalizeMessage(match.groups.message, repoRoot),
    });
  }
  return diagnostics;
}

function signatureOf(diagnostic) {
  return `${diagnostic.file}\t${diagnostic.code}\t${diagnostic.message}`;
}

/**
 * Counts diagnostics per normalized signature.
 */
export function summarize(diagnostics) {
  const counts = new Map();
  for (const diagnostic of diagnostics) {
    const signature = signatureOf(diagnostic);
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  return counts;
}

/**
 * Renders a signature-count map as baseline file content.
 */
export function renderBaseline(counts) {
  const lines = [...counts.entries()]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([signature, count]) => `${count}\t${signature}`);
  return `${BASELINE_HEADER}\n${lines.join("\n")}\n`;
}

/**
 * Parses baseline file content into a signature-count map.
 */
export function parseBaseline(content) {
  const counts = new Map();
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const tabIndex = line.indexOf("\t");
    const count = Number(line.slice(0, tabIndex));
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error(`Malformed ${BASELINE_FILE} line: ${rawLine}`);
    }
    counts.set(line.slice(tabIndex + 1), count);
  }
  return counts;
}

/**
 * Compares observed diagnostics to the baseline in both directions.
 */
export function compareToBaseline(observed, baseline) {
  const regressions = [];
  const resolved = [];

  for (const [signature, count] of observed) {
    const allowed = baseline.get(signature) ?? 0;
    if (count > allowed) {
      regressions.push({ signature, count, allowed });
    }
  }
  for (const [signature, allowed] of baseline) {
    const count = observed.get(signature) ?? 0;
    if (count < allowed) {
      resolved.push({ signature, count, allowed });
    }
  }

  return { regressions, resolved };
}

/**
 * Runs tsgo over `scripts/tsconfig.json` and returns its combined output.
 *
 * Goes through `scripts/run-tsgo.mjs` rather than the tsgo binary so the lane
 * honours repo-local runtime behaviour and the heavy-check lock, per
 * scripts/CLAUDE.md § Wrapper Rules.
 */
export function runScriptsTypecheck({ repoRoot = REPO_ROOT } = {}) {
  const result = spawnSync(
    process.execPath,
    [path.resolve(repoRoot, "scripts", "run-tsgo.mjs"), "--noEmit", "-p", SCRIPTS_TSCONFIG],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );

  if (result.error) {
    throw result.error;
  }
  return {
    output: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    status: result.status ?? 1,
  };
}

function formatSignature(signature) {
  const [file, code, message] = signature.split("\t");
  return `${file} — ${code}: ${message}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const shouldUpdate = process.argv.includes("--update");
  const baselinePath = path.resolve(REPO_ROOT, BASELINE_FILE);
  const { output, status } = runScriptsTypecheck();
  const observed = summarize(parseDiagnostics(output));

  // tsgo exits non-zero for both "found type errors" and "could not run at all"
  // (bad project path, crash). Only the first is expected here; distinguishing
  // them keeps a broken invocation from being read as a clean baseline.
  if (status !== 0 && observed.size === 0) {
    console.error(`Typecheck of ${SCRIPTS_TSCONFIG} failed without producing diagnostics:\n`);
    console.error(output.trim());
    process.exitCode = 1;
  } else if (shouldUpdate) {
    fs.writeFileSync(baselinePath, renderBaseline(observed));
    const total = [...observed.values()].reduce((sum, count) => sum + count, 0);
    console.log(
      `[typecheck:scripts] wrote ${BASELINE_FILE}: ${observed.size} signature(s), ${total} error(s).`,
    );
  } else {
    const baseline = parseBaseline(fs.readFileSync(baselinePath, "utf8"));
    const { regressions, resolved } = compareToBaseline(observed, baseline);

    for (const entry of regressions) {
      console.error(
        `NEW scripts/ typecheck error (${entry.count} occurrence(s), baseline allows ` +
          `${entry.allowed}): ${formatSignature(entry.signature)}`,
      );
    }
    for (const entry of resolved) {
      console.error(
        `STALE ${BASELINE_FILE} entry (baseline allows ${entry.allowed}, now ${entry.count}): ` +
          formatSignature(entry.signature),
      );
    }

    if (regressions.length > 0 || resolved.length > 0) {
      console.error(
        `\nRun \`node scripts/check-scripts-typecheck.mjs --update\` to refresh ${BASELINE_FILE} ` +
          `after fixing errors. Do not refresh it to absorb a new one.`,
      );
      process.exitCode = 1;
    } else {
      const total = [...observed.values()].reduce((sum, count) => sum + count, 0);
      console.log(
        `[typecheck:scripts] ${SCRIPTS_TSCONFIG} matches ${BASELINE_FILE} ` +
          `(${observed.size} signature(s), ${total} grandfathered error(s)).`,
      );
    }
  }
}
