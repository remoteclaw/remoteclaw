#!/usr/bin/env node

import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  collectTypeScriptFilesFromRoots,
  resolveRepoRoot,
  resolveSourceRoots,
  runAsScript,
  toLine,
} from "./lib/ts-guard-utils.mjs";

// Gutted modules whose imports must not appear in source or test files.
// Matched as substrings against import/re-export/dynamic-import specifiers.
const deadModulePatterns = [
  "agents/pi-embedded",
  "agents/model-catalog",
  "agents/model-fallback",
  "agents/model-selection",
  "agents/skills",
  "agents/sandbox",
  "agents/pi-embedded-runner",
  "memory/",
  "acp/control-plane",
  "acp/runtime",
];

const sourceRoots = ["src", "extensions"];

// Known legacy callsites awaiting cleanup (see #2192).
// Remove entries as the underlying imports are eliminated.
const allowedCallsites = new Set([
  "src/auto-reply/reply/agent-runner.runreplyagent.e2e.test.ts:42",
  "src/auto-reply/reply/agent-runner.runreplyagent.e2e.test.ts:84",
  "src/cli/memory-cli.ts:11",
  "src/cli/memory-cli.ts:12",
  "src/commands/status-all.ts:1",
  "src/config/zod-schema.agent-runtime.ts:2",
  "src/cron/isolated-agent/run.test-harness.ts:75",
  "src/gateway/gateway-cli-backend.live.test.ts:6",
  "src/infra/outbound/message-action-params.ts:3",
  "src/plugin-sdk/index.ts:86",
  "src/plugin-sdk/index.ts:87",
  "src/plugin-sdk/index.ts:93",
  "src/plugin-sdk/index.ts:94",
  "src/plugin-sdk/index.ts:95",
  "src/telegram/bot-message-dispatch.ts:7",
  "src/telegram/bot-message-dispatch.ts:8",
  "src/telegram/bot-native-commands.skills-allowlist.test.ts:5",
]);

function isDeadModuleSpecifier(specifierText) {
  return deadModulePatterns.some((pattern) => specifierText.includes(pattern));
}

export function findZombieImportLines(content, fileName = "source.ts") {
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

export async function main() {
  const repoRoot = resolveRepoRoot(import.meta.url);
  const roots = resolveSourceRoots(repoRoot, sourceRoots);
  const files = await collectTypeScriptFilesFromRoots(roots, { includeTests: true });
  const violations = [];

  for (const filePath of files) {
    const relPath = path.relative(repoRoot, filePath).replaceAll(path.sep, "/");
    const content = await fs.readFile(filePath, "utf8");
    for (const line of findZombieImportLines(content, filePath)) {
      const callsite = `${relPath}:${line}`;
      if (allowedCallsites.has(callsite)) {
        continue;
      }
      violations.push(callsite);
    }
  }

  if (violations.length === 0) {
    return;
  }

  console.error("Found imports from gutted (dead) modules:");
  for (const v of violations.toSorted()) {
    console.error(`- ${v}`);
  }
  console.error(
    "\nThese modules have been removed. Update imports to use live replacements,\n" +
      "or add the callsite to allowedCallsites in scripts/check-no-zombie-imports.mjs\n" +
      "with a tracking comment.",
  );
  process.exit(1);
}

runAsScript(import.meta.url, main);
