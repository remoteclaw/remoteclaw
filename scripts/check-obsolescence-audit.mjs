#!/usr/bin/env node

/**
 * Post-sync obsolescence audit gate — detects semantically dead code patterns
 * that indicate upstream sync regressions or unfinished gutting work.
 *
 * Four detection categories:
 *
 *   1. Stub signatures: files containing the "Gutted in RemoteClaw fork" header
 *      marker. These are intentionally gutted files retained as no-op exports.
 *      Growth indicates a sync re-introduced a gutted file and someone added a
 *      new stub rather than deleting the file.
 *
 *   2. Dead caller chains: stubs whose only importers are test files or other
 *      stubs. These form closed cycles of dead code — the stub exists to keep
 *      callers compiling, but no production code path reaches them.
 *
 *   3. Decorative wiring: known patterns where values flow through the pipeline
 *      but the destination type has no corresponding field. Values are computed
 *      and threaded but have zero observable effect.
 *
 *   4. Broken contracts: known patterns where a registration API is called but
 *      no dispatch path reads from the registry. Callers succeed silently but
 *      the registered capability is never invoked.
 *
 * Rules 1–2 are automatically detected via static analysis. Rules 3–4 use a
 * curated manifest of known instances (scripts/data/obsolescence-known-patterns.json).
 *
 * Data files:
 *   scripts/data/obsolescence-known-patterns.json — manifest of known decorative
 *     wiring and broken contract instances
 *   .obsolescence-baseline — expected total finding count (stubs + known patterns)
 *
 * Reference: ADR 0005 H6
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  collectTypeScriptFilesFromRoots,
  isTestLikeTypeScriptFile,
  resolveSourceRoots,
  runAsScript,
} from "./lib/ts-guard-utils.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STUB_HEADER_MARKER = "Gutted in RemoteClaw fork";
const sourceRoots = ["src", "extensions"];

// resolveRepoRoot goes up 2 levels (designed for scripts/lib/). Scripts in
// scripts/ only need 1 level up, so resolve the repo root directly.
function resolveRepoRootFromScript(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "..");
}

// ---------------------------------------------------------------------------
// Rule 1: Stub signature detection
// ---------------------------------------------------------------------------

function isStubFile(content) {
  return content.includes(STUB_HEADER_MARKER);
}

// ---------------------------------------------------------------------------
// Rule 2: Dead caller chain detection
// ---------------------------------------------------------------------------

/**
 * Extract all import/export specifiers from a TypeScript file.
 * Returns an array of raw specifier strings (e.g., "../agents/foo").
 */
function extractImportSpecifiers(content, fileName) {
  const sourceFile = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true);
  const specifiers = [];

  const visit = (node) => {
    // Static import: import { x } from "specifier"
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push(node.moduleSpecifier.text);
    }

    // Re-export: export { x } from "specifier"
    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    }

    // Dynamic import: import("specifier")
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }

    // Import type: typeof import("specifier")
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      specifiers.push(node.argument.literal.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return specifiers;
}

/**
 * Resolve a relative import specifier to a repo-relative file path.
 * Tries .ts and /index.ts suffixes. Returns null for non-relative or
 * unresolvable specifiers.
 */
function resolveSpecifierToRelPath(repoRoot, importerAbsPath, specifier) {
  if (!specifier.startsWith(".")) {
    return null;
  }

  const importerDir = path.dirname(importerAbsPath);
  const resolved = path.resolve(importerDir, specifier);

  // Strip .js/.mjs extension if present (TypeScript source uses .js in specifiers).
  const base = resolved.replace(/\.[cm]?js$/, "");

  // Try direct .ts, .tsx, then /index.ts, /index.tsx.
  const candidates = [
    base + ".ts",
    base + ".tsx",
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    const rel = path.relative(repoRoot, candidate).replaceAll(path.sep, "/");
    // Only accept paths within source roots.
    if (rel.startsWith("src/") || rel.startsWith("extensions/")) {
      return rel;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Rules 3+4: Known pattern detection
// ---------------------------------------------------------------------------

async function loadKnownPatterns(repoRoot) {
  const manifestPath = path.join(repoRoot, "scripts", "data", "obsolescence-known-patterns.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    if (!Array.isArray(manifest.patterns)) {
      console.error("Error: obsolescence-known-patterns.json missing 'patterns' array.");
      process.exit(1);
    }
    return manifest.patterns;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      // No manifest yet — rules 3+4 produce zero findings.
      return [];
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Baseline
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
// Main
// ---------------------------------------------------------------------------

export async function main() {
  const repoRoot = resolveRepoRootFromScript(import.meta.url);
  let hasFailure = false;

  // Collect all TypeScript files (including tests for caller chain analysis).
  const roots = resolveSourceRoots(repoRoot, sourceRoots);
  const allFiles = await collectTypeScriptFilesFromRoots(roots, {
    includeTests: true,
  });

  // --- Pass 1: Read all files, identify stubs, collect import edges ---
  const stubPaths = new Set();
  // stubImporters: stub relPath → Set<importer relPath>
  const stubImporters = new Map();

  // First pass: identify stubs.
  const fileContents = new Map();
  for (const filePath of allFiles) {
    const relPath = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
    const content = await fs.readFile(filePath, "utf8");
    fileContents.set(relPath, { absPath: filePath, content });

    if (isStubFile(content)) {
      stubPaths.add(relPath);
      stubImporters.set(relPath, new Set());
    }
  }

  // Second pass: resolve imports and build reverse map for stubs.
  for (const [relPath, { absPath, content }] of fileContents) {
    const specifiers = extractImportSpecifiers(content, absPath);
    for (const spec of specifiers) {
      const targetRel = resolveSpecifierToRelPath(repoRoot, absPath, spec);
      if (targetRel && stubPaths.has(targetRel) && targetRel !== relPath) {
        stubImporters.get(targetRel).add(relPath);
      }
    }
  }

  // --- Rule 1: Stub signature findings ---
  const sortedStubs = [...stubPaths].toSorted((a, b) => a.localeCompare(b));

  // --- Rule 2: Dead caller chain analysis ---
  const deadChainFindings = [];

  for (const stubPath of sortedStubs) {
    const importers = stubImporters.get(stubPath);
    if (!importers || importers.size === 0) {
      deadChainFindings.push({
        path: stubPath,
        reason: "zero callers",
      });
      continue;
    }

    // Classify importers: test, stub, or production.
    const importerList = [...importers];
    const productionCallers = importerList.filter(
      (f) => !isTestLikeTypeScriptFile(f) && !stubPaths.has(f),
    );

    if (productionCallers.length === 0) {
      deadChainFindings.push({
        path: stubPath,
        reason: `all ${importerList.length} caller(s) are tests or stubs`,
      });
    }
  }

  // --- Rules 3+4: Known pattern detection ---
  const knownPatterns = await loadKnownPatterns(repoRoot);
  const patternFindings = [];

  for (const pattern of knownPatterns) {
    const filePath = path.join(repoRoot, pattern.file);
    try {
      const content = await fs.readFile(filePath, "utf8");
      if (content.includes(pattern.identifier)) {
        patternFindings.push({
          category: pattern.category,
          file: pattern.file,
          identifier: pattern.identifier,
          description: pattern.description,
        });
      }
    } catch {
      // File doesn't exist — pattern was resolved. Good.
    }
  }

  // --- Totals ---
  // Stubs are the primary count. Known patterns add to the total.
  // Dead chains are a subset of stubs (reported but not double-counted).
  const totalFindings = sortedStubs.length + patternFindings.length;
  const baseline = await readBaseline(repoRoot, ".obsolescence-baseline");

  // --- Output ---
  console.log(
    `Post-sync obsolescence audit: ${totalFindings} total findings ` +
      `(${sortedStubs.length} stubs + ${patternFindings.length} known patterns), ` +
      `baseline ${baseline}.\n`,
  );

  // Rule 1: Stub inventory.
  const deadChainPaths = new Set(deadChainFindings.map((f) => f.path));
  console.log(`--- Rule 1: Stub signatures (${sortedStubs.length}) ---\n`);
  for (const s of sortedStubs) {
    const marker = deadChainPaths.has(s) ? " [dead chain]" : "";
    console.log(`  ${s}${marker}`);
  }
  console.log();

  // Rule 2: Dead caller chain summary.
  console.log(
    `--- Rule 2: Dead caller chains (${deadChainFindings.length} of ${sortedStubs.length} stubs) ---\n`,
  );
  if (deadChainFindings.length > 0) {
    for (const f of deadChainFindings) {
      console.log(`  ${f.path}  (${f.reason})`);
    }
  } else {
    console.log("  (none — all stubs have production callers)");
  }
  console.log();

  // Rules 3+4: Known patterns.
  if (knownPatterns.length > 0) {
    console.log(
      `--- Rules 3+4: Known patterns (${patternFindings.length} active of ${knownPatterns.length} tracked) ---\n`,
    );
    if (patternFindings.length > 0) {
      for (const f of patternFindings) {
        console.log(`  [${f.category}] ${f.file}: ${f.description}`);
      }
    } else {
      console.log("  (all known patterns resolved)");
    }
    console.log();
  }

  // --- Gate check ---
  if (totalFindings > baseline) {
    console.error(
      `FAIL: Obsolescence finding count grew: ${totalFindings} > baseline ${baseline}.\n\n` +
        "New findings indicate sync regressions or unfinished gut work.\n" +
        "Investigate each new finding and either:\n" +
        "  1. Fix the regression (delete/rewire the dead code)\n" +
        "  2. If the finding is tracked debt, update .obsolescence-baseline\n" +
        "     and justify the increase in your PR description\n\n" +
        "Reference: ADR 0005 H6\n",
    );
    hasFailure = true;
  } else if (totalFindings < baseline) {
    console.log(
      `Obsolescence debt decreased: ${totalFindings} < baseline ${baseline}. ` +
        `Update .obsolescence-baseline to ${totalFindings} to lock in the improvement.\n`,
    );
  } else {
    console.log(`Obsolescence audit passed: ${totalFindings} == baseline ${baseline}.\n`);
  }

  if (hasFailure) {
    process.exit(1);
  }
}

runAsScript(import.meta.url, main);
