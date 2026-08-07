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
 *   - `: never` return type AND no typed non-variadic-unknown parameters
 *     (added for ADR 0005 H7, remoteclaw#2435): catches uncalibrated
 *     throwing-stub regressions like `function foo(): never { throw ... }`
 *     without flagging legitimate typed error-throw helpers such as
 *     `exitHooksCliWithError(err: unknown): never`.
 *
 * A "live caller" is an import of the stub symbol in any non-test TypeScript
 * file in `src/`, `extensions/`, or `ui/` where the bound local name is
 * referenced outside of the import declaration.
 *
 * Known violations are tracked in `.throwing-stub-callers-allowlist` with a
 * remediation-issue reference. The check FAILS when a stub+live-caller pair
 * is detected that is not on the allowlist.
 *
 * DISCOVERY CANARY (#3138). The stub population is legitimately empty today, so
 * the gate's healthy output is `0 stubs scanned`. That is exactly what a gate
 * whose file walk had broken would print too, and a check whose healthy state
 * and whose broken state render identically cannot tell you which one you are
 * in. So every run reports how many production files the walk actually reached
 * and FAILS when that count is zero — in every mode, `--inventory` included: an
 * inventory produced by an instrument that read nothing is not a shorter
 * inventory, it is a false one. `0 files walked` and `0 stubs found in 1200
 * files` now render differently, and the empty case says why zero is expected.
 *
 * `--roots=<comma-separated repo-relative paths>` overrides the walk's roots.
 * It exists so the canary is demonstrable by hand — point it at a directory
 * with no production TypeScript and watch the gate fail. CI pins the unflagged
 * invocation (`.github/workflows/ci.yml`, `throwing-stub-callers-gate`).
 *
 * Reference: issues #2408 (evidence), #2409 (audit), #2410 (this gate),
 * #3138 (this canary).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { classifyThrowingStubShape } from "./lib/throwing-stub-shape.mjs";
import {
  collectTypeScriptFilesFromRoots,
  isTestLikeTypeScriptFile,
  resolveSourceRoots,
  runAsScript,
  toLine,
} from "./lib/ts-guard-utils.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SOURCE_ROOTS = ["src", "extensions", "ui"];

// Test-file suffixes beyond the base set in ts-guard-utils. Files matching
// these are excluded from both stub-detection and caller-detection: mock
// files and test helpers reference stubs but are not production callers.
const extraTestSuffixes = [".test-helpers.ts", ".test-mocks.ts", ".e2e.test.ts", ".live.test.ts"];

function normalizePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isProductionFile(filePath) {
  return !isTestLikeTypeScriptFile(filePath, { extraTestSuffixes });
}

/** Collapse a repo-relative root spec to the canonical form `normalizePath` emits. */
function canonicalizeRoot(root) {
  return root
    .split(/[/\\]/)
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

/**
 * Read source files from all roots once; return a map keyed by canonical
 * normalized path. Avoids re-reading during caller resolution.
 */
async function loadSourceFiles({ includeTests, sourceRoots }) {
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

/** Build the candidate record if the function declaration matches a stub pattern. */
function classifyStubFunction({ sourceFile, fullText, name, body, parameters, returnType, node }) {
  const shape = classifyThrowingStubShape({
    body,
    parameters,
    returnType,
    ownerNode: node,
    fullText,
  });
  if (!shape) {
    return null;
  }
  return {
    symbol: name,
    line: toLine(sourceFile, node),
    signals: shape.signals,
    message: shape.message,
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
        returnType: statement.type,
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
            returnType: initializer.type,
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

/**
 * Account for what the walk actually reached, per root and in total (#3138).
 * `productionFiles` is the denominator that matters: stub detection and caller
 * detection both scan production files only, so a run that reached zero of them
 * has evaluated nothing, whatever its violation count says.
 */
function summarizeDiscovery(sourceFileIndex, sourceRoots) {
  const roots = sourceRoots.map((root) => ({
    root: canonicalizeRoot(root),
    filesRead: 0,
    productionFiles: 0,
  }));
  let filesRead = 0;
  let productionFiles = 0;

  for (const [normalized, record] of sourceFileIndex) {
    const production = isProductionFile(record.filePath);
    filesRead += 1;
    if (production) {
      productionFiles += 1;
    }
    // First match wins, so nested roots ("src", "src/plugin-sdk") never double-count.
    const owner = roots.find(
      (entry) => normalized === entry.root || normalized.startsWith(`${entry.root}/`),
    );
    if (owner) {
      owner.filesRead += 1;
      if (production) {
        owner.productionFiles += 1;
      }
    }
  }

  return { roots, filesRead, productionFiles };
}

export async function runCheck({ strict = false, sourceRoots = DEFAULT_SOURCE_ROOTS } = {}) {
  const sourceFileIndex = await loadSourceFiles({ includeTests: true, sourceRoots });
  const discovery = summarizeDiscovery(sourceFileIndex, sourceRoots);

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

  return { stubs: allStubs, violations, unexpected, stale, matched, allowlist, discovery };
}

function writeLine(stream, text) {
  stream.write(`${text}\n`);
}

function pluralFiles(count) {
  return `${count} production TypeScript file${count === 1 ? "" : "s"}`;
}

/**
 * Parse `--roots=a,b`. Returns null for "not supplied". A bare `--roots` is an
 * error rather than a silent fallback to the defaults: silently scanning the
 * whole repo when the caller asked for a narrower walk is the same
 * indistinguishable-states failure this canary exists to end.
 */
function parseRootsFlag(argv) {
  if (argv.includes("--roots")) {
    return { error: "`--roots` needs a value: --roots=<comma-separated repo-relative paths>" };
  }
  const flag = argv.find((arg) => arg.startsWith("--roots="));
  if (!flag) {
    return { roots: null };
  }
  const roots = flag
    .slice("--roots=".length)
    .split(",")
    .map((root) => root.trim())
    .filter((root) => root.length > 0);
  if (roots.length === 0) {
    return { error: "`--roots=` was given no paths." };
  }
  return { roots };
}

/** Render the per-root walk accounting — a root that went to 0 is legible here. */
function formatDiscoveryRoots(discovery) {
  return discovery.roots.map((entry) => `${entry.root}=${entry.productionFiles}`).join(", ");
}

/**
 * The canary (#3138). Reached-nothing is reported as an instrument failure, not
 * as an empty result, because the two are not the same claim.
 */
function reportBrokenDiscovery(streams, discovery) {
  writeLine(streams.stderr, "");
  writeLine(
    streams.stderr,
    "FAIL: discovery canary tripped — the walk reached 0 production files.",
  );
  writeLine(streams.stderr, "");
  writeLine(
    streams.stderr,
    [
      "A `0 stubs scanned` result from this run is NOT evidence that the #2408",
      "regression class is absent — it is evidence that this gate did not run. The",
      "scan read no production TypeScript, so it evaluated no candidates at all.",
      "",
      `Roots searched (${discovery.filesRead} file${discovery.filesRead === 1 ? "" : "s"} read including tests):`,
      ...discovery.roots.map(
        (entry) => `  ${entry.root} — ${entry.productionFiles} production, ${entry.filesRead} read`,
      ),
      "",
      "Likely causes:",
      "  1. A source root was renamed, moved or removed — update DEFAULT_SOURCE_ROOTS",
      "     in this script to match the tree.",
      "  2. The walk stopped matching `.ts` files, or every match was classified",
      "     test-like (see `extraTestSuffixes`).",
      "  3. `--roots=` pointed the scan at a path holding no production TypeScript.",
      "     That is the flag's intended use for exercising this canary by hand; CI",
      "     runs the gate unflagged.",
    ].join("\n"),
  );
}

export async function main(argv = process.argv.slice(2), io) {
  const streams = io ?? { stdout: process.stdout, stderr: process.stderr };
  const strict = argv.includes("--strict");
  const inventoryOnly = argv.includes("--inventory");
  const json = argv.includes("--json");
  const selfTest = argv.includes("--self-test");

  if (selfTest) {
    return await runSelfTests(streams);
  }

  const rootsFlag = parseRootsFlag(argv);
  if (rootsFlag.error) {
    writeLine(streams.stderr, `FAIL: ${rootsFlag.error}`);
    return 1;
  }

  const result = await runCheck({ strict, sourceRoots: rootsFlag.roots ?? DEFAULT_SOURCE_ROOTS });
  const discoveryBroken = result.discovery.productionFiles === 0;

  if (json) {
    writeLine(streams.stdout, JSON.stringify(result, null, 2));
    if (discoveryBroken) {
      reportBrokenDiscovery(streams, result.discovery);
      return 1;
    }
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

  writeLine(
    streams.stdout,
    `\nDiscovery: walked ${pluralFiles(result.discovery.productionFiles)} (${formatDiscoveryRoots(result.discovery)}); ${result.discovery.filesRead} read including tests.`,
  );

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

  // Ahead of the `--inventory` early return on purpose: an inventory compiled by
  // an instrument that read nothing is not a shorter inventory, it is a false one.
  if (discoveryBroken) {
    reportBrokenDiscovery(streams, result.discovery);
    return 1;
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
  if (result.stubs.length === 0) {
    writeLine(
      streams.stdout,
      [
        `  0 stubs scanned means the population is empty, not undiscovered: the ${result.discovery.productionFiles}-file`,
        "  walk above reached production code and found no exported single-throw function",
        "  carrying a calibration signal (variadic-unknown parameters, a fork-attributed throw",
        "  message, a `// Gutted in RemoteClaw fork` marker, or a bare `: never` return).",
        "  Expected today — the #2408 regression class is absent from production code, and",
        "  that file count is what says so rather than a broken scan (remoteclaw#3138).",
      ].join("\n"),
    );
  }
  return 0;
}

/**
 * Classify every exported throwing-stub-shaped function in a TypeScript source
 * text. Used by self-tests and available for external callers that want to
 * exercise the classifier without the full codebase scan.
 */
export function classifyFixture(sourceText, fileName = "fixture.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  return findStubsInFile({ filePath: fileName, sourceFile });
}

const SELF_TEST_FIXTURES = [
  {
    name: "uncalibrated never-return stub (no params)",
    source: `export function foo(): never {\n  throw new Error("bar");\n}\n`,
    expectedFlagged: true,
    expectedSignals: ["never-return"],
  },
  {
    name: "typed error-throw helper with unknown param (exitHooksCliWithError shape)",
    source: `export function exitWithError(err: unknown): never {\n  throw new Error(String(err));\n}\n`,
    expectedFlagged: false,
  },
  {
    name: "typed error-throw helper with string param (throwGatewayAuthResolutionError shape)",
    source: `export function throwReason(reason: string): never {\n  throw new Error(reason);\n}\n`,
    expectedFlagged: false,
  },
  {
    name: "typed error-throw helper with object param (throwPathEscapesBoundary shape)",
    source: `export function throwOnBoundary(params: { label: string }): never {\n  throw new Error(params.label);\n}\n`,
    expectedFlagged: false,
  },
  {
    name: "variadic-unknown with never-return (upstream-compat pattern)",
    source: `export function listProviderModels(..._args: unknown[]): never {\n  throw new Error("not available in RemoteClaw fork");\n}\n`,
    expectedFlagged: true,
    expectedSignalsIncludes: ["variadic-unknown", "never-return"],
  },
  {
    name: "never-return without throw body (not a stub — loops forever)",
    source: `export function spinForever(): never {\n  while (true) {\n    // nothing\n  }\n}\n`,
    expectedFlagged: false,
  },
  {
    name: "never-return with multi-statement body (not a single-throw)",
    source: `export function maybeThrow(): never {\n  const x = 1;\n  throw new Error(String(x));\n}\n`,
    expectedFlagged: false,
  },
  {
    name: "exported arrow function, uncalibrated never-return",
    source: `export const fail = (): never => {\n  throw new Error("fail");\n};\n`,
    expectedFlagged: true,
    expectedSignalsIncludes: ["never-return"],
  },
  {
    name: "exported arrow function with typed param and never-return (local fail shape)",
    source: `export const fail = (reason: string): never => {\n  throw new Error(reason);\n};\n`,
    expectedFlagged: false,
  },
  {
    name: "non-exported never-return throwing function (not a stub, not exported)",
    source: `function internalFail(): never {\n  throw new Error("internal");\n}\n`,
    expectedFlagged: false,
  },
];

/**
 * A root that cannot exist, so the walk returns nothing without any fixture on
 * disk to set up or tear down.
 */
const CANARY_MISSING_ROOT = "scripts/__discovery-canary-missing__";

/**
 * A single real production file, so the positive half of the canary costs one
 * parse rather than a second full-tree scan. If this path ever moves, the
 * discovery self-test below goes red — which is the correct outcome: a canary
 * pinned to a path that no longer exists is the failure mode being guarded.
 */
const CANARY_POPULATED_ROOT = "src/index.ts";

/**
 * Discovery-canary self-tests (#3138). They drive `main` end to end — exit code
 * AND message — so the canary cannot be quietly removed later without turning
 * this step red. The classifier fixtures above can never cover this: they
 * exercise the AST shape check and never touch the file walk, which is exactly
 * why `0 stubs scanned` could look healthy while discovery was broken.
 */
const DISCOVERY_SELF_TESTS = [
  {
    name: "canary FAILS the gate when the walk reaches zero production files",
    argv: [`--roots=${CANARY_MISSING_ROOT}`],
    expectedExitCode: 1,
    expectedStderrIncludes: "the walk reached 0 production files",
  },
  {
    name: "canary FAILS in --inventory mode too (a scan that read nothing is not an inventory)",
    argv: [`--roots=${CANARY_MISSING_ROOT}`, "--inventory"],
    expectedExitCode: 1,
    expectedStderrIncludes: "the walk reached 0 production files",
  },
  {
    name: "canary stays quiet on a non-empty walk, and the file count is reported",
    argv: [`--roots=${CANARY_POPULATED_ROOT}`],
    expectedExitCode: 0,
    expectedStdoutIncludes: "Discovery: walked 1 production TypeScript file",
  },
  {
    name: "bare --roots is rejected rather than silently falling back to the full tree",
    argv: ["--roots"],
    expectedExitCode: 1,
    expectedStderrIncludes: "`--roots` needs a value",
  },
];

/** Collect `main`'s output instead of writing it, so a self-test can assert on it. */
function captureStreams() {
  const stdout = [];
  const stderr = [];
  return {
    io: {
      stdout: { write: (chunk) => stdout.push(chunk) },
      stderr: { write: (chunk) => stderr.push(chunk) },
    },
    stdout: () => stdout.join(""),
    stderr: () => stderr.join(""),
  };
}

async function runDiscoverySelfTest(testCase) {
  const capture = captureStreams();
  let exitCode;
  try {
    exitCode = await main(testCase.argv, capture.io);
  } catch (error) {
    return {
      passed: false,
      detail: ` — threw ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (exitCode !== testCase.expectedExitCode) {
    return {
      passed: false,
      detail: ` — expected exit ${testCase.expectedExitCode}, got ${exitCode}`,
    };
  }
  if (
    testCase.expectedStderrIncludes &&
    !capture.stderr().includes(testCase.expectedStderrIncludes)
  ) {
    return {
      passed: false,
      detail: ` — stderr missing ${JSON.stringify(testCase.expectedStderrIncludes)}`,
    };
  }
  if (
    testCase.expectedStdoutIncludes &&
    !capture.stdout().includes(testCase.expectedStdoutIncludes)
  ) {
    return {
      passed: false,
      detail: ` — stdout missing ${JSON.stringify(testCase.expectedStdoutIncludes)}`,
    };
  }
  return { passed: true, detail: "" };
}

async function runSelfTests(streams) {
  let failures = 0;
  const total = SELF_TEST_FIXTURES.length + DISCOVERY_SELF_TESTS.length;
  writeLine(
    streams.stdout,
    `Running ${total} self-tests (${SELF_TEST_FIXTURES.length} classifier, ${DISCOVERY_SELF_TESTS.length} discovery-canary)...\n`,
  );

  for (const fixture of SELF_TEST_FIXTURES) {
    const stubs = classifyFixture(fixture.source);
    const flagged = stubs.length > 0;
    let passed = flagged === fixture.expectedFlagged;
    let detail = "";

    if (passed && flagged && fixture.expectedSignals !== undefined) {
      const actual = stubs[0].signals.toSorted();
      const expected = fixture.expectedSignals.toSorted();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        passed = false;
        detail = ` (signals mismatch: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`;
      }
    }
    if (passed && flagged && fixture.expectedSignalsIncludes !== undefined) {
      const actual = new Set(stubs[0].signals);
      const missing = fixture.expectedSignalsIncludes.filter((s) => !actual.has(s));
      if (missing.length > 0) {
        passed = false;
        detail = ` (missing signals: ${JSON.stringify(missing)}, got ${JSON.stringify([...actual])})`;
      }
    }

    const status = passed ? "PASS" : "FAIL";
    writeLine(
      streams.stdout,
      `  [${status}] ${fixture.name}${passed ? "" : ` — expected ${fixture.expectedFlagged ? "flagged" : "unflagged"}, got ${flagged ? "flagged" : "unflagged"}${detail}`}`,
    );
    if (!passed) {
      failures += 1;
    }
  }

  for (const testCase of DISCOVERY_SELF_TESTS) {
    const { passed, detail } = await runDiscoverySelfTest(testCase);
    writeLine(
      streams.stdout,
      `  [${passed ? "PASS" : "FAIL"}] ${testCase.name}${passed ? "" : detail}`,
    );
    if (!passed) {
      failures += 1;
    }
  }

  writeLine(streams.stdout, "");
  if (failures === 0) {
    writeLine(streams.stdout, `All ${total} self-tests passed.`);
    return 0;
  }
  writeLine(streams.stderr, `${failures} self-test${failures === 1 ? "" : "s"} failed.`);
  return 1;
}

runAsScript(import.meta.url, async () => {
  const exitCode = await main();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
});
