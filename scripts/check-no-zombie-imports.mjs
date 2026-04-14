#!/usr/bin/env node

/**
 * Zombie-import gate — prevents imports from gutted modules and detects
 * tombstoned files that should not exist on disk.
 *
 * Three enforcement mechanisms:
 *   1. Import scan: detects imports from dead module patterns (derived from
 *      tombstone manifest + hardcoded fallback patterns)
 *   2. Tombstone existence scan: fails if tombstoned files exist on disk
 *      beyond the baselined count (prevents re-introductions)
 *   3. Allowlist growth prevention: fails if the allowlist grows beyond
 *      the baselined count (declining debt register)
 *
 * Data files:
 *   scripts/data/tombstones.json           — generated from HQ disposition registry
 *   scripts/data/zombie-import-allowlist.json — tracked legacy callsites
 *   .zombie-tombstone-baseline             — expected count of existing tombstoned files
 *   .zombie-import-allowlist-baseline      — expected count of allowlisted callsites
 *
 * Reference: ADR 0005 H3 (engineering/decisions/0005-fork-sync-hardening.md)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  collectTypeScriptFilesFromRoots,
  resolveSourceRoots,
  runAsScript,
  toLine,
} from "./lib/ts-guard-utils.mjs";

// Resolve repo root from scripts/ (one level up).
function resolveRepoRootFromScript(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

// Fallback dead module patterns for directories/namespaces not covered by
// individual tombstone file paths. These catch imports from dead directories
// where stub files may still exist but should not be imported.
const fallbackDeadModulePatterns = [
  "agents/model-catalog",
  "agents/model-fallback",
  "agents/model-selection",
  "agents/skills",
  "agents/sandbox",
  "memory/",
  "acp/control-plane",
  "acp/runtime",
];

const sourceRoots = ["src", "extensions"];

// ---------------------------------------------------------------------------
// Tombstone manifest loading
// ---------------------------------------------------------------------------

async function loadTombstoneManifest(repoRoot) {
  const manifestPath = path.join(repoRoot, "scripts", "data", "tombstones.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    if (!Array.isArray(manifest.tombstones)) {
      console.error("Error: tombstones.json missing 'tombstones' array.");
      process.exit(1);
    }
    return manifest.tombstones;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.error(
        "Error: scripts/data/tombstones.json not found.\n" +
          "Generate it from HQ: node scripts/generate-tombstone-manifest.mjs --output scripts/data/tombstones.json",
      );
      process.exit(1);
    }
    throw error;
  }
}

// Derive module patterns from tombstone file paths.
// e.g. "src/agents/pi-embedded.ts" → "agents/pi-embedded"
function deriveModulePatterns(tombstones) {
  const patterns = new Set();
  for (const filePath of tombstones) {
    let pattern = filePath;
    // Strip src/ prefix.
    if (pattern.startsWith("src/")) {
      pattern = pattern.slice(4);
    }
    // Strip .ts extension.
    if (pattern.endsWith(".ts")) {
      pattern = pattern.slice(0, -3);
    }
    // Strip /index suffix (bare directory imports resolve to index).
    if (pattern.endsWith("/index")) {
      patterns.add(pattern.slice(0, -6));
    }
    patterns.add(pattern);
  }
  return [...patterns];
}

// Build combined dead module patterns from tombstones + fallbacks.
function buildDeadModulePatterns(tombstonePatterns) {
  const combined = new Set([...tombstonePatterns, ...fallbackDeadModulePatterns]);
  return [...combined];
}

// ---------------------------------------------------------------------------
// Allowlist loading
// ---------------------------------------------------------------------------

async function loadAllowlist(repoRoot) {
  const allowlistPath = path.join(repoRoot, "scripts", "data", "zombie-import-allowlist.json");
  try {
    const raw = await fs.readFile(allowlistPath, "utf8");
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) {
      console.error("Error: zombie-import-allowlist.json must be a JSON array.");
      process.exit(1);
    }
    // Validate structure.
    for (const entry of entries) {
      if (!entry.callsite || !entry.issue) {
        console.error(
          `Error: allowlist entry missing required fields (callsite, issue): ${JSON.stringify(entry)}`,
        );
        process.exit(1);
      }
    }
    return entries;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Baseline reading
// ---------------------------------------------------------------------------

async function readBaseline(repoRoot, fileName) {
  const baselinePath = path.join(repoRoot, fileName);
  try {
    const raw = (await fs.readFile(baselinePath, "utf8")).trim();
    const value = parseInt(raw, 10);
    if (Number.isNaN(value)) {
      console.error(`Error: ${fileName} contains non-numeric value: ${raw}`);
      process.exit(1);
    }
    return value;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.error(
        `Error: ${fileName} not found.\n` +
          `Create it with the current count: echo <count> > ${fileName}`,
      );
      process.exit(1);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Import scanning (preserved from original gate)
// ---------------------------------------------------------------------------

function makeIsDeadModuleSpecifier(deadModulePatterns) {
  return (specifierText) => deadModulePatterns.some((pattern) => specifierText.includes(pattern));
}

export function findZombieImportLines(content, fileName, isDeadModuleSpecifier) {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const lines = [];

  const visit = (node) => {
    // Static import: import { x } from "dead/module"
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isDeadModuleSpecifier(node.moduleSpecifier.text)
    ) {
      lines.push(toLine(sourceFile, node.moduleSpecifier));
    }

    // Re-export: export { x } from "dead/module"
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      isDeadModuleSpecifier(node.moduleSpecifier.text)
    ) {
      lines.push(toLine(sourceFile, node.moduleSpecifier));
    }

    // Dynamic import: import("dead/module")
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0]) &&
      isDeadModuleSpecifier(node.arguments[0].text)
    ) {
      lines.push(toLine(sourceFile, node.arguments[0]));
    }

    // Import type: typeof import("dead/module")
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal) &&
      isDeadModuleSpecifier(node.argument.literal.text)
    ) {
      lines.push(toLine(sourceFile, node.argument.literal));
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return lines;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function main() {
  const repoRoot = resolveRepoRootFromScript(import.meta.url);
  let hasFailure = false;

  // --- Load data files ---
  const tombstones = await loadTombstoneManifest(repoRoot);
  const tombstonePatterns = deriveModulePatterns(tombstones);
  const deadModulePatterns = buildDeadModulePatterns(tombstonePatterns);
  const isDeadModuleSpecifier = makeIsDeadModuleSpecifier(deadModulePatterns);

  const allowlistEntries = await loadAllowlist(repoRoot);
  const allowedCallsites = new Set(allowlistEntries.map((e) => e.callsite));

  const tombstoneBaseline = await readBaseline(repoRoot, ".zombie-tombstone-baseline");
  const allowlistBaseline = await readBaseline(repoRoot, ".zombie-import-allowlist-baseline");

  console.log(
    `Zombie-import gate: ${tombstones.length} tombstones, ` +
      `${deadModulePatterns.length} patterns (${tombstonePatterns.length} derived + ` +
      `${fallbackDeadModulePatterns.length} fallback), ` +
      `${allowlistEntries.length} allowlisted callsites.\n`,
  );

  // --- 1. Tombstone existence scan ---
  const existingTombstones = [];
  for (const tombPath of tombstones) {
    const fullPath = path.join(repoRoot, tombPath);
    try {
      await fs.access(fullPath);
      existingTombstones.push(tombPath);
    } catch {
      // File doesn't exist — good.
    }
  }

  if (existingTombstones.length > 0) {
    console.log(
      `Tombstone existence scan: ${existingTombstones.length} tombstoned files on disk ` +
        `(baseline ${tombstoneBaseline}):\n`,
    );
    for (const t of existingTombstones.toSorted((a, b) => a.localeCompare(b))) {
      console.log(`  ${t}`);
    }
    console.log();
  }

  if (existingTombstones.length > tombstoneBaseline) {
    console.error(
      `FAIL: Tombstone count grew: ${existingTombstones.length} > baseline ${tombstoneBaseline}.\n\n` +
        "Tombstoned files MUST NOT exist in the fork. They were deleted by prior gut PRs\n" +
        "and should not be re-introduced. See ADR 0005 for context.\n\n" +
        "To fix: delete the re-introduced files and their importers.\n",
    );
    hasFailure = true;
  } else if (existingTombstones.length < tombstoneBaseline) {
    console.log(
      `Tombstone debt decreased: ${existingTombstones.length} < baseline ${tombstoneBaseline}. ` +
        `Update .zombie-tombstone-baseline to ${existingTombstones.length} to lock in the improvement.\n`,
    );
  } else if (existingTombstones.length > 0) {
    console.log(
      `Tombstone existence scan: ${existingTombstones.length} == baseline ${tombstoneBaseline} (tracked as #2356).\n`,
    );
  } else {
    console.log("Tombstone existence scan: clean (0 tombstoned files on disk).\n");
  }

  // --- 2. Allowlist growth check ---
  if (allowlistEntries.length > allowlistBaseline) {
    console.error(
      `FAIL: Allowlist grew: ${allowlistEntries.length} entries > baseline ${allowlistBaseline}.\n\n` +
        "New allowlist entries require a tracked issue reference and justification.\n" +
        "Prefer fixing the zombie import over adding to the allowlist.\n" +
        "If unavoidable: add the entry with an 'issue' field, then update\n" +
        ".zombie-import-allowlist-baseline to the new count.\n",
    );
    hasFailure = true;
  } else if (allowlistEntries.length < allowlistBaseline) {
    console.log(
      `Allowlist debt decreased: ${allowlistEntries.length} < baseline ${allowlistBaseline}. ` +
        `Update .zombie-import-allowlist-baseline to ${allowlistEntries.length} to lock in the improvement.\n`,
    );
  }

  // --- 3. Import scan ---
  const roots = resolveSourceRoots(repoRoot, sourceRoots);
  const files = await collectTypeScriptFilesFromRoots(roots, { includeTests: true });
  const violations = [];

  for (const filePath of files) {
    const relPath = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
    const content = await fs.readFile(filePath, "utf8");
    for (const line of findZombieImportLines(content, filePath, isDeadModuleSpecifier)) {
      const callsite = `${relPath}:${line}`;
      if (allowedCallsites.has(callsite)) {
        continue;
      }
      violations.push(callsite);
    }
  }

  if (violations.length > 0) {
    console.error("FAIL: Found imports from gutted (dead) modules:\n");
    for (const v of violations.toSorted((a, b) => a.localeCompare(b))) {
      console.error(`  ${v}`);
    }
    console.error(
      "\nThese modules have been removed. Update imports to use live replacements.\n" +
        "If the import is a known legacy callsite awaiting cleanup, add it to\n" +
        "scripts/data/zombie-import-allowlist.json with a tracked issue URL,\n" +
        "then increment .zombie-import-allowlist-baseline.\n",
    );
    hasFailure = true;
  } else {
    console.log("Import scan: clean (no unallowed zombie imports found).\n");
  }

  // --- Summary ---
  if (hasFailure) {
    process.exit(1);
  }

  console.log("Zombie-import gate passed.");
}

runAsScript(import.meta.url, main);
