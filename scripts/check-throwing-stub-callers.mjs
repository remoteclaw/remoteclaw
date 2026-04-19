#!/usr/bin/env node

/**
 * Throwing-stub-with-live-callers gate — detects the anti-pattern that shipped
 * in #2408 (unconditional-throw stub with live production callers) and related
 * silent regressions in #2337.
 *
 * A "throwing stub" is an exported function whose body is a single throw
 * statement AND that carries at least one calibration signal:
 *   - Variadic-unknown signature:  (..._args: unknown[]) / (...args: unknown[])
 *   - Fork-attributed throw message: "not available in RemoteClaw fork",
 *     "gutted", "upstream-compat"
 *   - A "// Gutted in RemoteClaw fork" marker comment immediately preceding
 *     the declaration
 *
 * A "live caller" is an import of the stub symbol in any non-test TypeScript
 * file in `src/`, `extensions/`, or `ui/` where the bound local name is
 * referenced outside of the import declaration.
 *
 * Known violations are tracked in `.throwing-stub-callers-allowlist` with a
 * remediation-issue reference. The check FAILS when a stub+live-caller pair
 * is detected that is not on the allowlist.
 *
 * Reference: issues #2408 (evidence), #2409 (audit), #2410 (this gate).
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
  toLine,
} from "./lib/ts-guard-utils.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["src", "extensions", "ui"];

// Test-file suffixes beyond the base set in ts-guard-utils. Files matching
// these are excluded from both stub-detection and caller-detection: mock
// files and test helpers reference stubs but are not production callers.
const extraTestSuffixes = [".test-helpers.ts", ".test-mocks.ts", ".e2e.test.ts", ".live.test.ts"];

// Regex for fork-attributed throw messages (Patterns B and C from #2409).
const forkMessagePattern = /not available in RemoteClaw fork|\bgutted\b|upstream-compat/i;

// Marker-comment pattern for explicit upstream-compat stubs.
const markerCommentPattern = /Gutted in RemoteClaw fork/i;

function normalizePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isProductionFile(filePath) {
  return !isTestLikeTypeScriptFile(filePath, { extraTestSuffixes });
}

/**
 * Read source files from all roots once; return a map keyed by canonical
 * normalized path. Avoids re-reading during caller resolution.
 */
async function loadSourceFiles({ includeTests }) {
  const roots = resolveSourceRoots(repoRoot, sourceRoots);
  const files = await collectTypeScriptFilesFromRoots(roots, {
    includeTests,
    extraTestSuffixes,
  });
  const out = new Map();
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    out.set(normalizePath(filePath), { filePath, sourceFile });
  }
  return out;
}

/** Extract throw-message text from a throw statement, or null if not a literal string. */
function throwMessageOf(throwStatement) {
  const expr = throwStatement.expression;
  if (!expr || !ts.isNewExpression(expr)) {
    return null;
  }
  const args = expr.arguments ?? [];
  if (args.length === 0) {
    return null;
  }
  const first = args[0];
  if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) {
    return first.text;
  }
  return null;
}

/** A function body is a "single throw" if it contains exactly one statement that is a ThrowStatement. */
function isSingleThrowBody(body) {
  if (!body || !ts.isBlock(body)) {
    return false;
  }
  if (body.statements.length !== 1) {
    return false;
  }
  return ts.isThrowStatement(body.statements[0]);
}

/** Does the parameter list declare variadic `...args: unknown[]` or `..._args: unknown[]`? */
function hasVariadicUnknownArgs(parameters) {
  for (const param of parameters) {
    if (!param.dotDotDotToken) {
      continue;
    }
    const type = param.type;
    if (!type) {
      continue;
    }
    // Accept `unknown[]` and `readonly unknown[]` and `Array<unknown>`.
    if (ts.isArrayTypeNode(type) && type.elementType.kind === ts.SyntaxKind.UnknownKeyword) {
      return true;
    }
    if (
      ts.isTypeOperatorNode(type) &&
      type.operator === ts.SyntaxKind.ReadonlyKeyword &&
      ts.isArrayTypeNode(type.type) &&
      type.type.elementType.kind === ts.SyntaxKind.UnknownKeyword
    ) {
      return true;
    }
    if (
      ts.isTypeReferenceNode(type) &&
      ts.isIdentifier(type.typeName) &&
      type.typeName.text === "Array" &&
      type.typeArguments?.length === 1 &&
      type.typeArguments[0].kind === ts.SyntaxKind.UnknownKeyword
    ) {
      return true;
    }
  }
  return false;
}

/** Does the text immediately preceding `node` contain the "Gutted in RemoteClaw fork" marker? */
function hasMarkerComment(sourceFile, node, fullText) {
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges) {
    return false;
  }
  for (const range of ranges) {
    const commentText = fullText.slice(range.pos, range.end);
    if (markerCommentPattern.test(commentText)) {
      return true;
    }
  }
  return false;
}

/** Build the candidate record if the function declaration matches a stub pattern. */
function classifyStubFunction({ sourceFile, fullText, name, body, parameters, node }) {
  if (!isSingleThrowBody(body)) {
    return null;
  }
  const throwStatement = body.statements[0];
  const message = throwMessageOf(throwStatement);

  const variadicUnknown = hasVariadicUnknownArgs(parameters);
  const forkMessage = message !== null && forkMessagePattern.test(message);
  const markerComment = hasMarkerComment(sourceFile, node, fullText);

  if (!variadicUnknown && !forkMessage && !markerComment) {
    return null;
  }

  const signals = [];
  if (variadicUnknown) {
    signals.push("variadic-unknown");
  }
  if (forkMessage) {
    signals.push("fork-message");
  }
  if (markerComment) {
    signals.push("marker-comment");
  }

  return {
    symbol: name,
    line: toLine(sourceFile, node),
    signals,
    message,
  };
}

/** Find every exported function declaration or exported const arrow/function expression that is a throwing stub. */
function findStubsInFile({ filePath, sourceFile }) {
  const stubs = [];
  const fullText = sourceFile.text;

  for (const statement of sourceFile.statements) {
    const isExported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!isExported) {
      continue;
    }

    if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
      const stub = classifyStubFunction({
        sourceFile,
        fullText,
        name: statement.name.text,
        body: statement.body,
        parameters: statement.parameters,
        node: statement,
      });
      if (stub) {
        stubs.push({ ...stub, file: normalizePath(filePath) });
      }
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }
        const initializer = declaration.initializer;
        if (!initializer) {
          continue;
        }
        if (
          (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) &&
          initializer.body &&
          ts.isBlock(initializer.body)
        ) {
          const stub = classifyStubFunction({
            sourceFile,
            fullText,
            name: declaration.name.text,
            body: initializer.body,
            parameters: initializer.parameters,
            node: statement,
          });
          if (stub) {
            stubs.push({ ...stub, file: normalizePath(filePath) });
          }
        }
      }
    }
  }

  return stubs;
}

/**
 * Resolve a module specifier from `importerFile` to a canonical repo-relative
 * path. Returns null if the specifier is a bare package name or cannot be
 * resolved to one of our source files.
 */
function resolveModuleSpecifier(specifier, importerFile, sourceFileIndex) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return null;
  }
  const importerDir = path.dirname(importerFile);
  const base = specifier.startsWith("/")
    ? path.resolve(repoRoot, specifier.replace(/^\/+/, ""))
    : path.resolve(importerDir, specifier);

  // Strip a trailing .js/.mjs/.jsx for NodeNext module-resolution (TS files compile
  // to those extensions and imports must reference the compiled form).
  const stripped = base.replace(/\.(m?js|jsx)$/, "");

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.mts`,
    `${base}.tsx`,
    stripped,
    `${stripped}.ts`,
    `${stripped}.mts`,
    `${stripped}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.mts"),
    path.join(stripped, "index.ts"),
    path.join(stripped, "index.mts"),
  ];
  for (const candidate of candidates) {
    const normalized = normalizePath(candidate);
    if (sourceFileIndex.has(normalized)) {
      return normalized;
    }
  }
  return null;
}

/**
 * For each non-test file: build a set of { localName -> stubIdentity } bindings
 * by walking import declarations, then walk the AST and count Identifier
 * references (outside import/export clauses and type positions) to each bound
 * name.
 */
function findCallersInFile({ sourceFile, filePath }, stubIndex, sourceFileIndex) {
  const callers = [];
  const bindings = new Map(); // localName -> { stubFile, stubSymbol }
  const selfFile = normalizePath(filePath);

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    if (!statement.importClause || !statement.importClause.namedBindings) {
      continue;
    }
    const namedBindings = statement.importClause.namedBindings;
    if (!ts.isNamedImports(namedBindings)) {
      continue;
    }
    if (!ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }

    const resolved = resolveModuleSpecifier(
      statement.moduleSpecifier.text,
      filePath,
      sourceFileIndex,
    );
    if (!resolved) {
      continue;
    }
    const stubsInModule = stubIndex.get(resolved);
    if (!stubsInModule || stubsInModule.length === 0) {
      continue;
    }

    for (const element of namedBindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      const localName = element.name.text;
      const stub = stubsInModule.find((s) => s.symbol === importedName);
      if (!stub) {
        continue;
      }
      bindings.set(localName, { stubFile: resolved, stubSymbol: stub.symbol });
    }
  }

  if (bindings.size === 0) {
    return callers;
  }

  const visit = (node) => {
    // Skip import/export clauses entirely — the bindings themselves aren't callers.
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      return;
    }

    if (ts.isIdentifier(node) && bindings.has(node.text)) {
      const binding = bindings.get(node.text);
      // A caller in the stub's own source file is a self-reference, not a live caller.
      if (binding.stubFile === selfFile) {
        return;
      }
      callers.push({
        localName: node.text,
        stubFile: binding.stubFile,
        stubSymbol: binding.stubSymbol,
        line: toLine(sourceFile, node),
      });
      return;
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return callers;
}

async function readAllowlist() {
  const allowlistPath = path.join(repoRoot, ".throwing-stub-callers-allowlist");
  const entries = new Map(); // "file::symbol" -> comment/note
  try {
    const raw = await fs.readFile(allowlistPath, "utf8");
    for (const rawLine of raw.split("\n")) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith("#")) {
        continue;
      }
      const [key, note = ""] = line.split("#", 2).map((s) => s.trim());
      if (key.length === 0) {
        continue;
      }
      entries.set(key, note);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { path: allowlistPath, entries, exists: false };
    }
    throw error;
  }
  return { path: allowlistPath, entries, exists: true };
}

function formatInventory(violations) {
  if (violations.length === 0) {
    return "";
  }
  const lines = [];
  for (const v of violations) {
    lines.push(
      `  ${v.stub.file}::${v.stub.symbol} (line ${v.stub.line}, signals: ${v.stub.signals.join(", ")})`,
    );
    const callerCount = v.callers.length;
    const shown = v.callers.slice(0, 3);
    lines.push(`    callers: ${callerCount} site${callerCount === 1 ? "" : "s"}`);
    for (const c of shown) {
      lines.push(`      - ${c.file}:${c.line}`);
    }
    if (callerCount > shown.length) {
      lines.push(`      - ... and ${callerCount - shown.length} more`);
    }
  }
  return lines.join("\n");
}

export async function runCheck({ strict = false } = {}) {
  const sourceFileIndex = await loadSourceFiles({ includeTests: true });

  // Stub detection scans production files only. A stub declared in a test file is not a concern.
  const stubIndex = new Map(); // canonical file path -> stubs[]
  for (const [key, record] of sourceFileIndex) {
    if (!isProductionFile(record.filePath)) {
      continue;
    }
    const stubs = findStubsInFile(record);
    if (stubs.length > 0) {
      stubIndex.set(key, stubs);
    }
  }

  // Caller detection scans production files only.
  const allStubs = [...stubIndex.values()].flat();
  const perStubCallers = new Map(); // "file::symbol" -> callers[]
  for (const stub of allStubs) {
    perStubCallers.set(`${stub.file}::${stub.symbol}`, []);
  }

  for (const [, record] of sourceFileIndex) {
    if (!isProductionFile(record.filePath)) {
      continue;
    }
    const callers = findCallersInFile(record, stubIndex, sourceFileIndex);
    for (const caller of callers) {
      const key = `${caller.stubFile}::${caller.stubSymbol}`;
      const list = perStubCallers.get(key);
      if (list) {
        list.push({ file: normalizePath(record.filePath), line: caller.line });
      }
    }
  }

  const violations = [];
  for (const stub of allStubs) {
    const key = `${stub.file}::${stub.symbol}`;
    const callers = perStubCallers.get(key) ?? [];
    if (callers.length > 0) {
      callers.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
      violations.push({ stub, callers, key });
    }
  }
  violations.sort((a, b) => a.key.localeCompare(b.key));

  const allowlist = await readAllowlist();
  const unexpected = [];
  const stale = [];
  const matched = [];

  for (const v of violations) {
    if (strict || !allowlist.entries.has(v.key)) {
      unexpected.push(v);
    } else {
      matched.push(v);
    }
  }
  for (const [key] of allowlist.entries) {
    if (!violations.some((v) => v.key === key)) {
      stale.push(key);
    }
  }

  return { stubs: allStubs, violations, unexpected, stale, matched, allowlist };
}

function writeLine(stream, text) {
  stream.write(`${text}\n`);
}

export async function main(argv = process.argv.slice(2), io) {
  const streams = io ?? { stdout: process.stdout, stderr: process.stderr };
  const strict = argv.includes("--strict");
  const inventoryOnly = argv.includes("--inventory");
  const json = argv.includes("--json");

  const result = await runCheck({ strict });

  if (json) {
    writeLine(streams.stdout, JSON.stringify(result, null, 2));
    return result.unexpected.length > 0 && !inventoryOnly ? 1 : 0;
  }

  writeLine(
    streams.stdout,
    `Throwing-stub-with-live-callers inventory (${result.violations.length} violation${result.violations.length === 1 ? "" : "s"}):`,
  );
  if (result.violations.length > 0) {
    writeLine(streams.stdout, formatInventory(result.violations));
  } else {
    writeLine(streams.stdout, "  (none)");
  }

  if (result.matched.length > 0) {
    writeLine(streams.stdout, `\nAllowlisted (tracked for remediation): ${result.matched.length}`);
    for (const v of result.matched) {
      const note = result.allowlist.entries.get(v.key) || "";
      writeLine(streams.stdout, `  ${v.key}${note ? ` — ${note}` : ""}`);
    }
  }

  if (result.stale.length > 0) {
    writeLine(
      streams.stdout,
      `\nStale allowlist entries (no longer violate): ${result.stale.length}`,
    );
    for (const key of result.stale.toSorted((a, b) => a.localeCompare(b))) {
      writeLine(streams.stdout, `  ${key}`);
    }
    writeLine(streams.stdout, "  → remove these lines from .throwing-stub-callers-allowlist");
  }

  if (inventoryOnly) {
    return 0;
  }

  if (result.unexpected.length > 0) {
    writeLine(streams.stderr, "");
    writeLine(
      streams.stderr,
      `FAIL: ${result.unexpected.length} throwing-stub${result.unexpected.length === 1 ? "" : "s"} with live callers not on allowlist:`,
    );
    writeLine(streams.stderr, formatInventory(result.unexpected));
    writeLine(streams.stderr, "");
    writeLine(
      streams.stderr,
      [
        "This class of regression shipped in #2408 — an unconditional-throw stub",
        "left with live production callers because unit tests mocked the stub.",
        "",
        "To resolve:",
        "  1. Preferred: replace the stub with a working implementation OR",
        "     migrate callers off the stub (then delete the stub).",
        "  2. If the stub must stay temporarily, open a remediation issue and",
        "     add a line to `.throwing-stub-callers-allowlist`:",
        "       <file>::<symbol>  # #<issue>",
        "",
        "See `CLAUDE.md` § Fork Stub Conventions for the legitimate way to add",
        "an upstream-compat stub (no callers) without tripping this gate.",
      ].join("\n"),
    );
    return 1;
  }

  writeLine(
    streams.stdout,
    `\nThrowing-stub-callers check passed (${result.stubs.length} stub${result.stubs.length === 1 ? "" : "s"} scanned, ${result.matched.length} allowlisted, ${result.unexpected.length} unexpected).`,
  );
  return 0;
}

runAsScript(import.meta.url, async () => {
  const exitCode = await main();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
});
