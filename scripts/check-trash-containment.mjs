#!/usr/bin/env node

/**
 * Trash-containment gate — pins `allowedRoots` at every owned-state deletion
 * sink to roots resolved INDEPENDENTLY of the deletion target.
 *
 * `movePathToTrash`'s `allowedRoots` is checked by `assertWithinAllowedRoots`
 * (`src/infra/fs-safe-trash.ts`), which asks whether the fully-resolved target
 * lives under one of the roots. That question only has a meaningful answer when
 * the roots are known independently of the target: roots DERIVED from the target
 * canonicalize to wherever the target canonicalizes, so `isPathInside` is
 * trivially true and the guard can never reject. That was the #3102 defect —
 * `resolveMoveToTrashAllowedRoots` handed back `dirname(sourcePath)` and, for a
 * symlink, `dirname(realpath(sourcePath))`, admitting the escape destination by
 * construction. An API advertising containment while providing none is worse
 * than no API, because the next caller trusts it.
 *
 * This gate is a REGRESSION GUARD: the invariant already holds at every sink as
 * of #3102. It exists so a later refactor cannot quietly re-derive the roots
 * from the target and leave a green build behind.
 *
 * A "governed sink" is a call, in one of the registered owned-state deletion
 * files, to `movePathToTrash` or to any wrapper that forwards an allowed-roots
 * argument to it (`moveToTrash`, `moveToTrashBestEffort` — discovered from the
 * source, not hardcoded). Each such call's roots expression is classified:
 *
 *   owned           — `resolveOwnedStateRoots()`, or an identifier bound to it,
 *                     optionally spread into an array literal alongside
 *                     declared-parent terms. PASSES.
 *   declared-parent — `path.dirname(path.resolve(x))`, admitted ONLY as an extra
 *                     term beside an owned spread. This is the bound available
 *                     for a target the user may legitimately place anywhere (the
 *                     full-reset workspace, a config-declared `agentDir`); it
 *                     still rejects a symlink escaping that parent.
 *   forwarded       — the roots come from a parameter of the enclosing function.
 *                     EXEMPT: the bound is the caller's responsibility, and the
 *                     wrapper's own call sites are checked instead.
 *   missing         — no allowed-roots argument at all. FAILS.
 *   realpath        — the expression canonicalizes the target. FAILS: this is
 *                     the exact pre-#3102 escape-admitting shape.
 *   unknown         — provenance the classifier cannot trace to an owned root.
 *                     FAILS CLOSED — an unprovable bound is not a bound.
 *
 * Deliberately NOT governed: `src/browser/*` and `src/cli/browser-cli-extension.ts`
 * trash browser profile directories, which are user-configured and may live
 * anywhere, so they pass no roots at all by design. Those sites are reported as
 * an ungoverned-sink inventory rather than silently omitted.
 *
 * Usage:
 *   node scripts/check-trash-containment.mjs             # check the repo
 *   node scripts/check-trash-containment.mjs --self-test # fixture classifier tests
 *   node scripts/check-trash-containment.mjs --json      # machine-readable
 *   node scripts/check-trash-containment.mjs --root DIR  # check an alternate tree
 *
 * `--root` exists so the gate can be pointed at a reconstructed pre-#3102 tree
 * and shown to FAIL against it. A regression guard that only ever passes proves
 * nothing; see the PR for #3117 for that falsification run.
 *
 * Reference: #3102 (the defect and its fix), #3117 (this gate).
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  isTestLikeTypeScriptFile,
  resolveRepoRoot,
  runAsScript,
  toLine,
  unwrapExpression,
} from "./lib/ts-guard-utils.mjs";

const OWNED_ROOTS_RESOLVER = "resolveOwnedStateRoots";
const ROOTS_PROPERTY = "allowedRoots";

/**
 * The owned-state deletion sinks. Each entry MUST exist and MUST contain at
 * least one governed trash call — a registry that has drifted off its subject
 * would otherwise pass by evaluating nothing.
 */
const GOVERNED_SINKS = [
  {
    file: "src/commands/onboard-helpers.ts",
    what: "`handleReset` — config file, credentials, agents tree, full-reset workspace",
  },
  {
    file: "src/commands/agents.commands.delete.ts",
    what: "CLI `agents delete` — agent dir + session transcripts",
  },
  {
    file: "src/gateway/server-methods/agents.ts",
    what: "`agents.delete` gateway RPC — the most exposed trash sink in the tree",
  },
];

/** Roots inventory is scanned across these roots to find ungoverned sinks. */
const INVENTORY_ROOTS = ["src", "extensions", "ui"];

/** The base primitive. */
const TRASH_PRIMITIVE = "movePathToTrash";

/**
 * Wrappers that forward an allowed-roots argument to the primitive. These are
 * DISCOVERED from the source, so a newly-named wrapper is covered automatically
 * — but the known names are also seeded, because discovery can only recognize a
 * wrapper that still forwards roots. A regression reverting one to compute its
 * roots internally would otherwise make every one of its call sites invisible
 * to this gate, which is precisely the shape being guarded against.
 */
const KNOWN_WRAPPERS = ["moveToTrash", "moveToTrashBestEffort"];

// ---------------------------------------------------------------------------
// AST helpers
// ---------------------------------------------------------------------------

function parseSource(filePath, content) {
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

/** Strip parens/casts and `await`, which never change roots provenance. */
function unwrapRootsExpression(expression) {
  let current = unwrapExpression(expression);
  while (ts.isAwaitExpression(current)) {
    current = unwrapExpression(current.expression);
  }
  return current;
}

/** The identifier a call expression resolves to, ignoring the receiver. */
function calleeName(node) {
  const callee = unwrapExpression(node.expression);
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  if (ts.isPropertyAccessExpression(callee)) {
    return callee.name.text;
  }
  return null;
}

/** True for `path.dirname(...)` / a bare `dirname(...)`. */
function isPathCall(node, fnName) {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  const callee = unwrapExpression(node.expression);
  if (ts.isIdentifier(callee)) {
    return callee.text === fnName;
  }
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === fnName &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "path"
  );
}

/**
 * `path.dirname(path.resolve(x))` — the declared parent of a target the user
 * may legitimately place anywhere. Note what this REJECTS: a bare
 * `path.dirname(target)` (the target's own lexical parent) and anything routed
 * through `realpath` (the target's canonical parent, i.e. the escape
 * destination). Both were pre-#3102 shapes.
 */
function isDeclaredParent(expression) {
  const node = unwrapRootsExpression(expression);
  if (!isPathCall(node, "dirname") || node.arguments.length !== 1) {
    return false;
  }
  return isPathCall(unwrapRootsExpression(node.arguments[0]), "resolve");
}

/** Any canonicalization of the target anywhere inside the roots expression. */
function containsRealpath(expression) {
  let found = false;
  const visit = (node) => {
    if (found) {
      return;
    }
    if (ts.isIdentifier(node) && /^realpath/iu.test(node.text)) {
      found = true;
      return;
    }
    if (ts.isPropertyAccessExpression(node) && /^realpath/iu.test(node.name.text)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

// ---------------------------------------------------------------------------
// Per-file indexing
// ---------------------------------------------------------------------------

/** Identifiers bound to `resolveOwnedStateRoots()` anywhere in the file. */
function collectOwnedBindings(sourceFile) {
  const bound = new Set();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = unwrapRootsExpression(node.initializer);
      if (ts.isCallExpression(initializer) && calleeName(initializer) === OWNED_ROOTS_RESOLVER) {
        bound.add(node.name.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bound;
}

/** Identifiers bound to an array literal, so `const roots = [...]` is traceable. */
function collectArrayBindings(sourceFile) {
  const bound = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const initializer = unwrapRootsExpression(node.initializer);
      if (ts.isArrayLiteralExpression(initializer)) {
        bound.set(node.name.text, initializer);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return bound;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

/** The declared name of a function-like, including `const f = () => {}`. */
function functionLikeName(node) {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return node.name && ts.isIdentifier(node.name) ? node.name.text : null;
  }
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return parent.name.text;
  }
  return null;
}

/**
 * Walk every call expression, carrying the chain of enclosing function-likes so
 * a roots expression can be traced back to a parameter.
 */
function forEachCall(sourceFile, visitCall) {
  const walk = (node, fnChain) => {
    let chain = fnChain;
    if (isFunctionLike(node)) {
      const params = new Map();
      node.parameters.forEach((parameter, index) => {
        if (ts.isIdentifier(parameter.name)) {
          params.set(parameter.name.text, index);
        }
      });
      chain = [...fnChain, { node, name: functionLikeName(node), params }];
    }
    if (ts.isCallExpression(node)) {
      visitCall(node, chain);
    }
    ts.forEachChild(node, (child) => walk(child, chain));
  };
  walk(sourceFile, []);
}

/** The innermost enclosing function that declares `name` as a parameter. */
function findOwningParameter(fnChain, name) {
  for (let index = fnChain.length - 1; index >= 0; index -= 1) {
    const frame = fnChain[index];
    if (frame.params.has(name)) {
      return { frame, argIndex: frame.params.get(name) };
    }
  }
  return null;
}

/**
 * Extract the roots expression a trash call passes, given where this callee
 * carries it. Handles `{ allowedRoots: X }`, the `{ allowedRoots }` shorthand,
 * and a bare positional roots argument.
 */
function extractRootsExpression(node, signature) {
  // A seeded wrapper whose exact signature was never discovered: the roots may
  // sit at any argument position, so look for the property in every argument.
  if (signature.fallback) {
    for (const argument of node.arguments) {
      const found = readRootsProperty(node, argument, ROOTS_PROPERTY);
      if (found) {
        return found;
      }
    }
    return null;
  }
  const argument = node.arguments[signature.rootsArgIndex];
  if (!argument) {
    return null;
  }
  if (!signature.rootsProperty) {
    return argument;
  }
  const object = unwrapRootsExpression(argument);
  if (!ts.isObjectLiteralExpression(object)) {
    // A spread-built or variable options object: not traceable here, and
    // fail-closed classification downstream will reject it.
    return argument;
  }
  return readRootsProperty(node, argument, signature.rootsProperty);
}

/** Read `{ <name>: X }` or the `{ <name> }` shorthand off an argument. */
function readRootsProperty(node, argument, name) {
  const object = unwrapRootsExpression(argument);
  if (!ts.isObjectLiteralExpression(object)) {
    return null;
  }
  for (const property of object.properties) {
    if (ts.isPropertyAssignment(property) && property.name.getText(node.getSourceFile()) === name) {
      return property.initializer;
    }
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) {
      return property.name;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Classify a roots expression. Returns one of the verdicts documented in the
 * header. Anything unrecognized is `unknown`, which FAILS: the gate must be
 * able to PROVE the roots are target-independent, not merely fail to disprove it.
 */
function classifyRoots(expression, context, fnChain) {
  if (containsRealpath(expression)) {
    return { verdict: "realpath", detail: "roots canonicalize the target (pre-#3102 shape)" };
  }
  const node = unwrapRootsExpression(expression);

  if (ts.isCallExpression(node)) {
    if (calleeName(node) === OWNED_ROOTS_RESOLVER) {
      return { verdict: "owned", detail: `${OWNED_ROOTS_RESOLVER}()` };
    }
    return {
      verdict: "unknown",
      detail: `roots come from ${calleeName(node) ?? "a call"}(), not ${OWNED_ROOTS_RESOLVER}()`,
    };
  }

  if (ts.isIdentifier(node)) {
    if (context.ownedBindings.has(node.text)) {
      return { verdict: "owned", detail: `\`${node.text}\` = ${OWNED_ROOTS_RESOLVER}()` };
    }
    if (findOwningParameter(fnChain, node.text)) {
      return { verdict: "forwarded", detail: `\`${node.text}\` is a parameter` };
    }
    const arrayBinding = context.arrayBindings.get(node.text);
    if (arrayBinding) {
      return classifyRoots(arrayBinding, context, fnChain);
    }
    return {
      verdict: "unknown",
      detail: `\`${node.text}\` does not trace to ${OWNED_ROOTS_RESOLVER}()`,
    };
  }

  if (ts.isPropertyAccessExpression(node)) {
    const object = unwrapRootsExpression(node.expression);
    if (ts.isIdentifier(object) && findOwningParameter(fnChain, object.text)) {
      return {
        verdict: "forwarded",
        detail: `\`${object.text}.${node.name.text}\` is a parameter`,
      };
    }
    return { verdict: "unknown", detail: "roots read off a non-parameter object" };
  }

  if (ts.isArrayLiteralExpression(node)) {
    if (node.elements.length === 0) {
      return { verdict: "unknown", detail: "empty roots array disables the containment check" };
    }
    let sawOwned = false;
    const extras = [];
    for (const element of node.elements) {
      if (ts.isSpreadElement(element)) {
        const inner = classifyRoots(element.expression, context, fnChain);
        if (inner.verdict === "owned") {
          sawOwned = true;
          continue;
        }
        return {
          verdict: inner.verdict === "forwarded" ? "unknown" : inner.verdict,
          detail: `spread term is not owned: ${inner.detail}`,
        };
      }
      if (isDeclaredParent(element)) {
        extras.push("path.dirname(path.resolve(…))");
        continue;
      }
      return {
        verdict: "unknown",
        detail: "extra root term is not `path.dirname(path.resolve(x))`",
      };
    }
    if (!sawOwned) {
      return { verdict: "unknown", detail: `array has no \`...${OWNED_ROOTS_RESOLVER}()\` term` };
    }
    return {
      verdict: "owned",
      detail: extras.length > 0 ? `owned roots + ${extras.join(", ")}` : "owned roots",
    };
  }

  return { verdict: "unknown", detail: "unrecognized roots expression" };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Discover wrappers: a function whose body forwards one of its own parameters
 * as the roots argument of a known trash callee. Iterates to a fixed point so a
 * wrapper around a wrapper is also found.
 */
function discoverSignatures(parsedFiles) {
  const signatures = new Map([
    [TRASH_PRIMITIVE, { rootsArgIndex: 1, rootsProperty: ROOTS_PROPERTY, wrapper: false }],
  ]);
  for (const wrapper of KNOWN_WRAPPERS) {
    signatures.set(wrapper, {
      rootsArgIndex: -1,
      rootsProperty: null,
      wrapper: true,
      fallback: true,
    });
  }

  // A seeded wrapper is refined once its real signature is observed; a wrapper
  // discovered exactly is never downgraded.
  const canRefine = (name) => !signatures.has(name) || signatures.get(name).fallback === true;

  for (let round = 0; round < 8; round += 1) {
    let changed = false;
    for (const { sourceFile } of parsedFiles) {
      forEachCall(sourceFile, (node, fnChain) => {
        const name = calleeName(node);
        const signature = name ? signatures.get(name) : null;
        if (!signature) {
          return;
        }
        const rootsExpression = extractRootsExpression(node, signature);
        if (!rootsExpression) {
          return;
        }
        const roots = unwrapRootsExpression(rootsExpression);

        // `f(target, roots)` forwarding a bare parameter.
        if (ts.isIdentifier(roots)) {
          const owner = findOwningParameter(fnChain, roots.text);
          if (owner?.frame.name && canRefine(owner.frame.name)) {
            signatures.set(owner.frame.name, {
              rootsArgIndex: owner.argIndex,
              rootsProperty: null,
              wrapper: true,
            });
            changed = true;
          }
          return;
        }

        // `f(target, runtime, options)` forwarding `options.allowedRoots`.
        if (ts.isPropertyAccessExpression(roots)) {
          const object = unwrapRootsExpression(roots.expression);
          if (!ts.isIdentifier(object)) {
            return;
          }
          const owner = findOwningParameter(fnChain, object.text);
          if (owner?.frame.name && canRefine(owner.frame.name)) {
            signatures.set(owner.frame.name, {
              rootsArgIndex: owner.argIndex,
              rootsProperty: roots.name.text,
              wrapper: true,
            });
            changed = true;
          }
        }
      });
    }
    if (!changed) {
      break;
    }
  }
  return signatures;
}

/** Classify every governed trash call in the parsed sink files. */
function analyzeSinks(parsedFiles, signatures) {
  const calls = [];
  for (const { relativePath, sourceFile } of parsedFiles) {
    const context = {
      ownedBindings: collectOwnedBindings(sourceFile),
      arrayBindings: collectArrayBindings(sourceFile),
    };
    forEachCall(sourceFile, (node, fnChain) => {
      const name = calleeName(node);
      const signature = name ? signatures.get(name) : null;
      if (!signature) {
        return;
      }
      const line = toLine(sourceFile, node);
      const rootsExpression = extractRootsExpression(node, signature);
      if (!rootsExpression) {
        calls.push({
          file: relativePath,
          line,
          callee: name,
          verdict: "missing",
          detail: "no allowed-roots argument — the containment check is disabled",
          text: node.getText(sourceFile).split("\n")[0].slice(0, 100),
        });
        return;
      }
      const { verdict, detail } = classifyRoots(rootsExpression, context, fnChain);
      calls.push({
        file: relativePath,
        line,
        callee: name,
        verdict,
        detail,
        text: rootsExpression.getText(sourceFile).replace(/\s+/gu, " ").slice(0, 100),
      });
    });
  }
  return calls;
}

async function readIfPresent(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function collectTsFiles(dir, out = []) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      await collectTsFiles(entryPath, out);
      continue;
    }
    if (entry.isFile() && entryPath.endsWith(".ts") && !isTestLikeTypeScriptFile(entryPath)) {
      out.push(entryPath);
    }
  }
  return out;
}

/** True when the file has a named import of `symbol` (not a mere mention). */
function importsSymbol(sourceFile, symbol) {
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (const element of bindings.elements) {
      if ((element.propertyName ?? element.name).text === symbol) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Files outside the registry that import `resolveOwnedStateRoots` (a new owned-
 * state sink the registry does not know about) or that trash without any bound
 * (the deliberate browser posture, reported for honesty).
 */
async function surveyUngoverned(repoRoot, governedPaths) {
  const unregistered = [];
  const unbounded = [];
  for (const root of INVENTORY_ROOTS) {
    for (const filePath of await collectTsFiles(path.join(repoRoot, root))) {
      const relativePath = path.relative(repoRoot, filePath).split(path.sep).join("/");
      if (governedPaths.has(relativePath)) {
        continue;
      }
      const content = await fs.readFile(filePath, "utf8");
      if (!content.includes(TRASH_PRIMITIVE) && !content.includes(OWNED_ROOTS_RESOLVER)) {
        continue;
      }
      const sourceFile = parseSource(filePath, content);
      if (importsSymbol(sourceFile, OWNED_ROOTS_RESOLVER)) {
        unregistered.push(relativePath);
      }
      forEachCall(sourceFile, (node) => {
        if (calleeName(node) !== TRASH_PRIMITIVE) {
          return;
        }
        if (!extractRootsExpression(node, { rootsArgIndex: 1, rootsProperty: ROOTS_PROPERTY })) {
          unbounded.push(`${relativePath}:${toLine(sourceFile, node)}`);
        }
      });
    }
  }
  const byName = (a, b) => a.localeCompare(b);
  return {
    unregistered: [...new Set(unregistered)].toSorted(byName),
    unbounded: unbounded.toSorted(byName),
  };
}

export async function runCheck({ repoRoot } = {}) {
  const root = repoRoot ?? resolveRepoRoot(import.meta.url);
  const parsedFiles = [];
  const missingFiles = [];

  for (const sink of GOVERNED_SINKS) {
    const absolute = path.join(root, ...sink.file.split("/"));
    const content = await readIfPresent(absolute);
    if (content === null) {
      missingFiles.push(sink.file);
      continue;
    }
    parsedFiles.push({
      relativePath: sink.file,
      what: sink.what,
      sourceFile: parseSource(absolute, content),
    });
  }

  const signatures = discoverSignatures(parsedFiles);
  const calls = analyzeSinks(parsedFiles, signatures);

  // Degenerate-subject guard: a registered sink that yields no governed call is
  // a gate that has lost its subject, which must FAIL rather than pass silently.
  const emptySinks = parsedFiles
    .filter(({ relativePath }) => !calls.some((call) => call.file === relativePath))
    .map(({ relativePath }) => relativePath);

  const violations = calls.filter((call) => !["owned", "forwarded"].includes(call.verdict));
  const survey = await surveyUngoverned(root, new Set(GOVERNED_SINKS.map((sink) => sink.file)));

  return {
    repoRoot: root,
    signatures: [...signatures.entries()].map(([name, signature]) => ({ name, ...signature })),
    calls,
    violations,
    missingFiles,
    emptySinks,
    survey,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function writeLine(stream, text) {
  stream.write(`${text}\n`);
}

function formatCall(call) {
  return `  ${call.file}:${call.line} ${call.callee}(…) → ${call.verdict} — ${call.detail}`;
}

export async function main(argv = process.argv.slice(2), io) {
  const streams = io ?? { stdout: process.stdout, stderr: process.stderr };
  if (argv.includes("--self-test")) {
    return runSelfTests(streams);
  }
  const rootFlagIndex = argv.indexOf("--root");
  const repoRoot = rootFlagIndex >= 0 ? path.resolve(argv[rootFlagIndex + 1] ?? ".") : undefined;
  const json = argv.includes("--json");

  const result = await runCheck({ repoRoot });

  if (json) {
    writeLine(streams.stdout, JSON.stringify(result, null, 2));
    return result.violations.length + result.missingFiles.length + result.emptySinks.length > 0
      ? 1
      : 0;
  }

  writeLine(
    streams.stdout,
    `Trash-containment inventory (${result.calls.length} governed call${result.calls.length === 1 ? "" : "s"} across ${GOVERNED_SINKS.length} sink${GOVERNED_SINKS.length === 1 ? "" : "s"}):`,
  );
  for (const call of result.calls) {
    writeLine(streams.stdout, formatCall(call));
  }
  if (result.calls.length === 0) {
    writeLine(streams.stdout, "  (none)");
  }

  writeLine(
    streams.stdout,
    `\nTrash callees resolved: ${result.signatures.map((signature) => signature.name).join(", ")}`,
  );

  if (result.survey.unbounded.length > 0) {
    writeLine(
      streams.stdout,
      `\nUngoverned trash sites (unbounded by design — browser profile dirs live anywhere): ${result.survey.unbounded.length}`,
    );
    for (const site of result.survey.unbounded) {
      writeLine(streams.stdout, `  ${site}`);
    }
  }

  const failures = [];
  if (result.missingFiles.length > 0) {
    failures.push(
      `${result.missingFiles.length} registered sink file${result.missingFiles.length === 1 ? "" : "s"} not found:\n${result.missingFiles.map((file) => `  ${file}`).join("\n")}`,
    );
  }
  if (result.emptySinks.length > 0) {
    failures.push(
      `${result.emptySinks.length} registered sink${result.emptySinks.length === 1 ? "" : "s"} matched NO trash call — the gate lost its subject:\n${result.emptySinks.map((file) => `  ${file}`).join("\n")}`,
    );
  }
  if (result.survey.unregistered.length > 0) {
    failures.push(
      `${result.survey.unregistered.length} file${result.survey.unregistered.length === 1 ? " imports" : "s import"} ${OWNED_ROOTS_RESOLVER} but ${result.survey.unregistered.length === 1 ? "is" : "are"} not a registered sink:\n${result.survey.unregistered.map((file) => `  ${file}`).join("\n")}`,
    );
  }
  if (result.violations.length > 0) {
    failures.push(
      `${result.violations.length} governed trash call${result.violations.length === 1 ? "" : "s"} without target-independent roots:\n${result.violations.map(formatCall).join("\n")}`,
    );
  }

  if (failures.length > 0) {
    writeLine(streams.stderr, "");
    writeLine(streams.stderr, "FAIL: trash-containment gate");
    for (const failure of failures) {
      writeLine(streams.stderr, `\n${failure}`);
    }
    writeLine(
      streams.stderr,
      [
        "",
        "`allowedRoots` bounds nothing unless the caller knows the roots",
        "independently of the deletion target: roots derived from the target",
        "canonicalize wherever the target canonicalizes, so the containment check",
        "in `assertWithinAllowedRoots` is trivially true and can never reject.",
        "That was the #3102 defect; this gate keeps it fixed.",
        "",
        "To resolve:",
        `  1. Source the roots from \`${OWNED_ROOTS_RESOLVER}()\` (src/config/trash-roots.ts).`,
        "  2. If the target is user-configured and may legitimately live anywhere,",
        "     admit its declared parent alongside them:",
        `       { ${ROOTS_PROPERTY}: [...ownedRoots, path.dirname(path.resolve(target))] }`,
        "     Never `path.dirname(await fs.realpath(target))` — that admits the",
        "     escape destination by construction.",
        "  3. If a new owned-state deletion sink was added, register it in",
        "     GOVERNED_SINKS in this script so it is covered.",
      ].join("\n"),
    );
    return 1;
  }

  writeLine(
    streams.stdout,
    `\nTrash-containment check passed (${result.calls.length} governed calls, ${result.calls.filter((call) => call.verdict === "owned").length} owned-rooted, ${result.calls.filter((call) => call.verdict === "forwarded").length} forwarded to a caller-supplied bound).`,
  );
  return 0;
}

// ---------------------------------------------------------------------------
// Self-tests
// ---------------------------------------------------------------------------

/** Run the full sink analysis over a single synthetic file. */
export function classifyFixture(sourceText, fileName = "src/commands/onboard-helpers.ts") {
  const parsedFiles = [{ relativePath: fileName, sourceFile: parseSource(fileName, sourceText) }];
  const signatures = discoverSignatures(parsedFiles);
  return analyzeSinks(parsedFiles, signatures);
}

const SELF_TEST_FIXTURES = [
  {
    name: "HEAD shape — roots from resolveOwnedStateRoots() via a local binding",
    source: `async function handleReset() {\n  const ownedRoots = resolveOwnedStateRoots();\n  await movePathToTrash(target, { allowedRoots: ownedRoots });\n}\n`,
    expectViolations: 0,
  },
  {
    name: "HEAD shape — owned spread plus a declared parent",
    source: `async function handleReset(workspaceDir) {\n  const ownedRoots = resolveOwnedStateRoots();\n  await movePathToTrash(workspaceDir, {\n    allowedRoots: [...ownedRoots, path.dirname(path.resolve(workspaceDir))],\n  });\n}\n`,
    expectViolations: 0,
  },
  {
    name: "HEAD shape — inline resolveOwnedStateRoots() call",
    source: `async function reset() {\n  await movePathToTrash(target, { allowedRoots: resolveOwnedStateRoots() });\n}\n`,
    expectViolations: 0,
  },
  {
    name: "HEAD shape — wrapper forwarding its own roots parameter is exempt",
    source: `async function moveToTrash(pathname, runtime, options) {\n  await movePathToTrash(pathname, { allowedRoots: options.allowedRoots });\n}\n`,
    expectViolations: 0,
  },
  {
    name: "HEAD shape — wrapper forwarding a bare roots parameter is exempt",
    source: `async function best(pathname, allowedRoots) {\n  await movePathToTrash(pathname, { allowedRoots });\n}\n`,
    expectViolations: 0,
  },
  {
    name: "pre-#3102 — roots from a target-derived helper",
    source: `async function moveToTrash(pathname) {\n  await movePathToTrash(pathname, {\n    allowedRoots: await resolveMoveToTrashAllowedRoots(pathname),\n  });\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["unknown"],
  },
  {
    name: "pre-#3102 — no roots argument at all",
    source: `async function handleReset() {\n  await movePathToTrash(resolveConfigPath());\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["missing"],
  },
  {
    name: "pre-#3102 — realpath-derived root admits the escape destination",
    source: `async function moveToTrash(sourcePath) {\n  await movePathToTrash(sourcePath, {\n    allowedRoots: [path.dirname(await fs.realpath(sourcePath))],\n  });\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["realpath"],
  },
  {
    name: "re-admission — realpath term smuggled in beside owned roots",
    source: `async function reset(target) {\n  const ownedRoots = resolveOwnedStateRoots();\n  await movePathToTrash(target, {\n    allowedRoots: [...ownedRoots, path.dirname(await fs.realpath(target))],\n  });\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["realpath"],
  },
  {
    name: "target-derived — bare path.dirname(target) is the target's own parent",
    source: `async function reset(target) {\n  const ownedRoots = resolveOwnedStateRoots();\n  await movePathToTrash(target, { allowedRoots: [...ownedRoots, path.dirname(target)] });\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["unknown"],
  },
  {
    name: "target-derived — array of target-derived roots with no owned term",
    source: `async function reset(target) {\n  await movePathToTrash(target, { allowedRoots: [path.dirname(path.resolve(target))] });\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["unknown"],
  },
  {
    name: "empty roots array disables the containment check",
    source: `async function reset(target) {\n  await movePathToTrash(target, { allowedRoots: [] });\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["unknown"],
  },
  {
    name: "untraceable binding fails closed rather than passing",
    source: `async function reset(target) {\n  const roots = computeRootsSomehow();\n  await movePathToTrash(target, { allowedRoots: roots });\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["unknown"],
  },
  {
    name: "wrapper call site — bounded through a discovered wrapper",
    source: `async function best(pathname, allowedRoots) {\n  await movePathToTrash(pathname, { allowedRoots });\n}\nasync function del(agentDir) {\n  const ownedRoots = resolveOwnedStateRoots();\n  await best(agentDir, [...ownedRoots, path.dirname(path.resolve(agentDir))]);\n}\n`,
    expectViolations: 0,
  },
  {
    name: "wrapper call site — unbounded through a discovered wrapper",
    source: `async function best(pathname, allowedRoots) {\n  await movePathToTrash(pathname, { allowedRoots });\n}\nasync function del(agentDir) {\n  await best(agentDir);\n}\n`,
    expectViolations: 1,
    expectVerdicts: ["missing"],
  },
];

function runSelfTests(streams) {
  let failures = 0;
  writeLine(streams.stdout, `Running ${SELF_TEST_FIXTURES.length} classifier self-tests...\n`);

  for (const fixture of SELF_TEST_FIXTURES) {
    const calls = classifyFixture(fixture.source);
    const violations = calls.filter((call) => !["owned", "forwarded"].includes(call.verdict));
    let passed = violations.length === fixture.expectViolations;
    let detail = "";
    if (!passed) {
      detail = ` — expected ${fixture.expectViolations} violation(s), got ${violations.length}: ${JSON.stringify(calls.map((call) => `${call.verdict}:${call.detail}`))}`;
    }
    if (passed && fixture.expectVerdicts) {
      const byName = (a, b) => a.localeCompare(b);
      const actual = violations.map((violation) => violation.verdict).toSorted(byName);
      const expected = [...fixture.expectVerdicts].toSorted(byName);
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        passed = false;
        detail = ` — verdict mismatch: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`;
      }
    }
    writeLine(
      streams.stdout,
      `  [${passed ? "PASS" : "FAIL"}] ${fixture.name}${passed ? "" : detail}`,
    );
    if (!passed) {
      failures += 1;
    }
  }

  writeLine(streams.stdout, "");
  if (failures === 0) {
    writeLine(streams.stdout, `All ${SELF_TEST_FIXTURES.length} self-tests passed.`);
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
