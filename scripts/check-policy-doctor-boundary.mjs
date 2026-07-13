#!/usr/bin/env node

/**
 * Structural security gate for the policy-doctor bounded-write boundary (PR #2895).
 *
 * The policy `doctor --fix` path applies exactly one bounded repair (disable a
 * currently-enabled, policy-denied channel) and persists ONLY through the doctor's
 * pre-existing writeConfigFile path — it introduces no new writer. This gate enforces
 * the source-level invariants that keep that boundary intact:
 *   - the ext check registry (detect path) issues NO filesystem/config writes,
 *   - the split-contract repair reducer performs NO I/O (it threads config forward;
 *     the caller persists),
 *   - the ext exposes EXACTLY ONE repair() across all health checks,
 *   - the core wiring writes nothing itself and invokes repair only inside the
 *     `--fix` (prompter.shouldRepair) guard, with mode:"fix".
 *
 * These invariants are also asserted by
 * src/commands/doctor-policy-checks.boundary.test.ts, which is the rationale home —
 * but that file lives under src/commands/**, a path DELIBERATELY excluded from every
 * fork vitest lane (vitest.unit.config.ts, vitest.config.ts). That exclusion is an
 * established fork divergence we do NOT reverse; re-homing the invariant as this
 * standalone gate makes a regression a required-CI failure without un-excluding
 * src/commands/**. Mirrors the other fork-integrity gates (scripts/check-*.mjs).
 *
 * Usage:
 *   node scripts/check-policy-doctor-boundary.mjs             # gate (default)
 *   node scripts/check-policy-doctor-boundary.mjs --self-test # prove the detector fires
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const REGISTER = "extensions/policy/src/doctor/register.ts";
const REPAIR_RUNNER = "src/plugin-sdk/_health/repair-runner.ts";
const CORE_WIRING = "src/commands/doctor-policy-checks.ts";

// Filesystem/config mutation primitives. readFile/readFileSync are intentionally
// absent — reads are the detect path's whole job. (Verbatim from the boundary test.)
const WRITE_PRIMITIVES =
  /\b(writeFile|writeFileSync|appendFile|appendFileSync|unlink|unlinkSync|rmdir|mkdir|mkdirSync|rename|renameSync|truncate|copyFile|symlink|writeConfigFile|createWriteStream)\b|\bfs\.rm\b|\brm\(/;

// Scan CODE only — a write primitive named in a comment (e.g. documenting the existing
// writeConfigFile persistence path) is not a write. Block comments are removed; line
// comments are removed except where the `//` is part of a `scheme://` token (policy
// findings embed `oc://…` requirement paths). (Verbatim from the boundary test.)
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function read(rel) {
  return readFileSync(join(repoRoot, rel), "utf-8");
}

function checkBoundary() {
  const failures = [];

  // 1. The ext check registry (detect path) issues no write primitives.
  if (WRITE_PRIMITIVES.test(stripComments(read(REGISTER)))) {
    failures.push(`${REGISTER}: detect path must issue no filesystem/config write primitives.`);
  }

  // 2. The ext exposes exactly one repair() across all health checks.
  const repairDefs = read(REGISTER).match(/^\s*async repair\(/gm) ?? [];
  if (repairDefs.length !== 1) {
    failures.push(
      `${REGISTER}: must expose EXACTLY ONE 'async repair(' across all health checks (found ${repairDefs.length}).`,
    );
  }

  // 3. The repair reducer performs no I/O (pure config threading).
  if (WRITE_PRIMITIVES.test(stripComments(read(REPAIR_RUNNER)))) {
    failures.push(`${REPAIR_RUNNER}: repair reducer must perform no I/O (pure config threading).`);
  }

  // 4. The core wiring never writes and gates repair behind --fix + mode:"fix".
  const coreCode = stripComments(read(CORE_WIRING));
  if (WRITE_PRIMITIVES.test(coreCode)) {
    failures.push(`${CORE_WIRING}: core wiring must write nothing itself.`);
  }
  const repairCalls = coreCode.match(/runDoctorHealthRepairs\(/g) ?? [];
  if (repairCalls.length !== 1) {
    failures.push(
      `${CORE_WIRING}: runDoctorHealthRepairs must be invoked exactly once (found ${repairCalls.length}).`,
    );
  }
  const guardIdx = coreCode.indexOf("if (prompter.shouldRepair)");
  const callIdx = coreCode.indexOf("runDoctorHealthRepairs(");
  const fixModeIdx = coreCode.search(/mode:\s*"fix"/);
  if (guardIdx < 0) {
    failures.push(`${CORE_WIRING}: repair must be gated behind 'if (prompter.shouldRepair)'.`);
  } else {
    if (callIdx >= 0 && callIdx <= guardIdx) {
      failures.push(
        `${CORE_WIRING}: runDoctorHealthRepairs must be invoked inside the --fix guard, not before it.`,
      );
    }
    if (fixModeIdx < 0 || fixModeIdx <= guardIdx) {
      failures.push(
        `${CORE_WIRING}: the repair context must set mode:"fix" inside the --fix guard.`,
      );
    }
  }

  return failures;
}

// Prove the detector actually fires — a gate that always passes catches nothing.
function selfTest() {
  const errors = [];

  if (
    !WRITE_PRIMITIVES.test(
      stripComments('async detect(ctx) { await writeFileSync("/x", "boom"); }'),
    )
  ) {
    errors.push("WRITE_PRIMITIVES failed to match a planted writeFileSync.");
  }
  if (WRITE_PRIMITIVES.test(stripComments('const raw = readFileSync(path, "utf-8");'))) {
    errors.push("WRITE_PRIMITIVES false-positived on a pure readFileSync.");
  }
  if (WRITE_PRIMITIVES.test(stripComments("// persists via writeConfigFile path\nconst x = 1;"))) {
    errors.push("WRITE_PRIMITIVES matched a write primitive named only in a comment.");
  }
  const twoRepairs =
    "  async repair(a) {}\n  async repair(b) {}\n".match(/^\s*async repair\(/gm) ?? [];
  if (twoRepairs.length !== 2) {
    errors.push(`repair-count detector miscounted two repair() defs (got ${twoRepairs.length}).`);
  }

  return errors;
}

if (process.argv.includes("--self-test")) {
  const errors = selfTest();
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`SELF-TEST FAIL: ${e}`);
    }
    console.error(`\nERROR: policy-doctor-boundary detector self-test failed (${errors.length}).`);
    process.exit(1);
  }
  console.log("OK: policy-doctor-boundary detector self-test passed.");
  process.exit(0);
}

const failures = checkBoundary();
if (failures.length > 0) {
  for (const f of failures) {
    console.error(`FAIL: ${f}`);
  }
  console.error(
    `\nERROR: policy-doctor bounded-write boundary violated (${failures.length} issue(s)).`,
  );
  console.error("This is the security boundary of the policy-doctor adoption (PR #2895); see");
  console.error("src/commands/doctor-policy-checks.boundary.test.ts for the invariant rationale.");
  process.exit(1);
}

console.log(
  "OK: policy-doctor bounded-write boundary intact (detect pure-read, one bounded repair, --fix-gated).",
);
