#!/usr/bin/env node

/**
 * One-shot bootstrap: auto-generate `MODULE_ATTESTATIONS` blocks for every
 * attested module that doesn't already have one.
 *
 * Used exactly once during the H9 rollout (remoteclaw#2437). Can be kept
 * as a maintenance utility for extending the attestation scope to new
 * directories later — idempotent (skips modules that already have a
 * MODULE_ATTESTATIONS block).
 *
 * Auto-classification:
 * - Exports matching the throwing-stub calibration signals (see
 *   check-attestations.mjs § looksLikeThrowingStub) → "stub"
 * - Everything else → "live"
 *
 * "partial" and "deprecated" are NOT auto-detected; the rollout requires
 * human review to identify those cases. This script defaults to "live"
 * and the reviewer upgrades specific entries as needed.
 *
 * Placement: the generated block is inserted immediately after the last
 * `import` statement (or at the top of the file if no imports exist),
 * before any other content.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { looksLikeThrowingStub } from "./lib/throwing-stub-shape.mjs";
import { isTestLikeTypeScriptFile } from "./lib/ts-guard-utils.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const attestedRoot = path.join(repoRoot, "src/agents");

// Matches the suffix list used by check-attestations.mjs so the two scripts
// agree on which files under src/agents/ are attested-production modules.
const extraTestSuffixes = [".test-helpers.ts", ".test-mocks.ts", ".mocks.ts", ".mocks.shared.ts", ".e2e-mocks.ts"];

function classify(entry) {
  return entry.looksLikeStub ? "stub" : "live";
}

function enumerateExports(sourceFile) {
  const exports = [];
  const fullText = sourceFile.text;

  function record({ name, body, parameters, returnType, ownerNode, kind }) {
    exports.push({
      symbol: name,
      kind,
      looksLikeStub: looksLikeThrowingStub({
        body,
        parameters,
        returnType,
        ownerNode,
        fullText,
      }),
    });
  }

  for (const statement of sourceFile.statements) {
    const isExported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (!isExported) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      record({
        name: isDefault ? "default" : statement.name.text,
        body: statement.body,
        parameters: statement.parameters,
        returnType: statement.type,
        ownerNode: statement,
        kind: isDefault ? "default-function" : "function",
      });
      continue;
    }

    if (ts.isClassDeclaration(statement) && statement.name) {
      exports.push({
        symbol: isDefault ? "default" : statement.name.text,
        kind: "class",
        looksLikeStub: false,
      });
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) {
          continue;
        }
        const init = decl.initializer;
        if (!init) {
          continue;
        }
        if (ts.isArrowFunction(init) && init.body) {
          // Arrow body may be a block `() => { ... }` or an expression
          // `() => expr`. Both are runtime functions that need attestation.
          // Only block bodies can match the throwing-stub shape; pass
          // `undefined` for expression bodies so the classifier skips them
          // (falls through to "live" default — reviewer upgrades "partial"
          // if the expression returns a degraded constant).
          record({
            name: decl.name.text,
            body: ts.isBlock(init.body) ? init.body : undefined,
            parameters: init.parameters,
            returnType: init.type,
            ownerNode: statement,
            kind: "arrow",
          });
        } else if (ts.isFunctionExpression(init) && init.body && ts.isBlock(init.body)) {
          record({
            name: decl.name.text,
            body: init.body,
            parameters: init.parameters,
            returnType: init.type,
            ownerNode: statement,
            kind: "function-expression",
          });
        }
      }
      continue;
    }

    if (ts.isExportAssignment(statement) && statement.expression) {
      const expr = statement.expression;
      if (ts.isArrowFunction(expr) && expr.body && ts.isBlock(expr.body)) {
        record({
          name: "default",
          body: expr.body,
          parameters: expr.parameters,
          returnType: expr.type,
          ownerNode: statement,
          kind: "default-function",
        });
      } else if (ts.isFunctionExpression(expr) && expr.body && ts.isBlock(expr.body)) {
        record({
          name: expr.name?.text ?? "default",
          body: expr.body,
          parameters: expr.parameters,
          returnType: expr.type,
          ownerNode: statement,
          kind: "default-function",
        });
      }
      continue;
    }
  }

  return exports;
}

function hasExistingAttestations(sourceFile) {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    const isExported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) {
      continue;
    }
    for (const decl of statement.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === "MODULE_ATTESTATIONS") {
        return true;
      }
    }
  }
  return false;
}

/**
 * Find the character offset of the insertion point: immediately after the
 * last import statement (or at the end of the leading comment block if no
 * imports exist).
 */
function findInsertOffset(sourceFile) {
  let lastImportEnd = null;
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      lastImportEnd = statement.end;
    }
  }
  if (lastImportEnd !== null) {
    return lastImportEnd;
  }
  // No imports: find end of leading block/doc comment if present.
  const fullText = sourceFile.text;
  const ranges = ts.getLeadingCommentRanges(fullText, 0);
  if (ranges && ranges.length > 0) {
    return ranges[ranges.length - 1].end;
  }
  return 0;
}

function renderAttestationBlock(exports) {
  const lines = [
    "",
    "",
    "/**",
    " * Runtime attestation (ADR 0005 H9). Declares the implementation status",
    " * of each runtime export in this module. See CONTRIBUTING.md § Module",
    " * attestations for the category definitions and the convention for",
    " * updating these when sync or rebrand changes the surface.",
    " */",
    "export const MODULE_ATTESTATIONS = {",
  ];
  for (const exp of exports) {
    const category = classify(exp);
    lines.push(`  ${JSON.stringify(exp.symbol)}: ${JSON.stringify(category)},`);
  }
  lines.push("} as const;");
  return lines.join("\n");
}

async function processFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

  if (hasExistingAttestations(sourceFile)) {
    return { status: "skipped-existing", filePath };
  }

  const exports = enumerateExports(sourceFile);
  if (exports.length === 0) {
    return { status: "skipped-no-runtime-exports", filePath };
  }

  const insertOffset = findInsertOffset(sourceFile);
  const block = renderAttestationBlock(exports);
  const newContent = content.slice(0, insertOffset) + block + content.slice(insertOffset);

  await fs.writeFile(filePath, newContent, "utf8");
  const stubCount = exports.filter((e) => e.looksLikeStub).length;
  return {
    status: "generated",
    filePath,
    entries: exports.length,
    stubCount,
  };
}

async function main() {
  const entries = await fs.readdir(attestedRoot);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.endsWith(".ts")) {
      continue;
    }
    const fullPath = path.join(attestedRoot, entry);
    if (isTestLikeTypeScriptFile(fullPath, { extraTestSuffixes })) {
      continue;
    }
    candidates.push(fullPath);
  }

  let generated = 0;
  let skipped = 0;
  let totalEntries = 0;
  let totalStubs = 0;

  for (const filePath of candidates.toSorted()) {
    const result = await processFile(filePath);
    if (result.status === "generated") {
      generated += 1;
      totalEntries += result.entries;
      totalStubs += result.stubCount;
      console.log(
        `  wrote ${result.entries} attestation(s) (${result.stubCount} stub) to ${path.relative(repoRoot, filePath)}`,
      );
    } else {
      skipped += 1;
    }
  }

  console.log();
  console.log(
    `Generated ${generated} attestation blocks; skipped ${skipped} modules (existing or no runtime exports). ${totalEntries} total entries, ${totalStubs} auto-classified "stub".`,
  );
}

await main();
