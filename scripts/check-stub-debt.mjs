#!/usr/bin/env node

/**
 * Stub debt gate — prevents @ts-expect-error suppressions from growing.
 *
 * Scans source files for @ts-expect-error comments (the primary fork-sync
 * suppression pattern). Fails CI if the count exceeds the baseline stored
 * in .stub-debt-baseline.
 *
 * To add a legitimate new suppression: increment the number in
 * .stub-debt-baseline and justify the increase in your PR description.
 *
 * Reference: ADR 0005 H5
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectTypeScriptFilesFromRoots,
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

export async function main() {
  const repoRoot = resolveRepoRootFromScript(import.meta.url);
  const roots = resolveSourceRoots(repoRoot, sourceRoots);
  const files = await collectTypeScriptFilesFromRoots(roots, { includeTests: true });

  const occurrences = [];

  for (const filePath of files) {
    const relPath = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");

    // Skip vendored directories.
    if (skipDirs.has(relPath.split("/")[0])) {
      continue;
    }

    const content = await fs.readFile(filePath, "utf8");
    for (const hit of findTsExpectErrors(content)) {
      occurrences.push({ path: relPath, line: hit.line, text: hit.text });
    }
  }

  // Read baseline.
  const baselinePath = path.join(repoRoot, ".stub-debt-baseline");
  let baseline;
  try {
    const raw = (await fs.readFile(baselinePath, "utf8")).trim();
    baseline = parseInt(raw, 10);
    if (Number.isNaN(baseline)) {
      console.error(`Error: .stub-debt-baseline contains non-numeric value: ${raw}`);
      process.exit(1);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.error(
        "Error: .stub-debt-baseline not found.\n" +
          "Create it with the current count: echo " +
          occurrences.length +
          " > .stub-debt-baseline",
      );
      process.exit(1);
    }
    throw error;
  }

  const count = occurrences.length;

  // Always print inventory for auditability.
  if (occurrences.length > 0) {
    console.log(`@ts-expect-error inventory (${count} total, baseline ${baseline}):\n`);
    for (const o of occurrences.toSorted(
      (a, b) => a.path.localeCompare(b.path) || a.line - b.line,
    )) {
      console.log(`  ${o.path}:${o.line}  ${o.text}`);
    }
    console.log();
  }

  if (count > baseline) {
    console.error(
      `FAIL: @ts-expect-error count grew: ${count} > baseline ${baseline}.\n\n` +
        "New suppressions require justification:\n" +
        "  1. Fork-sync stubs MUST have a tracked remediation issue (ADR 0005 H5)\n" +
        "  2. Update .stub-debt-baseline to the new count\n" +
        "  3. Explain the increase in your PR description\n",
    );
    process.exit(1);
  }

  if (count < baseline) {
    console.log(
      `Stub debt decreased: ${count} < baseline ${baseline}. ` +
        `Update .stub-debt-baseline to ${count} to lock in the improvement.`,
    );
  } else {
    console.log(`Stub debt check passed: ${count} == baseline ${baseline}.`);
  }
}

runAsScript(import.meta.url, main);
