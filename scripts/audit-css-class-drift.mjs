#!/usr/bin/env node

/**
 * CSS class drift audit — surfaces fork-side CSS class references that have
 * no matching rule in any CSS file loaded through the `ui/src/styles.css`
 * import graph.
 *
 * Motivation (#2502): fork-sync with upstream OpenClaw occasionally renames
 * or deletes CSS classes (e.g. v2026.3.13-1 replaced .nav-group with
 * .nav-section). If the paired call-site update in ui/src TS files is
 * missed, the fork ships unstyled DOM. #2501 was the first symptom; this
 * audit exists to surface every remaining instance in one pass so fixes can
 * be batched per cluster.
 *
 * Scope (from #2502):
 *   In:
 *     - ui/src TS and TSX files (template-string class= references)
 *     - All CSS files reachable from ui/src/styles.css via @import
 *     - Static tokens in class="..." literals (Lit template syntax)
 *     - class=${"..."} and class=${`...`} single-literal expression forms
 *     - BEM-style classes: block__elem, block--mod
 *
 *   Out (first pass):
 *     - Content INSIDE `${...}` interpolations is scope-out (too noisy —
 *       string literals are routinely used as comparison values, enum
 *       discriminants, i18n keys). Static tokens AROUND interpolations
 *       ARE captured.
 *     - Classes applied via `classList.add()` / `classList.remove()`
 *     - Classes referenced from `:host`, attribute selectors, or other
 *       non-`class=""` mechanisms
 *     - Classes from vendored UI not in the `ui/src/styles.css` graph
 *
 * Output:
 *   - `.tmp/audit-css-drift.md` — full report with cluster breakdown
 *   - stdout summary
 *   - exit 0 if no orphans, exit 1 on findings, exit 2 on fatal error
 *
 * Known limitations (see § Limitations in the output report):
 *   - Dynamic class composition is not resolved (by design — per #2502)
 *   - Cluster discovery uses `git log -S <class>` with a selector-boundary
 *     filter; bulk search-replace renames may cluster to the rename commit
 *     rather than an earlier definition.
 *   - Classes used only via CSS attribute selectors or JS DOM APIs are not
 *     in scope.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { globSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(repoRoot, "ui", "src", "styles.css");
const outputDir = path.join(repoRoot, ".tmp");
const outputPath = path.join(outputDir, "audit-css-drift.md");

/**
 * Walk the CSS import graph starting from `entrypoint`. Returns the set of
 * CSS file absolute paths actually loaded at runtime.
 */
function resolveImportGraph(entry) {
  const loaded = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop();
    if (loaded.has(file)) {
      continue;
    }
    if (!existsSync(file)) {
      continue;
    }
    loaded.add(file);
    const src = readFileSync(file, "utf8");
    // @import "./foo.css" or @import url("./foo.css")
    const importRe = /@import\s+(?:url\()?["']([^"')]+)["']\)?\s*;/g;
    let match;
    while ((match = importRe.exec(src)) !== null) {
      const spec = match[1];
      const resolved = path.resolve(path.dirname(file), spec);
      stack.push(resolved);
    }
  }
  return loaded;
}

/**
 * Strip CSS comments and string content (replace with spaces so line
 * numbers and positions are preserved for accurate reporting).
 */
function stripCssNoise(src) {
  // /* ... */ comments (non-greedy, can span newlines)
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  // "..." and '...' string literals (for content: "...", url("..."), etc.)
  out = out.replace(/"([^"\\]|\\.)*"/g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/'([^'\\]|\\.)*'/g, (m) => m.replace(/[^\n]/g, " "));
  return out;
}

/**
 * Extract defined class names from a CSS source string. Returns a Set.
 *
 * Approach: after stripping comments/strings, split the source into
 * selector portions (text between `}` or start-of-file and the next `{`).
 * Each such portion is a selector list — including nested ones inside
 * @media / @supports / @container blocks, which we need to process for
 * layout.mobile.css and similar responsive overrides.
 *
 * We then pickaxe each selector portion for `.className` patterns. This
 * correctly handles:
 *   - compound selectors: `.btn.primary` → both `btn` and `primary`
 *   - descendant: `.foo .bar` → both `foo` and `bar`
 *   - BEM: `.block__elem--mod` → full identifier
 *   - pseudo-class suffixes: `.foo:hover` → just `foo`
 *   - negation / has: `.foo:not(.bar)` → both `foo` and `bar`
 *
 * Declaration blocks are skipped (we only process text between `}` and
 * `{`, which is always the selector portion of the next rule).
 */
function extractClassDefinitions(src) {
  const classes = new Set();
  const clean = stripCssNoise(src);
  let lastBrace = -1;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c === "{") {
      const selector = clean.slice(lastBrace + 1, i);
      collectClassesFromSelector(selector, classes);
      lastBrace = i;
    } else if (c === "}") {
      lastBrace = i;
    }
  }
  return classes;
}

function collectClassesFromSelector(selector, classes) {
  // Skip at-rule openers like `@media`, `@supports`, `@keyframes`, `@font-face`.
  // Their CONTENT will be processed on the next iteration when we encounter
  // the nested selector's `{`; the @-rule header itself never contains
  // class selectors.
  const trimmed = selector.trim();
  if (trimmed.startsWith("@")) {
    return;
  }

  // Match .className occurrences. Lookbehind excludes only `\\` (CSS-escaped
  // dots). Allowing a preceding word character is INTENTIONAL — it makes
  // compound selectors `.btn.primary` yield both `btn` and `primary`.
  const classRe = /(?<!\\)\.([_a-zA-Z][\w-]*)/g;
  let match;
  while ((match = classRe.exec(selector)) !== null) {
    const name = match[1];
    if (name.startsWith("--")) {
      continue;
    }
    classes.add(name);
  }
}

/**
 * Extract class references from a TS/TSX source string.
 *
 * The Lit template-literal syntax that this audit cares about is:
 *   A) class="static ${expr} more-static"    — static tokens + interpolation
 *   B) class=${"literal"}                    — expression form, literal value
 *   C) class=${`template-with ${x}`}         — expression form, template
 *   D) class=${expr}                         — expression form, dynamic
 *
 * For A, we must locate the closing quote of the attribute. The naive regex
 * `class="[^"]*"` fails when an interpolation itself contains a string
 * literal (e.g. `class="btn ${cond ? "active" : ""}"`) because the `"`
 * before `active` is matched as the closing quote. This routine walks the
 * source with a lightweight state machine that ignores `"` and `'` inside
 * `${ ... }` interpolations.
 *
 * For B, we match the exact `class=${"literal"}` / `class=${'literal'}`
 * shape (single string literal inside the interpolation, optional
 * whitespace). For C, we match `class=${\`template\`}` and pull out
 * the STATIC fragments of the template (parts between its nested
 * `${...}` interpolations). D (arbitrary expression) is scope-out.
 */
function extractClassReferences(src, relPath, refs) {
  const lineOffsets = [0];
  for (let i = 0; i < src.length; i++) {
    if (src[i] === "\n") {
      lineOffsets.push(i + 1);
    }
  }
  function lineNoFromOffset(offset) {
    let lo = 0;
    let hi = lineOffsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineOffsets[mid] <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  }

  // Form A: class="..." or class='...' — quoted attribute with possible ${...}
  const attrRe = /\bclass=(["'])/g;
  let m;
  while ((m = attrRe.exec(src)) !== null) {
    const quote = m[1];
    const valueStart = m.index + m[0].length;
    const valueEnd = scanQuotedClassValue(src, valueStart, quote);
    if (valueEnd === -1) {
      continue;
    }
    const value = src.slice(valueStart, valueEnd);
    const lineNo = lineNoFromOffset(m.index);
    addTokensFromLitClass(value, relPath, lineNo, refs);
  }

  // Form B: class=${"..."} — interpolation containing ONLY a single string
  // literal. Explicitly in scope per #2502. We require the expression to
  // consist of exactly one string literal (optionally surrounded by
  // whitespace) because the issue's scope-out rule excludes dynamic forms
  // like `${cond ? "a" : "b"}`.
  const exprRe = /\bclass=\$\{/g;
  while ((m = exprRe.exec(src)) !== null) {
    const exprStart = m.index + m[0].length;
    const exprEnd = scanExpression(src, exprStart);
    if (exprEnd === -1) {
      continue;
    }
    const expr = src.slice(exprStart, exprEnd - 1).trim();
    const lineNo = lineNoFromOffset(m.index);
    const literalOnly = matchSingleStringLiteral(expr);
    if (literalOnly !== null) {
      for (const t of tokenize(literalOnly)) {
        recordRef(refs, t, relPath, lineNo);
      }
    }
    // Template-literal form `class=${\`...\`}` — extract STATIC fragments of
    // the template (the ${...} interpolations inside are dynamic, out of
    // scope). This mirrors how class="a ${x} b" handles static fragments,
    // including the adjacency rule that drops partial tokens touching an
    // interpolation without separating whitespace.
    const templateFragments = matchSingleTemplateLiteralFragments(expr);
    if (templateFragments !== null) {
      emitFragmentTokens(templateFragments, relPath, lineNo, refs);
    }
  }
}

/**
 * If `expr` consists of exactly one string literal (",',\`) optionally
 * surrounded by whitespace, return the literal's content. Otherwise null.
 */
function matchSingleStringLiteral(expr) {
  if (expr.length < 2) {
    return null;
  }
  const q = expr[0];
  if (q !== '"' && q !== "'") {
    return null;
  }
  const end = skipStringLiteral(expr, 0, q);
  if (end !== expr.length) {
    return null;
  }
  return expr.slice(1, end - 1);
}

/**
 * If `expr` consists of exactly one template literal (backticks) optionally
 * surrounded by whitespace, return the array of its STATIC fragments (the
 * parts between ${...} interpolations). Otherwise null.
 */
function matchSingleTemplateLiteralFragments(expr) {
  if (expr.length < 2) {
    return null;
  }
  if (expr[0] !== "`") {
    return null;
  }
  const end = skipTemplateLiteral(expr, 0);
  if (end !== expr.length) {
    return null;
  }
  const tpl = expr.slice(1, end - 1);
  const fragments = [];
  let i = 0;
  let start = 0;
  while (i < tpl.length) {
    if (tpl[i] === "$" && tpl[i + 1] === "{") {
      fragments.push(tpl.slice(start, i));
      const k = scanExpression(tpl, i + 2);
      i = k === -1 ? tpl.length : k;
      start = i;
      continue;
    }
    i += 1;
  }
  fragments.push(tpl.slice(start));
  return fragments;
}

/**
 * Scan a quoted attribute value, honoring ${ ... } interpolations which
 * themselves may contain nested quotes. Returns the index of the closing
 * quote, or -1 if the value runs past EOF.
 */
function scanQuotedClassValue(src, start, quote) {
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === "$" && src[i + 1] === "{") {
      const end = scanExpression(src, i + 2);
      if (end === -1) {
        return -1;
      }
      i = end;
      continue;
    }
    if (c === quote) {
      return i;
    }
    if (c === "\\") {
      i += 2;
      continue;
    }
    i += 1;
  }
  return -1;
}

/**
 * Scan an ES expression starting just after `${`, return index JUST PAST
 * the matching `}`. Handles nested braces, string literals (", ', `), and
 * nested template-literal interpolations.
 */
function scanExpression(src, start) {
  let i = start;
  let depth = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = skipStringLiteral(src, i, c);
      continue;
    }
    if (c === "`") {
      i = skipTemplateLiteral(src, i);
      continue;
    }
    if (c === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return -1;
}

function skipStringLiteral(src, start, quote) {
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === quote) {
      return i + 1;
    }
    i += 1;
  }
  return src.length;
}

function skipTemplateLiteral(src, start) {
  let i = start + 1;
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "`") {
      return i + 1;
    }
    if (c === "$" && src[i + 1] === "{") {
      const end = scanExpression(src, i + 2);
      if (end === -1) {
        return src.length;
      }
      i = end;
      continue;
    }
    i += 1;
  }
  return src.length;
}

/**
 * Given the raw value of a `class="..."` attribute (which may contain
 * `${expr}` interpolations), emit the STATIC tokens only. Content of
 * interpolations is scope-out per #2502 — the issue explicitly flags
 * dynamic class composition as too noisy for the first pass.
 *
 * Interpolation splitting is brace-and-string-aware (not a naive regex)
 * so nested `${...}`, string literals containing `}`, and interpolations
 * inside template literals all skip correctly.
 *
 * Adjacency rule: a static fragment that touches an interpolation with no
 * separating whitespace contributes a PARTIAL class name at the boundary
 * (e.g. `class="language-${lang}"` — the static `language-` is a prefix,
 * not a standalone class). Drop the adjacent boundary token so the audit
 * does not report `.language-` as an orphan.
 */
function addTokensFromLitClass(value, file, lineNo, refs) {
  emitFragmentTokens(splitStaticFragments(value), file, lineNo, refs);
}

/**
 * Emit class tokens from a sequence of static fragments (as produced by
 * splitting around `${...}` interpolations), applying the adjacency rule:
 * a boundary token on either end of a fragment is dropped when the
 * fragment touches an interpolation without separating whitespace, because
 * in that position the static text is a prefix/suffix of a dynamically
 * composed class, not a standalone reference.
 */
function emitFragmentTokens(fragments, file, lineNo, refs) {
  for (let f = 0; f < fragments.length; f += 1) {
    const fragment = fragments[f];
    const precededByInterp = f > 0;
    const followedByInterp = f < fragments.length - 1;
    const startsWithSpace = /^\s/.test(fragment);
    const endsWithSpace = /\s$/.test(fragment);
    const tokens = tokenize(fragment);
    if (tokens.length === 0) {
      continue;
    }
    let start = 0;
    let end = tokens.length;
    if (precededByInterp && !startsWithSpace) {
      start += 1;
    }
    if (followedByInterp && !endsWithSpace) {
      end -= 1;
    }
    for (let t = start; t < end; t += 1) {
      recordRef(refs, tokens[t], file, lineNo);
    }
  }
}

/**
 * Split a class-attribute value into the static fragments between its
 * `${...}` interpolations, preserving each fragment verbatim so adjacency
 * to an interpolation (no separating whitespace) can be detected. Returns
 * an array with at least one entry; interpolations themselves are dropped.
 */
function splitStaticFragments(value) {
  const fragments = [];
  let current = "";
  let i = 0;
  while (i < value.length) {
    if (value[i] === "$" && value[i + 1] === "{") {
      fragments.push(current);
      current = "";
      const end = scanExpression(value, i + 2);
      i = end === -1 ? value.length : end;
      continue;
    }
    current += value[i];
    i += 1;
  }
  fragments.push(current);
  return fragments;
}

function tokenize(value) {
  return value
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && /^[_a-zA-Z][\w-]*$/.test(t));
}

function recordRef(refs, className, file, lineNo) {
  const existing = refs.get(className) ?? [];
  existing.push(`${file}:${lineNo}`);
  refs.set(className, existing);
}

/**
 * For each orphan class, find the commit that last removed a rule defining
 * it from any CSS file under ui/src/styles/. Returns a Map keyed by commit
 * SHA with { subject, date, classes: [] }.
 */
function clusterByRemovingCommit(orphans) {
  const clusters = new Map();
  const unresolved = [];

  for (const className of orphans) {
    // Use git log -S to find commits that add/remove lines containing the
    // class selector. We want the MOST RECENT commit where a rule selector
    // like `.className ` was removed. Heuristic: pickaxe for `.className`
    // in CSS files under ui/src/styles/, prefer commits where removal
    // outweighs addition for that token.
    let log;
    try {
      log = execFileSync("git", ["log", "--all", "--oneline", "-S", `.${className}`, "--", "ui/src/styles/"], {
        encoding: "utf8",
        cwd: repoRoot,
      }).trim();
    } catch {
      log = "";
    }
    if (!log) {
      unresolved.push(className);
      continue;
    }
    // Walk commits newest-first. For each, check whether the diff contains
    // SELECTOR-BOUNDARY removals of `.className` (not substring hits like
    // `.nav-section` matching for `.nav`). The first such commit is the
    // attributed removing-commit.
    const lines = log.split("\n");
    const esc = escapeRegex(className);
    // Match a diff line (starting with `+` or `-`, but not `++` / `--`
    // hunk headers) that contains `.className` not followed by further
    // class-identifier chars. Uses negative lookahead (rather than a
    // consuming character class) so the `.className` sequence is not
    // partially eaten when the first non-marker char is the `.` of the
    // selector itself.
    const selectorBoundaryAdd = new RegExp(`^\\+(?!\\+).*?\\.${esc}(?![\\w-])`, "gm");
    const selectorBoundaryDel = new RegExp(`^-(?!-).*?\\.${esc}(?![\\w-])`, "gm");
    let foundSha = null;
    let foundSubject = null;
    for (const line of lines) {
      const [sha, ...subjectParts] = line.split(" ");
      const subject = subjectParts.join(" ");
      let diff;
      try {
        diff = execFileSync("git", ["show", sha, "--", "ui/src/styles/"], {
          encoding: "utf8",
          cwd: repoRoot,
        });
      } catch {
        continue;
      }
      const adds = (diff.match(selectorBoundaryAdd) ?? []).length;
      const dels = (diff.match(selectorBoundaryDel) ?? []).length;
      if (dels > adds) {
        foundSha = sha;
        foundSubject = subject;
        break;
      }
    }
    if (foundSha === null) {
      // Fall back to most recent touch of a boundary-matching line.
      for (const line of lines) {
        const [sha, ...subjectParts] = line.split(" ");
        let diff;
        try {
          diff = execFileSync("git", ["show", sha, "--", "ui/src/styles/"], {
            encoding: "utf8",
            cwd: repoRoot,
          });
        } catch {
          continue;
        }
        if (selectorBoundaryAdd.test(diff) || selectorBoundaryDel.test(diff)) {
          // reset lastIndex after `.test()` — the regexes are /g
          selectorBoundaryAdd.lastIndex = 0;
          selectorBoundaryDel.lastIndex = 0;
          foundSha = sha;
          foundSubject = subjectParts.join(" ");
          break;
        }
      }
    }
    if (foundSha === null) {
      unresolved.push(className);
      continue;
    }
    const entry = clusters.get(foundSha) ?? { subject: foundSubject, classes: [] };
    entry.classes.push(className);
    clusters.set(foundSha, entry);
  }

  return { clusters, unresolved };
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ===========================================
// Main
// ===========================================

function main() {
  // 1. Import graph
  const cssFiles = resolveImportGraph(entrypoint);
  if (cssFiles.size === 0) {
    console.error(`no CSS files resolved from ${entrypoint}`);
    process.exit(2);
  }

  // 2. Class definitions
  const defined = new Set();
  for (const file of cssFiles) {
    const src = readFileSync(file, "utf8");
    for (const name of extractClassDefinitions(src)) {
      defined.add(name);
    }
  }

  // 3. Class references
  const refs = new Map();
  const tsFiles = globSync("ui/src/**/*.{ts,tsx,html}", {
    cwd: repoRoot,
    exclude: (p) => p.includes("node_modules") || p.endsWith(".test.ts") || p.endsWith(".test.tsx"),
  });
  for (const relFile of tsFiles) {
    const absFile = path.join(repoRoot, relFile);
    const src = readFileSync(absFile, "utf8");
    extractClassReferences(src, relFile, refs);
  }

  // 4. Orphans = references - definitions
  const orphans = [];
  for (const className of refs.keys()) {
    if (!defined.has(className)) {
      orphans.push(className);
    }
  }
  orphans.sort((a, b) => a.localeCompare(b));

  // 5. Cluster
  const { clusters, unresolved } = clusterByRemovingCommit(orphans);

  // 6. Report
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const report = renderReport({
    defined,
    refs,
    orphans,
    clusters,
    unresolved,
    cssFiles,
    tsFiles,
  });
  writeFileSync(outputPath, report);

  // 7. Summary to stdout
  console.log(`CSS class drift audit`);
  console.log(`  CSS files (import graph): ${cssFiles.size}`);
  console.log(`  TS/TSX files scanned:     ${tsFiles.length}`);
  console.log(`  Classes defined:          ${defined.size}`);
  console.log(`  Classes referenced:       ${refs.size}`);
  console.log(`  Orphans:                  ${orphans.length}`);
  console.log(`  Clusters:                 ${clusters.size}`);
  console.log(`  Unresolved (no history):  ${unresolved.length}`);
  console.log(`  Report written to:        ${path.relative(repoRoot, outputPath)}`);

  process.exit(orphans.length === 0 ? 0 : 1);
}

function renderReport({ refs, orphans, clusters, unresolved, cssFiles, tsFiles }) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [];
  lines.push(`# CSS Class Drift Audit (${date})`);
  lines.push("");
  lines.push(`**Total orphans**: ${orphans.length}`);
  lines.push(`**Clusters**: ${clusters.size} (by removing commit)`);
  lines.push(`**Unresolved**: ${unresolved.length} (no removing-commit found in CSS history)`);
  lines.push("");
  lines.push(`**CSS files scanned** (${cssFiles.size}):`);
  for (const f of [...cssFiles].toSorted((a, b) => a.localeCompare(b))) {
    lines.push(`- ${path.relative(repoRoot, f)}`);
  }
  lines.push("");
  lines.push(`**TS/TSX files scanned**: ${tsFiles.length}`);
  lines.push("");

  if (orphans.length === 0) {
    lines.push("## Result");
    lines.push("");
    lines.push('No orphaned class references detected. All `class="..."` tokens in');
    lines.push("`ui/src/**/*.{ts,tsx}` resolve to a rule in the CSS import graph.");
    lines.push("");
    appendLimitations(lines);
    return lines.join("\n") + "\n";
  }

  // Sort clusters by class count descending, then by commit sha for stability
  const sortedClusters = [...clusters.entries()].toSorted((a, b) => {
    const diff = b[1].classes.length - a[1].classes.length;
    if (diff !== 0) {
      return diff;
    }
    return a[0].localeCompare(b[0]);
  });

  let clusterIdx = 1;
  for (const [sha, { subject, classes }] of sortedClusters) {
    lines.push(`## Cluster ${clusterIdx}: removed in \`${sha}\` — ${subject}`);
    lines.push("");
    lines.push(`**Orphans** (${classes.length}):`);
    lines.push("");
    for (const className of classes.toSorted((a, b) => a.localeCompare(b))) {
      const callsites = refs.get(className) ?? [];
      const formatted =
        callsites.length <= 6
          ? callsites.join(", ")
          : `${callsites.slice(0, 6).join(", ")} … (+${callsites.length - 6} more)`;
      lines.push(`- \`.${className}\` — used at ${formatted}`);
    }
    lines.push("");
    clusterIdx += 1;
  }

  if (unresolved.length > 0) {
    lines.push(`## Unresolved (no removing-commit found)`);
    lines.push("");
    lines.push(`These classes are referenced but have no history of a \`.className\` rule`);
    lines.push(`being removed from the import graph. Likely causes:`);
    lines.push(`- Class was never defined (typo / rename introduced at call site only)`);
    lines.push(`- Class is defined outside the import graph (vendor CSS, shadow DOM, etc.)`);
    lines.push(`- Class is constructed dynamically and matches a real rule at runtime`);
    lines.push("");
    for (const className of unresolved.toSorted((a, b) => a.localeCompare(b))) {
      const callsites = refs.get(className) ?? [];
      const formatted =
        callsites.length <= 6
          ? callsites.join(", ")
          : `${callsites.slice(0, 6).join(", ")} … (+${callsites.length - 6} more)`;
      lines.push(`- \`.${className}\` — used at ${formatted}`);
    }
    lines.push("");
  }

  // Recommended actions section
  lines.push(`## Recommended actions per cluster`);
  lines.push("");
  lines.push(`Each cluster likely corresponds to a single upstream refactor or sync`);
  lines.push(`event. Fix per cluster in a dedicated PR so the rename story stays`);
  lines.push(`legible in history.`);
  lines.push("");
  clusterIdx = 1;
  for (const [sha, { subject, classes }] of sortedClusters) {
    lines.push(
      `- **Cluster ${clusterIdx}** (\`${sha}\` — ${subject}): migrate ${classes.length} class reference${classes.length === 1 ? "" : "s"} at the call sites above to the current upstream vocabulary. File a \`fix(ui)\` issue with a renames table.`,
    );
    clusterIdx += 1;
  }
  if (unresolved.length > 0) {
    lines.push(
      `- **Unresolved** (${unresolved.length} class${unresolved.length === 1 ? "" : "es"}): investigate each manually — may be typos, missing CSS, or dynamic construction false-positives. File a separate triage issue if volume warrants it.`,
    );
  }
  lines.push("");

  appendLimitations(lines);
  return lines.join("\n") + "\n";
}

function appendLimitations(lines) {
  lines.push("## Limitations");
  lines.push("");
  lines.push('- **Dynamic class composition** (e.g. `${cond ? "a" : "b"}` that produces');
  lines.push("  class names at runtime) is scope-out per #2502 — static tokens OUTSIDE");
  lines.push("  interpolations are captured, but content INSIDE `${...}` is ignored.");
  lines.push("  This avoids the false-positive flood from string literals used as");
  lines.push("  comparison values, enum discriminants, or i18n keys.");
  lines.push('- **`class=${"literal"}` and `class=${\\`template\\`}`** ARE captured');
  lines.push("  (single-literal expression forms are explicitly in scope).");
  lines.push("- **`classList.add()` / `classList.remove()`** call sites are out of scope");
  lines.push('  (the issue intentionally limits the first pass to `class=""` literals).');
  lines.push("- **`:host` / attribute-selector / tag-only rules** that affect elements");
  lines.push("  without referencing a class are not part of this audit's concern.");
  lines.push("- **Cluster discovery** uses `git log -S .className` as a pickaxe, then");
  lines.push("  filters per-commit diffs with a selector-boundary regex so `.nav` is");
  lines.push("  not conflated with `.nav-section`. If the same class was added and");
  lines.push("  removed in different commits, the attributed SHA is the most recent");
  lines.push("  net-removal. Bulk search-replace renames may cluster to the rename");
  lines.push("  commit rather than an earlier definition.");
  lines.push("- **Vendored UI** (e.g., `@create-markdown`) and anything not under the");
  lines.push("  `ui/src/styles.css` import graph is not analyzed — orphans in vendored");
  lines.push("  CSS would not surface here, and class references from vendored TS/TSX");
  lines.push('  would show up as orphans if they escaped into our `class=""` literals.');
  lines.push("");
}

main();
