#!/usr/bin/env node

// Re-introduction gate: forbids the gutted `modelsWrite` config flag from reappearing
// anywhere under src/config/. RemoteClaw delegates model/provider selection to the CLI
// runtimes it drives and ships no /models *write* command, so `commands.modelsWrite` is a
// permanently dead concept (#2758, superseding the #2752 keep-flag decision). A future
// upstream sync could silently re-introduce the field via the hand-authored schema sources
// or the generated schema; this gate is the tripwire that forces a conscious decision.
//
// Scope is src/config/ only (the field's entire footprint lived there, the generated file
// included) — so this gate's own source in scripts/ is never searched and may name the
// token plainly. The legacy-strip migration and its test live under src/config/ and so
// assemble the key name from fragments to stay clean (see src/config/legacy.migrations.ts).
//
// Gate: pnpm lint:no-models-write  (wired into `pnpm check` -> the required CI lint job)
//
// Mirrors scripts/check-no-lobster-leak.mjs (the upstream-sync brand-leak tripwire).

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FORBIDDEN_TOKEN = "modelsWrite";
export const SEARCH_PATHSPEC = "src/config/";

function resolveRepoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error("error: not a git working tree");
    process.exit(2);
  }
  return r.stdout.trim();
}

// Parse `git grep -n` output lines (`<file>:<line>:<content>`) into matches.
export function parseMatches(stdout) {
  const matches = [];
  for (const raw of stdout.split("\n")) {
    if (!raw) {
      continue;
    }
    const firstColon = raw.indexOf(":");
    if (firstColon < 0) {
      continue;
    }
    const secondColon = raw.indexOf(":", firstColon + 1);
    if (secondColon < 0) {
      continue;
    }
    matches.push({
      file: raw.slice(0, firstColon),
      line: Number.parseInt(raw.slice(firstColon + 1, secondColon), 10),
      content: raw.slice(secondColon + 1),
      raw,
    });
  }
  return matches;
}

function main() {
  const root = resolveRepoRoot();
  const grep = spawnSync(
    "git",
    ["grep", "-n", "-I", "-F", FORBIDDEN_TOKEN, "--", SEARCH_PATHSPEC],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  // git grep exit codes: 0 = matches found, 1 = no matches, >1 = error.
  if (grep.status !== 0 && grep.status !== 1) {
    console.error(`error: git grep failed (status ${grep.status})`);
    if (grep.stderr) {
      console.error(grep.stderr);
    }
    process.exit(2);
  }

  const matches = parseMatches(grep.stdout);
  if (matches.length === 0) {
    console.log(`No '${FORBIDDEN_TOKEN}' references under ${SEARCH_PATHSPEC} — clean.`);
    process.exit(0);
  }

  console.error(`Re-introduced '${FORBIDDEN_TOKEN}' under ${SEARCH_PATHSPEC} (${matches.length}):`);
  console.error("");
  for (const m of matches) {
    console.error(`  ${m.file}:${m.line}: ${m.content.trim()}`);
  }
  console.error("");
  console.error(
    `'${FORBIDDEN_TOKEN}' is a permanently gutted config flag — model selection is delegated to the`,
  );
  console.error(
    "CLI runtime (#2758). Do NOT re-add it. If an upstream sync brought it back, drop the field",
  );
  console.error(
    "again and let src/config/legacy.migrations.ts strip it from existing user configs.",
  );
  process.exit(1);
}

// Only run when invoked directly (not when imported by the test).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
