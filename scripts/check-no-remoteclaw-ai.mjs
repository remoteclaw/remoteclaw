#!/usr/bin/env node

// Regression gate: forbids `.ai` TLD references involving the RemoteClaw name.
// The fork owns remoteclaw.org only — claims against the `.ai` TLD are stale or
// upstream drift. Matches both forms:
//   - forward domain   `remoteclaw.ai`   (URLs, hostnames)
//   - reverse-DNS      `ai.remoteclaw`   (bundle IDs, launch-agent labels, package names)
// Exemptions are declared in scripts/ci/remoteclaw-ai-allowlist.txt.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PATTERN = "(remoteclaw\\.ai|ai\\.remoteclaw)";
const ALLOWLIST_REL = "scripts/ci/remoteclaw-ai-allowlist.txt";

function resolveRepoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error("error: not a git working tree");
    process.exit(2);
  }
  return r.stdout.trim();
}

function loadAllowlist(allowlistPath) {
  const files = new Set();
  const dirs = [];
  const patterns = [];
  if (!existsSync(allowlistPath)) {
    return { files, dirs, patterns };
  }
  for (const raw of readFileSync(allowlistPath, "utf8").split("\n")) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (trimmed.startsWith("FILE:")) {
      const p = trimmed.slice("FILE:".length);
      if (p.endsWith("/")) {
        dirs.push(p);
      } else {
        files.add(p);
      }
    } else {
      patterns.push(trimmed);
    }
  }
  return { files, dirs, patterns };
}

function isExempt(hit, allowlist) {
  if (allowlist.files.has(hit.file)) {
    return true;
  }
  if (allowlist.dirs.some((d) => hit.file.startsWith(d))) {
    return true;
  }
  if (allowlist.patterns.some((p) => hit.raw.includes(p))) {
    return true;
  }
  return false;
}

function parseHits(stdout) {
  const hits = [];
  for (const raw of stdout.split("\n")) {
    if (!raw) {
      continue;
    }
    const firstColon = raw.indexOf(":");
    if (firstColon < 0) {
      continue;
    }
    const file = raw.slice(0, firstColon);
    hits.push({ file, raw });
  }
  return hits;
}

function main() {
  const root = resolveRepoRoot();
  const allowlistPath = path.join(root, ALLOWLIST_REL);
  const allowlist = loadAllowlist(allowlistPath);

  const grep = spawnSync("git", ["grep", "-n", "-I", "-E", PATTERN], {
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

  const hits = parseHits(grep.stdout);
  const violations = hits.filter((h) => !isExempt(h, allowlist));

  if (violations.length === 0) {
    console.log("No forbidden .ai TLD references detected.");
    process.exit(0);
  }

  const plural = violations.length === 1 ? "" : "s";
  console.error(`Forbidden .ai TLD reference${plural} detected (${violations.length}):`);
  console.error("");
  for (const v of violations) {
    console.error(`  ${v.raw}`);
  }
  console.error("");
  console.error("Fix: replace with the .org canonical form — `remoteclaw.org` (forward domain)");
  console.error("     or `org.remoteclaw.*` (reverse-DNS / bundle ID).");
  console.error(`     For legitimate exceptions, add to ${ALLOWLIST_REL}.`);
  process.exit(1);
}

main();
