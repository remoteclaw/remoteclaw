#!/usr/bin/env node

/**
 * #2735 CI-assert guard — keeps "green CI" a FAITHFUL proxy for "the IDOR hole
 * is closed".
 *
 * The fix derives `senderIsOwner` from the satisfying gateway auth method so an
 * UNAUTHENTICATED, header-less caller on an `auth:"none"` gateway is NOT treated
 * as owner (src/gateway/http-utils.ts `resolveTrustedHttpOperatorScopes`, the
 * fork divergence). The regression anchor is the un-skipped test
 *   it("derives senderIsOwner from request auth on the OpenAI-compat endpoint")
 * in src/gateway/openai-http.test.ts, which posts with NO bearer and NO
 * x-remoteclaw-scopes header and asserts `senderIsOwner === false`.
 *
 * This gate FAILS if that anchor is missing, is skipped (`it.skip` / `xit` /
 * `it.only` siblings), or no longer asserts `senderIsOwner ... toBe(false)`.
 * Without it, the anchor could be silently re-skipped (e.g. on an upstream
 * sync) and CI would stay green while the hole re-opens.
 *
 * Reference: issue #2735.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_FILE = "src/gateway/openai-http.test.ts";
const ANCHOR_NAME = "derives senderIsOwner from request auth on the OpenAI-compat endpoint";

/**
 * @returns {Promise<{ ok: boolean; violations: string[] }>}
 */
export async function checkOpenAiHttpOwnerDerivationGuard() {
  const violations = [];
  const abs = path.join(REPO_ROOT, TEST_FILE);

  let content;
  try {
    content = await fs.readFile(abs, "utf-8");
  } catch {
    return { ok: false, violations: [`${TEST_FILE}: file not found (anchor test removed?)`] };
  }

  // Locate the actual test DECLARATION: the anchor name preceded by an opening
  // quote and an it()/describe() call form. Requiring the quote means a bare
  // mention of the name in a comment cannot satisfy the gate, and it lets us
  // read the call form (skip / only / todo / xit / fit) in one match.
  const escapedName = ANCHOR_NAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const declMatch = new RegExp(
    `\\b(x?it|fit|describe)(?:\\s*\\.\\s*(skip|only|todo))?\\s*\\(\\s*["'\`]${escapedName}`,
  ).exec(content);
  if (!declMatch) {
    return {
      ok: false,
      violations: [`${TEST_FILE}: missing anchor test "${ANCHOR_NAME}" (#2735 regression anchor)`],
    };
  }

  const callForm = declMatch[1]; // it | xit | fit | describe
  const modifier = declMatch[2]; // skip | only | todo | undefined
  if (callForm === "xit" || modifier === "skip" || modifier === "todo") {
    const form = modifier ? `${callForm}.${modifier}` : callForm;
    violations.push(
      `${TEST_FILE}: anchor test is SKIPPED (\`${form}\`) — it must run in CI (#2735)`,
    );
  }
  if (callForm === "fit" || modifier === "only") {
    const form = callForm === "fit" ? "fit" : "it.only";
    violations.push(
      `${TEST_FILE}: anchor test uses \`${form}\` — the exclusive form skips siblings, masking coverage (#2735)`,
    );
  }

  // Extract the anchor test body: from the declaration to the next top-level
  // (2-space-indented) it(/describe( declaration, or EOF.
  const afterDecl = content.slice(declMatch.index);
  const nextBoundary = afterDecl.slice(1).search(/\n {2}(?:x?it|fit|describe)[\s.(]/);
  const body = nextBoundary === -1 ? afterDecl : afterDecl.slice(0, nextBoundary + 1);

  const assertsNotOwner = body.includes("senderIsOwner") && /\.toBe\(\s*false\s*\)/.test(body);
  if (!assertsNotOwner) {
    violations.push(
      `${TEST_FILE}: anchor test no longer asserts \`senderIsOwner ... toBe(false)\` (#2735 invariant lost)`,
    );
  }

  return { ok: violations.length === 0, violations };
}

// CLI entry (also runnable standalone: `node scripts/check-openai-http-owner-derivation.mjs`).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { ok, violations } = await checkOpenAiHttpOwnerDerivationGuard();
  if (!ok) {
    console.error("✗ #2735 owner-derivation guard FAILED:");
    for (const v of violations) {
      console.error(`  - ${v}`);
    }
    process.exit(1);
  }
  console.log(
    "✓ #2735 owner-derivation guard: anchor test present, un-skipped, asserts not-owner.",
  );
}
