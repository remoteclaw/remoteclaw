/**
 * Shared AST classifier for the "throwing-stub" shape used by the fork's
 * two-stage stub-regression defense:
 *
 *   1. `check-throwing-stub-callers.mjs` (ADR 0005 H7) — catches exported
 *      throwing stubs that have live non-test callers.
 *   2. `check-attestations.mjs` (ADR 0005 H9) — cross-checks that a module
 *      author's "live" attestation isn't lying about a throwing-shaped body.
 *   3. `generate-attestations.mjs` — auto-classifies "stub" during the
 *      one-shot rollout of MODULE_ATTESTATIONS blocks.
 *
 * All three consume the same four calibration signals (remoteclaw#2435):
 *   A. Variadic-unknown signature:  `(..._args: unknown[])`
 *   B. Fork-attributed throw message: "not available in RemoteClaw fork",
 *      "gutted", "upstream-compat"
 *   C. `// Gutted in RemoteClaw fork` marker comment on the declaration
 *   D. `: never` return type with NO typed non-variadic-unknown parameters
 *      (so typed error-throw helpers like `exitHooksCliWithError(err: unknown): never`
 *      remain unflagged)
 *
 * Centralizing the shape tests here ensures that a fix to one invariant
 * (e.g., expression-body arrow handling) applies uniformly and can't drift
 * between the three scripts.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let tsCache;

function getTypeScript() {
  tsCache ??= require("typescript");
  return tsCache;
}

/** Fork-attributed throw message pattern (Patterns B and C from #2409). */
export const forkMessagePattern = /not available in RemoteClaw fork|\bgutted\b|upstream-compat/i;

/** Marker-comment pattern for explicit upstream-compat stubs. */
export const markerCommentPattern = /Gutted in RemoteClaw fork/i;

/** True if a function-like body is a block containing exactly one throw statement. */
export function isSingleThrowBody(body) {
  const ts = getTypeScript();
  if (!body || !ts.isBlock(body)) {
    return false;
  }
  if (body.statements.length !== 1) {
    return false;
  }
  return ts.isThrowStatement(body.statements[0]);
}

/** Extract the string argument of a `throw new Error("...")` expression, or null. */
export function throwMessageOf(throwStatement) {
  const ts = getTypeScript();
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

/** Is the type node `unknown[]` / `readonly unknown[]` / `Array<unknown>`? */
export function isUnknownArrayType(type) {
  const ts = getTypeScript();
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
  return false;
}

/** Does the parameter list include `...args: unknown[]` / `..._args: unknown[]`? */
export function hasVariadicUnknownArgs(parameters) {
  for (const param of parameters) {
    if (param.dotDotDotToken && param.type && isUnknownArrayType(param.type)) {
      return true;
    }
  }
  return false;
}

/** Is the return type annotation an explicit `: never` TypeNode? */
export function hasNeverReturnType(returnType) {
  const ts = getTypeScript();
  return returnType !== undefined && returnType.kind === ts.SyntaxKind.NeverKeyword;
}

/**
 * Does the parameter list contain a typed non-variadic-unknown parameter?
 *
 * Used to preserve the implicit typed-helper exclusion when `: never` fires
 * as a calibration signal — `exitHooksCliWithError(err: unknown): never`,
 * `throwPathEscapesBoundary(params: {...}): never` keep their legitimate
 * signatures without being misclassified.
 */
export function hasTypedNonVariadicUnknownParams(parameters) {
  for (const param of parameters) {
    if (!param.type) {
      continue;
    }
    if (param.dotDotDotToken) {
      if (isUnknownArrayType(param.type)) {
        continue;
      }
      return true;
    }
    return true;
  }
  return false;
}

/** Does the leading-comment range of `node` contain the "Gutted in RemoteClaw fork" marker? */
export function hasMarkerComment(node, fullText) {
  const ts = getTypeScript();
  const ranges = ts.getLeadingCommentRanges(fullText, node.getFullStart());
  if (!ranges) {
    return false;
  }
  for (const range of ranges) {
    if (markerCommentPattern.test(fullText.slice(range.pos, range.end))) {
      return true;
    }
  }
  return false;
}

/**
 * Classify a function-like (FunctionDeclaration, ArrowFunction, FunctionExpression)
 * against the four calibration signals.
 *
 * @param {object} input
 * @param {unknown} input.body — function body; pass `undefined` for
 *   expression-body arrows (they can't match "single throw" anyway).
 * @param {readonly unknown[]} input.parameters — parameter declarations.
 * @param {unknown} input.returnType — return type annotation, or undefined.
 * @param {unknown} input.ownerNode — the declaration node (for leading-comment scan).
 * @param {string} input.fullText — source text of the containing file.
 * @returns {null | { signals: string[], message: string | null }}
 *   null if the function-like is NOT a throwing stub; otherwise the matching
 *   calibration signals and (if present) the extracted throw message.
 */
export function classifyThrowingStubShape({ body, parameters, returnType, ownerNode, fullText }) {
  if (!isSingleThrowBody(body)) {
    return null;
  }
  const throwStatement = body.statements[0];
  const message = throwMessageOf(throwStatement);

  const variadicUnknown = hasVariadicUnknownArgs(parameters);
  const forkMessage = message !== null && forkMessagePattern.test(message);
  const markerComment = hasMarkerComment(ownerNode, fullText);
  const neverReturn = hasNeverReturnType(returnType);
  const hasTypedParams = hasTypedNonVariadicUnknownParams(parameters);
  const neverReturnSignal = neverReturn && !hasTypedParams;

  if (!variadicUnknown && !forkMessage && !markerComment && !neverReturnSignal) {
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
  if (neverReturnSignal) {
    signals.push("never-return");
  }

  return { signals, message };
}

/**
 * Boolean-only convenience wrapper around `classifyThrowingStubShape`, for
 * callers that don't need the signal breakdown (e.g., the attestation
 * "live"-vs-throwing-shape cross-check).
 */
export function looksLikeThrowingStub(input) {
  return classifyThrowingStubShape(input) !== null;
}
