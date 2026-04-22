#!/usr/bin/env node

/**
 * Stub debt gate — prevents fork-sync debt from growing silently.
 *
 * Runs two counters in a single pass:
 *
 * 1. `@ts-expect-error` occurrences across `src/`, `extensions/`, and
 *    `ui/` (the primary fork-sync suppression pattern). **Zero tolerance**:
 *    any hit fails the gate. Reference: ADR 0005 H5.
 *
 *    Fix the type mismatch, narrow with `X as unknown as Y` at the call
 *    site, or rework the mock scaffold — do not suppress. See PR #2458
 *    (Bite B of #2354) for the typed-mock pattern applied to `vi.fn<T>()`
 *    / `vi.spyOn` mocks.
 *
 * 2. `vi.mock(...)` calls in test files that target modules under
 *    `src/agents/` or `src/middleware/`. Baseline:
 *    `.fork-boundary-mock-baseline`. Reference: ADR 0005 H8.
 *
 *    Rationale: tests that mock fork-boundary modules can mask production
 *    throwing-stubs — the test exercises the mock while production hits a
 *    broken stub. This is the test-side cause of #2408-class regressions
 *    that H7's AST classifier cannot see (H7 only examines production
 *    code). The baseline creates a friction point at PR time where new
 *    mocks must justify their reason in the PR description. See
 *    CONTRIBUTING.md § Fork-boundary mocks for the three acceptable mock
 *    categories (isolation / performance / stub-placeholder).
 *
 * To bump the H8 baseline: justify in the PR description and update the
 * baseline file to the new count.
 *
 * To ratchet the H8 baseline DOWN: when the counter decreases, the script
 * reports it and tells you to update the baseline to lock in the improvement.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectTypeScriptFilesFromRoots,
  isTestLikeTypeScriptFile,
  resolveSourceRoots,
  runAsScript,
} from "./lib/ts-guard-utils.mjs";

// resolveRepoRoot goes up 2 levels (designed for scripts/lib/). Scripts in
// scripts/ only need 1 level up, so resolve the repo root directly.
function resolveRepoRootFromScript(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

const sourceRoots = ["src", "extensions", "ui"];

// Directories to skip (vendored code, node_modules handled by utility).
const skipDirs = new Set(["vendor"]);

// Test-file suffixes beyond the base set in ts-guard-utils. `.test.ts`,
// `.e2e.test.ts`, and `.live.test.ts` are already matched by the base set
// via the `.test.ts` suffix; `.test-helpers.ts`, `.test-mocks.ts`,
// `.mocks.ts`, and `.e2e-mocks.ts` are test-adjacent files that host
// `vi.mock` fixture setup and must also be scanned for fork-boundary mocks.
const extraTestSuffixes = [".test-helpers.ts", ".test-mocks.ts", ".mocks.ts", ".e2e-mocks.ts"];

// Fork-boundary module prefixes (relative to repo root, forward slashes).
// Mocks of modules under these prefixes are tracked by H8.
const forkBoundaryPrefixes = ["src/agents/", "src/middleware/"];

// Matches `vi.mock("specifier")` and `vi.doMock("specifier")` with any
// quoting style (double, single, or backtick). First capture group is the
// specifier. Does NOT match `vi.mock<T>("specifier")` (generic form —
// currently unused in the codebase; if introduced later, extend the regex
// to consume the type argument before the paren).
const viMockPattern = /vi\.(?:mock|doMock)\s*\(\s*["'`]([^"'`]+)["'`]/g;

function findTsExpectErrors(content) {
  const lines = [];
  const contentLines = content.split("\n");
  for (let i = 0; i < contentLines.length; i++) {
    if (contentLines[i].includes("@ts-expect-error")) {
      lines.push({ line: i + 1, text: contentLines[i].trim() });
    }
  }
  return lines;
}

/**
 * Does the `vi.mock` specifier, resolved relative to the importing test
 * file, land under one of `forkBoundaryPrefixes`?
 *
 * Returns the resolved repo-relative path (NodeNext `.js` extension
 * stripped) or null if the specifier is a bare/package import or resolves
 * outside the fork-boundary prefixes.
 */
function resolveForkBoundaryMock(specifier, testFilePath, repoRoot) {
  if (!specifier.startsWith(".")) {
    return null;
  }
  const base = path.resolve(path.dirname(testFilePath), specifier);
  const stripped = base.replace(/\.m?js$/, "");
  const rel = path.relative(repoRoot, stripped).replaceAll(path.sep, "/");
  return forkBoundaryPrefixes.some((p) => rel.startsWith(p)) ? rel : null;
}

function findForkBoundaryMocks(content, filePath, repoRoot) {
  const hits = [];
  const lines = content.split("\n");
  for (const match of content.matchAll(viMockPattern)) {
    const specifier = match[1];
    const target = resolveForkBoundaryMock(specifier, filePath, repoRoot);
    if (target === null) {
      continue;
    }
    const lineNumber = content.slice(0, match.index).split("\n").length;
    hits.push({
      line: lineNumber,
      specifier,
      target,
      text: lines[lineNumber - 1]?.trim() ?? "",
    });
  }
  return hits;
}

async function readBaseline(baselinePath, counterName, currentCount) {
  try {
    const raw = (await fs.readFile(baselinePath, "utf8")).trim();
    const baseline = parseInt(raw, 10);
    if (Number.isNaN(baseline)) {
      throw new Error(`Baseline file contains non-numeric value: ${raw}`);
    }
    return baseline;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      const rel = path.basename(baselinePath);
      throw new Error(
        `${rel} not found for ${counterName} counter.\n` +
          `Create it with the current count: echo ${currentCount} > ${rel}`,
        { cause: error },
      );
    }
    throw error;
  }
}

function reportCounter({
  name,
  baselineFilename,
  count,
  baseline,
  inventoryHeader,
  inventoryLines,
  failHint,
}) {
  if (count > 0) {
    console.log(`${inventoryHeader} (${count} total, baseline ${baseline}):\n`);
    for (const line of inventoryLines) {
      console.log(`  ${line}`);
    }
    console.log();
  }

  if (count > baseline) {
    console.error(`FAIL: ${name} count grew: ${count} > baseline ${baseline}.\n\n${failHint}`);
    return false;
  }
  if (count < baseline) {
    console.log(
      `${name} decreased: ${count} < baseline ${baseline}. ` +
        `Update ${baselineFilename} to ${count} to lock in the improvement.`,
    );
  } else {
    console.log(`${name} check passed: ${count} == baseline ${baseline}.`);
  }
  return true;
}

export async function main() {
  const repoRoot = resolveRepoRootFromScript(import.meta.url);
  const roots = resolveSourceRoots(repoRoot, sourceRoots);
  const files = await collectTypeScriptFilesFromRoots(roots, { includeTests: true });

  const tsExpectErrors = [];
  const forkBoundaryMocks = [];

  for (const filePath of files) {
    const relPath = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");

    // Skip vendored directories.
    if (skipDirs.has(relPath.split("/")[0])) {
      continue;
    }

    const content = await fs.readFile(filePath, "utf8");

    for (const hit of findTsExpectErrors(content)) {
      tsExpectErrors.push({ path: relPath, ...hit });
    }

    if (isTestLikeTypeScriptFile(filePath, { extraTestSuffixes })) {
      for (const hit of findForkBoundaryMocks(content, filePath, repoRoot)) {
        forkBoundaryMocks.push({ path: relPath, ...hit });
      }
    }
  }

  let allPassed = true;

  // Counter 1: @ts-expect-error — zero tolerance (ADR 0005 H5).
  if (tsExpectErrors.length > 0) {
    const sorted = tsExpectErrors.toSorted(
      (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
    );
    console.log(`@ts-expect-error inventory (${sorted.length} total):\n`);
    for (const hit of sorted) {
      console.log(`  ${hit.path}:${hit.line}  ${hit.text}`);
    }
    console.log();
    const suffix = sorted.length === 1 ? "" : "s";
    console.error(
      `FAIL: stub-debt gate — ${sorted.length} @ts-expect-error ` +
        `suppression${suffix} in src/, extensions/, or ui/.\n\n` +
        "The gate is zero-tolerance: @ts-expect-error is not allowed in\n" +
        "fork-owned or test code. Either:\n" +
        "  1. Fix the underlying type mismatch.\n" +
        "  2. Narrow with `as unknown as T` at the call site (see PR #2457,\n" +
        "     Bite A of #2354, for the cast pattern).\n" +
        "  3. Rework the mock scaffold to properly type the spy (see PR #2458,\n" +
        "     Bite B of #2354, for the `vi.fn<Fn>()` pattern).\n\n" +
        "Reference: ADR 0005 H5.\n",
    );
    allPassed = false;
  } else {
    console.log("stub-debt check passed: 0 @ts-expect-error suppressions.");
  }

  console.log();

  // Counter 2: fork-boundary vi.mock (ADR 0005 H8).
  const mockBaseline = await readBaseline(
    path.join(repoRoot, ".fork-boundary-mock-baseline"),
    "fork-boundary-mock",
    forkBoundaryMocks.length,
  );
  const mockOk = reportCounter({
    name: "fork-boundary-mock",
    baselineFilename: ".fork-boundary-mock-baseline",
    count: forkBoundaryMocks.length,
    baseline: mockBaseline,
    inventoryHeader: "Fork-boundary vi.mock inventory",
    inventoryLines: forkBoundaryMocks
      .toSorted((a, b) => a.path.localeCompare(b.path) || a.line - b.line)
      .map((o) => `${o.path}:${o.line}  vi.mock("${o.specifier}") → ${o.target}`),
    failHint:
      "Tests that mock src/agents/ or src/middleware/ modules can mask\n" +
      "production throwing-stubs (see #2408). New mocks require justification:\n" +
      "  1. Categorize the mock reason in the PR description:\n" +
      "     - isolation: mocking a side-effect-heavy dependency to unit-test logic\n" +
      "     - performance: mocking an expensive real implementation for test speed\n" +
      "     - stub-placeholder: masking a throwing-stub (RED FLAG — open a tracking issue)\n" +
      "  2. Update .fork-boundary-mock-baseline to the new count\n" +
      "  3. Reference ADR 0005 H8 in the PR description if non-obvious\n" +
      "See CONTRIBUTING.md § Fork-boundary mocks for detailed guidance.\n",
  });
  if (!mockOk) {
    allPassed = false;
  }

  if (!allPassed) {
    process.exit(1);
  }
}

runAsScript(import.meta.url, main);
