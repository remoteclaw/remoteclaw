#!/usr/bin/env node

// Regression gate: forbids links to the upstream OpenClaw community Discord
// invite (discord[.]gg/clawd). RemoteClaw has no Discord server — those invites
// are stale upstream drift. Point users to GitHub issues / CONTRIBUTING instead.
//
// The gate excludes its own source from the scan (see SELF below) so the pattern
// definition and this comment do not self-trip the check.

import { spawnSync } from "node:child_process";

// Escaped so the literal pattern text on this line never matches the scan.
const PATTERN = "discord\\.gg/clawd";
const SELF = "scripts/check-no-clawd-discord.mjs";

function resolveRepoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error("error: not a git working tree");
    process.exit(2);
  }
  return r.stdout.trim();
}

function main() {
  const root = resolveRepoRoot();
  const grep = spawnSync("git", ["grep", "-n", "-I", "-E", PATTERN, "--", ".", `:!${SELF}`], {
    cwd: root,
    encoding: "utf8",
  });
  // git grep exit codes: 0 = matches, 1 = no matches, >1 = error.
  if (grep.status !== 0 && grep.status !== 1) {
    console.error(`error: git grep failed (status ${grep.status})`);
    if (grep.stderr) {
      console.error(grep.stderr);
    }
    process.exit(2);
  }

  const hits = grep.stdout.split("\n").filter(Boolean);
  if (hits.length === 0) {
    console.log("No forbidden upstream Discord invite links detected.");
    process.exit(0);
  }

  const plural = hits.length === 1 ? "" : "s";
  console.error(`Forbidden upstream Discord invite link${plural} detected (${hits.length}):`);
  console.error("");
  for (const h of hits) {
    console.error(`  ${h}`);
  }
  console.error("");
  console.error("Fix: RemoteClaw has no Discord. Remove the link or point users to");
  console.error("     https://github.com/remoteclaw/remoteclaw/issues instead.");
  process.exit(1);
}

main();
