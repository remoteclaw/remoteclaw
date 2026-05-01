#!/usr/bin/env node

/**
 * Sync-PR attestation diff reporter (ADR 0005 H10, remoteclaw#2441).
 *
 * Invoked by `.github/workflows/sync-pr-audit.yml` on sync PRs. Compares
 * `MODULE_ATTESTATIONS` blocks between two commits and reports per-module
 * attestation changes in a reviewer-friendly format.
 *
 * Shape of output (markdown tables) for each file that changed its
 * attestations between BASE and HEAD:
 *
 *   ## src/agents/foo.ts
 *   | symbol | before | after |
 *   | --- | --- | --- |
 *   | bar | live | partial |
 *   | baz | (not attested) | live |
 *   | qux | deprecated | (removed) |
 *
 * Exit code: 0 if there are no attestation changes (or only harmless
 * additions), non-zero if there are removals or downgrades the reviewer
 * should scrutinize. In practice we always exit 0 — the report is
 * advisory — but the exit code is threaded through the workflow so
 * future logic can gate on it.
 *
 * Usage:
 *   node scripts/check-attestations-diff.mjs <base-sha> <head-sha>
 */

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { isTestLikeTypeScriptFile, runAsScript, unwrapExpression } from "./lib/ts-guard-utils.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Keep in sync with check-attestations.mjs — same scope (src/agents depth-1).
const extraTestSuffixes = [
  ".test-helpers.ts",
  ".test-mocks.ts",
  ".mocks.ts",
  ".mocks.shared.ts",
  ".e2e-mocks.ts",
];

function gitShow(sha, relPath) {
  try {
    return execFileSync("git", ["show", `${sha}:${relPath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // File didn't exist at this sha.
    return null;
  }
}

function listChangedAgentFiles(baseSha, headSha) {
  const out = execFileSync(
    "git",
    ["diff", "--name-only", `${baseSha}..${headSha}`, "--", "src/agents/*.ts"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  return out
    .split("\n")
    .map((line) => line.trim())
    .filter((rel) => {
      if (!rel) {
        return false;
      }
      // Only depth-1 src/agents/*.ts (no subdirectories, no tests).
      if (!rel.startsWith("src/agents/")) {
        return false;
      }
      if (rel.slice("src/agents/".length).includes("/")) {
        return false;
      }
      if (isTestLikeTypeScriptFile(rel, { extraTestSuffixes })) {
        return false;
      }
      return true;
    });
}

/**
 * Extract the MODULE_ATTESTATIONS object from source text. Returns a Map
 * from symbol to category string, or null if no attestations are present.
 */
function parseAttestations(sourceText) {
  if (sourceText === null) {
    return null;
  }
  const sourceFile = ts.createSourceFile(
    "diff-input.ts",
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    const isExported = statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!isExported) {
      continue;
    }
    for (const decl of statement.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) {
        continue;
      }
      if (decl.name.text !== "MODULE_ATTESTATIONS") {
        continue;
      }
      const init = decl.initializer;
      if (!init) {
        continue;
      }
      const obj = unwrapExpression(init);
      if (!ts.isObjectLiteralExpression(obj)) {
        continue;
      }
      const entries = new Map();
      for (const prop of obj.properties) {
        if (!ts.isPropertyAssignment(prop)) {
          continue;
        }
        let key;
        if (ts.isIdentifier(prop.name)) {
          key = prop.name.text;
        } else if (ts.isStringLiteral(prop.name)) {
          key = prop.name.text;
        } else {
          continue;
        }
        const val = prop.initializer;
        if (ts.isStringLiteral(val) || ts.isNoSubstitutionTemplateLiteral(val)) {
          entries.set(key, val.text);
        }
      }
      return entries;
    }
  }
  return null;
}

function diffAttestations(before, after) {
  const changes = [];
  const beforeMap = before ?? new Map();
  const afterMap = after ?? new Map();
  const allSymbols = new Set([...beforeMap.keys(), ...afterMap.keys()]);
  for (const symbol of [...allSymbols].toSorted((a, b) => a.localeCompare(b))) {
    const a = beforeMap.get(symbol);
    const b = afterMap.get(symbol);
    if (a === b) {
      continue;
    }
    changes.push({
      symbol,
      before: a ?? "(not attested)",
      after: b ?? "(removed)",
    });
  }
  return changes;
}

function formatReport(fileReports) {
  const lines = [];
  if (fileReports.length === 0) {
    return "No attestation changes between base and HEAD.\n";
  }
  lines.push("# Attestation diff — base...HEAD");
  lines.push("");
  for (const report of fileReports) {
    lines.push(`## ${report.file}`);
    lines.push("");
    lines.push("| symbol | before | after |");
    lines.push("| --- | --- | --- |");
    for (const change of report.changes) {
      lines.push(`| \`${change.symbol}\` | ${change.before} | ${change.after} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const [baseSha, headSha] = process.argv.slice(2);
  if (!baseSha || !headSha) {
    console.error("Usage: check-attestations-diff.mjs <base-sha> <head-sha>");
    process.exit(2);
  }

  const changedFiles = listChangedAgentFiles(baseSha, headSha);
  const fileReports = [];

  for (const file of changedFiles) {
    const before = parseAttestations(gitShow(baseSha, file));
    const after = parseAttestations(gitShow(headSha, file));
    const changes = diffAttestations(before, after);
    if (changes.length === 0) {
      continue;
    }
    fileReports.push({ file, changes });
  }

  console.log(formatReport(fileReports));
}

runAsScript(import.meta.url, main);
