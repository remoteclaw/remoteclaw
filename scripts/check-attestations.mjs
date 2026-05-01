#!/usr/bin/env node

/**
 * Module attestation gate (ADR 0005 H9, remoteclaw#2437).
 *
 * Each fork-boundary module (initial scope: `src/agents/*` depth-1) exports
 * a `MODULE_ATTESTATIONS` constant declaring the status of every runtime
 * export:
 *
 *   export const MODULE_ATTESTATIONS = {
 *     foo: "live",       // real implementation, safe to call
 *     bar: "stub",       // gutted; must have zero live callers
 *     baz: "partial",    // works for some inputs, gutted for others
 *     qux: "deprecated", // do not use in new code; scheduled for removal
 *   } as const;
 *
 * The gate catches the class of regression that H7 (throwing-stub AST gate)
 * cannot see: **semantic stubs** where the return type stays valid and the
 * body has no throw, but the implementation was gutted (e.g., a function
 * returning constant `false` or an empty map). The attestation forces a
 * human decision at PR time — if the real implementation was gutted and
 * the attestation still says "live", the author is attesting a lie.
 *
 * Enforced invariants:
 * 1. Every runtime export has an attestation entry (new exports without
 *    attestations fail CI).
 * 2. Every attestation entry corresponds to a current runtime export
 *    (stale attestations fail CI).
 * 3. An export attested "live" must NOT match the throwing-stub pattern
 *    (variadic-unknown + throw, fork-attributed throw, marker comment, or
 *    `: never` return with no typed params — see
 *    `check-throwing-stub-callers.mjs`). A "live" declaration on a
 *    throwing-shape function is inconsistent and fails.
 * 4. An export attested "stub" must have zero non-test importers (if it
 *    has live callers, the stub is a production-crash vector — either
 *    replace the stub or migrate callers before landing the attestation).
 *
 * "partial" and "deprecated" have no automatic validation; they are
 * reviewer-discipline signals.
 *
 * Runtime exports counted:
 * - `export function foo(...)`
 * - `export const foo = () => ...` / `= function(...)` (arrow / function
 *   expression)
 * - `export class Foo`
 * - `export default` (if function)
 *
 * Not counted (no gutting risk):
 * - `export type`, `export interface`, `export enum`
 * - `export const FOO = "literal"` (non-function data constants)
 * - Re-exports (`export { foo } from "./bar"` / `export * from "./bar"`) —
 *   attested in the defining module only
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { looksLikeThrowingStub } from "./lib/throwing-stub-shape.mjs";
import {
  collectTypeScriptFilesFromRoots,
  isTestLikeTypeScriptFile,
  resolveSourceRoots,
  runAsScript,
  toLine,
} from "./lib/ts-guard-utils.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Initial scope per remoteclaw#2437: src/agents/ depth-1. Expand to other
// fork-boundary directories in follow-up issues if the pattern proves
// valuable.
const attestedGlob = { root: "src/agents", maxDepth: 1 };

const VALID_CATEGORIES = new Set(["live", "stub", "partial", "deprecated"]);

// Test-file suffixes beyond the base set in ts-guard-utils. Matches the
// convention in check-throwing-stub-callers.mjs and check-stub-debt.mjs.
const extraTestSuffixes = [".test-helpers.ts", ".test-mocks.ts", ".mocks.ts", ".mocks.shared.ts", ".e2e-mocks.ts"];

function normalizePath(filePath) {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isAttestedDepthOneFile(filePath) {
  const rel = normalizePath(filePath);
  const prefix = `${attestedGlob.root}/`;
  if (!rel.startsWith(prefix)) {
    return false;
  }
  const tail = rel.slice(prefix.length);
  if (tail.includes("/")) {
    return false; // deeper than depth-1
  }
  if (isTestLikeTypeScriptFile(filePath, { extraTestSuffixes })) {
    return false;
  }
  return true;
}

function isProductionFile(filePath) {
  return !isTestLikeTypeScriptFile(filePath, { extraTestSuffixes });
}

/** Load every TypeScript source file in src/ + extensions/ + ui/ once. */
async function loadAllSources() {
  const roots = resolveSourceRoots(repoRoot, ["src", "extensions", "ui"]);
  const files = await collectTypeScriptFilesFromRoots(roots, {
    includeTests: true,
    extraTestSuffixes,
  });
  const map = new Map();
  for (const filePath of files) {
    const content = await fs.readFile(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    map.set(normalizePath(filePath), { filePath, sourceFile, content });
  }
  return map;
}

/**
 * Enumerate runtime exports from a source file. Returns a list of
 * `{ symbol, line, kind, looksLikeStub }` records.
 *
 * `kind` is one of: "function" | "arrow" | "function-expression" | "class"
 * | "default-function".
 *
 * `looksLikeStub` is true when the function body matches any of the four
 * throwing-stub calibration signals (used to cross-check "live"
 * attestations).
 */
function enumerateRuntimeExports(sourceFile) {
  const exports = [];
  const fullText = sourceFile.text;

  function recordFunctionLike({ name, body, parameters, returnType, ownerNode, kind }) {
    exports.push({
      symbol: name,
      line: toLine(sourceFile, ownerNode),
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
      recordFunctionLike({
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
        line: toLine(sourceFile, statement),
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
          // `() => expr`. Both are runtime functions and must be attested.
          // Only block bodies can match the throwing-stub shape, so pass
          // `isBlock(init.body) ? init.body : undefined` downstream.
          recordFunctionLike({
            name: decl.name.text,
            body: ts.isBlock(init.body) ? init.body : undefined,
            parameters: init.parameters,
            returnType: init.type,
            ownerNode: statement,
            kind: "arrow",
          });
        } else if (ts.isFunctionExpression(init) && init.body && ts.isBlock(init.body)) {
          recordFunctionLike({
            name: decl.name.text,
            body: init.body,
            parameters: init.parameters,
            returnType: init.type,
            ownerNode: statement,
            kind: "function-expression",
          });
        }
        // Non-function consts (data literals) are not runtime exports for
        // attestation purposes.
      }
      continue;
    }

    if (ts.isExportAssignment(statement) && statement.expression) {
      // `export default <expr>`. Only attest if it's a function-like.
      const expr = statement.expression;
      if (ts.isArrowFunction(expr) && expr.body && ts.isBlock(expr.body)) {
        recordFunctionLike({
          name: "default",
          body: expr.body,
          parameters: expr.parameters,
          returnType: expr.type,
          ownerNode: statement,
          kind: "default-function",
        });
      } else if (ts.isFunctionExpression(expr) && expr.body && ts.isBlock(expr.body)) {
        recordFunctionLike({
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

    // export { ... } from "..." and export * from "..." are re-exports;
    // attestations live in the defining module, so skip.
  }

  return exports;
}

/**
 * Extract the MODULE_ATTESTATIONS object from a source file. Returns
 * `{ found: boolean, entries: Map<string, {category, line}>, node }`.
 * `entries` is a map from exported symbol name to category string.
 */
function extractAttestations(sourceFile) {
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
      // Accept both `{...} as const` (AsExpression) and `{...}` (ObjectLiteral).
      let objNode = init;
      if (ts.isAsExpression(objNode) || ts.isTypeAssertionExpression(objNode)) {
        objNode = objNode.expression;
      }
      if (!ts.isObjectLiteralExpression(objNode)) {
        return {
          found: true,
          entries: new Map(),
          node: statement,
          error: "MODULE_ATTESTATIONS must be an object literal",
        };
      }
      const entries = new Map();
      for (const prop of objNode.properties) {
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
        const value = prop.initializer;
        if (!ts.isStringLiteral(value) && !ts.isNoSubstitutionTemplateLiteral(value)) {
          entries.set(key, { category: "<invalid>", line: toLine(sourceFile, prop) });
          continue;
        }
        entries.set(key, { category: value.text, line: toLine(sourceFile, prop) });
      }
      return { found: true, entries, node: statement };
    }
  }
  return { found: false, entries: new Map(), node: null };
}

/**
 * For each "stub"-attested export across all attested modules, scan
 * production source files for identifier references to the export. Returns
 * a map from `file::symbol` to an array of `{file, line}` caller records.
 */
function findStubCallers(attestedModules, sourceFileIndex) {
  const perStubCallers = new Map();

  for (const module of attestedModules) {
    for (const [symbol, entry] of module.attestations.entries) {
      if (entry.category !== "stub") {
        continue;
      }
      const key = `${module.relPath}::${symbol}`;
      perStubCallers.set(key, []);
      // We'll build a reverse-index below (importer resolves to module
      // specifier → map imported local name to (stubFile, stubSymbol)).
    }
  }

  for (const [importerPath, record] of sourceFileIndex) {
    if (!isProductionFile(record.filePath)) {
      continue;
    }
    const bindings = new Map(); // localName -> { stubFile, stubSymbol }

    for (const statement of record.sourceFile.statements) {
      if (!ts.isImportDeclaration(statement)) {
        continue;
      }
      if (!statement.importClause || !statement.importClause.namedBindings) {
        continue;
      }
      const named = statement.importClause.namedBindings;
      if (!ts.isNamedImports(named)) {
        continue;
      }
      if (!ts.isStringLiteral(statement.moduleSpecifier)) {
        continue;
      }

      const resolved = resolveModuleSpecifier(statement.moduleSpecifier.text, record.filePath, sourceFileIndex);
      if (!resolved) {
        continue;
      }

      // Only care if the imported module is one of our attested modules.
      const module = attestedModules.find((m) => m.relPath === resolved);
      if (!module) {
        continue;
      }

      for (const elem of named.elements) {
        const imported = elem.propertyName?.text ?? elem.name.text;
        const local = elem.name.text;
        const entry = module.attestations.entries.get(imported);
        if (!entry || entry.category !== "stub") {
          continue;
        }
        bindings.set(local, { stubFile: resolved, stubSymbol: imported });
      }
    }

    if (bindings.size === 0) {
      continue;
    }

    // Walk the file and count identifier references to bound names outside
    // import/export clauses and type positions.
    const visit = (node) => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        return;
      }
      if (ts.isIdentifier(node) && bindings.has(node.text)) {
        // Skip if part of an ImportSpecifier already handled above.
        const parent = node.parent;
        if (parent && (ts.isImportSpecifier(parent) || ts.isExportSpecifier(parent))) {
          return;
        }
        const { stubFile, stubSymbol } = bindings.get(node.text);
        const key = `${stubFile}::${stubSymbol}`;
        perStubCallers.get(key)?.push({
          file: importerPath,
          line: toLine(record.sourceFile, node),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(record.sourceFile);
  }

  return perStubCallers;
}

function resolveModuleSpecifier(specifier, importerFile, sourceFileIndex) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return null;
  }
  const importerDir = path.dirname(importerFile);
  const base = specifier.startsWith("/")
    ? path.resolve(repoRoot, specifier.replace(/^\/+/, ""))
    : path.resolve(importerDir, specifier);
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

function formatFailures(failures) {
  const out = [];
  for (const f of failures) {
    out.push(`  ${f.file}:${f.line}  ${f.reason}`);
  }
  return out.join("\n");
}

/**
 * Run invariants 1-3 (structural + "live" vs throwing-shape) on a single
 * attested module. Invariant 4 requires cross-module caller resolution and
 * lives in main() — NOT covered here.
 *
 * @returns {{file: string, line: number, reason: string}[]} failures
 */
function validateModuleStructural({ relPath, exports, attestations, sourceFile }) {
  const failures = [];
  const pushFailure = (line, reason) => failures.push({ file: relPath, line, reason });

  if (!attestations.found) {
    // Only fail if the module has runtime exports. A module with only
    // types / data constants has nothing to attest.
    if (exports.length > 0) {
      pushFailure(1, `missing MODULE_ATTESTATIONS (module has ${exports.length} runtime export(s))`);
    }
    return failures;
  }

  if (attestations.error) {
    pushFailure(toLine(sourceFile, attestations.node), attestations.error);
    return failures;
  }

  const attestedSymbols = new Set(attestations.entries.keys());
  const exportedSymbols = new Set(exports.map((e) => e.symbol));

  // Invariant 1: every runtime export has an attestation.
  for (const exp of exports) {
    if (!attestedSymbols.has(exp.symbol)) {
      pushFailure(exp.line, `export '${exp.symbol}' (${exp.kind}) has no MODULE_ATTESTATIONS entry`);
    }
  }

  // Invariant 2: every attestation corresponds to a current export.
  for (const [symbol, entry] of attestations.entries) {
    if (!exportedSymbols.has(symbol)) {
      pushFailure(entry.line, `stale attestation: '${symbol}' is no longer a runtime export — remove the entry`);
    }
  }

  // Validate category values.
  for (const [symbol, entry] of attestations.entries) {
    if (!VALID_CATEGORIES.has(entry.category)) {
      pushFailure(
        entry.line,
        `invalid category '${entry.category}' for '${symbol}' (must be one of: ${[...VALID_CATEGORIES].join(", ")})`,
      );
    }
  }

  // Invariant 3: "live" attestation must NOT match throwing-stub shape.
  for (const exp of exports) {
    const entry = attestations.entries.get(exp.symbol);
    if (!entry) {
      continue;
    }
    if (entry.category === "live" && exp.looksLikeStub) {
      pushFailure(
        exp.line,
        `'${exp.symbol}' attested "live" but matches throwing-stub pattern — either fix the implementation or re-attest as "stub"/"partial"`,
      );
    }
  }

  return failures;
}

/**
 * Classify a single TypeScript source text for self-tests. Returns enumerated
 * exports, parsed attestations, and structural failures (invariants 1-3).
 * Invariant 4 (stub-with-live-callers) is excluded — it requires cross-module
 * source-file indexing and is exercised by the integration-style run against
 * the real repo.
 */
export function classifyFixture(sourceText, fileName = "fixture.ts") {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const exports = enumerateRuntimeExports(sourceFile);
  const attestations = extractAttestations(sourceFile);
  const failures = validateModuleStructural({
    relPath: fileName,
    exports,
    attestations,
    sourceFile,
  });
  return { exports, attestations, failures };
}

const SELF_TEST_FIXTURES = [
  {
    name: "invariant 1: runtime export without MODULE_ATTESTATIONS fails",
    source: `export function foo() { return 1; }\n`,
    expectedFailures: [/missing MODULE_ATTESTATIONS \(module has 1 runtime export/],
  },
  {
    name: "invariant 1: runtime export missing specific entry fails",
    source: `export const MODULE_ATTESTATIONS = { foo: "live" } as const;\nexport function foo() { return 1; }\nexport function bar() { return 2; }\n`,
    expectedFailures: [/export 'bar' \(function\) has no MODULE_ATTESTATIONS entry/],
  },
  {
    name: "invariant 2: stale entry for non-exported symbol fails",
    source: `export const MODULE_ATTESTATIONS = { foo: "live", ghost: "live" } as const;\nexport function foo() { return 1; }\n`,
    expectedFailures: [/stale attestation: 'ghost'/],
  },
  {
    name: "invariant 3: 'live' on throwing-stub (variadic-unknown) fails",
    source: `export const MODULE_ATTESTATIONS = { foo: "live" } as const;\nexport function foo(..._args: unknown[]): never {\n  throw new Error("not available in RemoteClaw fork");\n}\n`,
    expectedFailures: [/attested "live" but matches throwing-stub pattern/],
  },
  {
    name: "invariant 3: 'stub' on throwing-stub passes (structural)",
    source: `export const MODULE_ATTESTATIONS = { foo: "stub" } as const;\nexport function foo(..._args: unknown[]): never {\n  throw new Error("not available in RemoteClaw fork");\n}\n`,
    expectedFailures: [],
  },
  {
    name: "expression-body arrow is enumerated as runtime export (requires attestation)",
    source: `export const foo = (..._args: unknown[]) => undefined as any;\n`,
    expectedFailures: [/missing MODULE_ATTESTATIONS \(module has 1 runtime export/],
    expectedExports: ["foo"],
  },
  {
    name: "expression-body arrow does NOT match throwing-stub shape (has no throw body)",
    source: `export const MODULE_ATTESTATIONS = { foo: "live" } as const;\nexport const foo = (..._args: unknown[]) => undefined as any;\n`,
    expectedFailures: [],
  },
  {
    name: "invalid category fails",
    source: `export const MODULE_ATTESTATIONS = { foo: "alive" } as const;\nexport function foo() {}\n`,
    expectedFailures: [/invalid category 'alive'/],
  },
  {
    name: "type / interface / literal const exports do NOT require attestation",
    source: `export type Foo = string;\nexport interface Bar { x: number }\nexport const BAZ = "literal";\n`,
    expectedFailures: [],
    expectedExports: [],
  },
  {
    name: "valid module with mixed runtime exports passes",
    source: `export const MODULE_ATTESTATIONS = { foo: "live", bar: "live", Baz: "live" } as const;\nexport function foo() {}\nexport const bar = () => 1;\nexport class Baz {}\n`,
    expectedFailures: [],
    expectedExports: ["foo", "bar", "Baz"],
  },
];

function runSelfTests(streams) {
  let failures = 0;
  streams.stdout.write(`Running ${SELF_TEST_FIXTURES.length} attestation self-tests...\n\n`);

  for (const fixture of SELF_TEST_FIXTURES) {
    const { exports, failures: actualFailures } = classifyFixture(fixture.source);
    const reasons = actualFailures.map((f) => f.reason);
    const expectedMatchers = fixture.expectedFailures;

    let passed = reasons.length === expectedMatchers.length;
    const unmatched = [];
    if (passed) {
      for (const matcher of expectedMatchers) {
        const found = reasons.some((r) => matcher.test(r));
        if (!found) {
          passed = false;
          unmatched.push(matcher);
        }
      }
    }

    if (passed && fixture.expectedExports !== undefined) {
      const actual = exports.map((e) => e.symbol).toSorted();
      const expected = [...fixture.expectedExports].toSorted();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        passed = false;
        unmatched.push(`exports mismatch: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
      }
    }

    const status = passed ? "PASS" : "FAIL";
    streams.stdout.write(`  [${status}] ${fixture.name}\n`);
    if (!passed) {
      failures += 1;
      streams.stdout.write(`    expected: ${JSON.stringify(expectedMatchers.map(String))}\n`);
      streams.stdout.write(`    actual:   ${JSON.stringify(reasons)}\n`);
      if (unmatched.length > 0) {
        streams.stdout.write(`    mismatch: ${JSON.stringify(unmatched.map(String))}\n`);
      }
    }
  }

  streams.stdout.write("\n");
  if (failures === 0) {
    streams.stdout.write(`All ${SELF_TEST_FIXTURES.length} self-tests passed.\n`);
    return 0;
  }
  streams.stderr.write(`${failures} self-test${failures === 1 ? "" : "s"} failed.\n`);
  return 1;
}

export async function main(argv = process.argv.slice(2), io) {
  const streams = io ?? { stdout: process.stdout, stderr: process.stderr };

  if (argv.includes("--self-test")) {
    return runSelfTests(streams);
  }

  const sourceFileIndex = await loadAllSources();
  const attestedModules = [];

  // Pass 1: enumerate exports + extract attestations per attested module.
  for (const [relPath, record] of sourceFileIndex) {
    if (!isAttestedDepthOneFile(record.filePath)) {
      continue;
    }
    const exports = enumerateRuntimeExports(record.sourceFile);
    const attestations = extractAttestations(record.sourceFile);
    attestedModules.push({ relPath, exports, attestations, sourceFile: record.sourceFile });
  }

  const failures = [];

  // Pass 2: invariants 1-3 + category validation (per-module, structural).
  for (const module of attestedModules) {
    failures.push(...validateModuleStructural(module));
  }

  // Invariant 4: "stub" attestation must have zero non-test importers.
  const perStubCallers = findStubCallers(attestedModules, sourceFileIndex);
  for (const module of attestedModules) {
    for (const [symbol, entry] of module.attestations.entries) {
      if (entry.category !== "stub") {
        continue;
      }
      const key = `${module.relPath}::${symbol}`;
      const callers = perStubCallers.get(key) ?? [];
      if (callers.length > 0) {
        callers.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
        const list = callers
          .slice(0, 5)
          .map((c) => `${c.file}:${c.line}`)
          .join(", ");
        const more = callers.length > 5 ? `, +${callers.length - 5} more` : "";
        failures.push({
          file: module.relPath,
          line: entry.line,
          reason: `'${symbol}' attested "stub" but has ${callers.length} non-test caller(s): ${list}${more}`,
        });
      }
    }
  }

  if (failures.length === 0) {
    streams.stdout.write(
      `Module attestation check passed: ${attestedModules.length} modules, ${attestedModules.reduce((s, m) => s + m.attestations.entries.size, 0)} attestations.\n`,
    );
    return 0;
  }

  failures.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  streams.stderr.write(`FAIL: ${failures.length} attestation violation(s):\n\n`);
  streams.stderr.write(`${formatFailures(failures)}\n`);
  streams.stderr.write(
    "\nModule attestations declare the runtime status of each export.\n" +
      "See CONTRIBUTING.md § Module attestations for the convention and\n" +
      "category definitions (live / stub / partial / deprecated).\n",
  );
  return 1;
}

runAsScript(import.meta.url, async () => {
  const exitCode = await main();
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
});
