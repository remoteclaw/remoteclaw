#!/usr/bin/env node

// Regression gate: forbids `remoteclaw.ai` references in tracked files.
// The fork owns remoteclaw.org only — `.ai` URLs are stale or upstream drift.
// Scans all tracked files via `git grep -n "remoteclaw\.ai"`.
// Exemptions are declared in scripts/ci/remoteclaw-ai-allowlist.txt.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const PATTERN = "remoteclaw\\.ai";
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

  const grep = spawnSync("git", ["grep", "-n", "-I", PATTERN], { cwd: root, encoding: "utf8" });
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
    console.log("No remoteclaw.ai references detected.");
    process.exit(0);
  }

  const plural = violations.length === 1 ? "" : "s";
  console.error(`Forbidden remoteclaw.ai reference${plural} detected (${violations.length}):`);
  console.error("");
  for (const v of violations) {
    console.error(`  ${v.raw}`);
  }
  console.error("");
  console.error("Fix: replace the .ai URL with the .org canonical domain (remoteclaw.org),");
  console.error(`     or add an exemption to ${ALLOWLIST_REL}.`);
  process.exit(1);
}

main();
