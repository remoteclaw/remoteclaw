#!/usr/bin/env node

// Brand-leak gate: forbids the OpenClaw lobster emoji (U+1F99E) from leaking
// into the RemoteClaw tree. RemoteClaw's mascot is the crab (U+1F980, "the crab
// way"); upstream OpenClaw's is the lobster. Text-based rebrand passes substitute
// `openclaw`->`remoteclaw` / `OpenClaw`->`RemoteClaw` but do NOT touch the emoji,
// so every upstream sync risks importing a stray lobster in a user-facing string
// (this happened with a `placeholder="JD or <lobster>"` avatar example, fixed in a
// follow-up). This gate is the preventive complement to check-no-remoteclaw-ai.mjs
// (which catches `*.ai` TLD text leaks) — that gate does not look at the emoji.
//
// A blanket "replace all lobsters with crabs" is wrong: the repo legitimately
// contains a few lobsters as incidental test fixture data (a heartbeat marker, a
// Slack message body, identity-default override examples). Those MUST stay. So the
// gate compares each occurrence against a context-anchored baseline allowlist and
// fails only on a lobster that is NOT allowlisted (a new leak), naming file:line.
//
// Allowlist: scripts/ci/lobster-allowlist.txt (one `<path> <context-substring>` rule
// per line). A hit is exempt iff its file matches a rule's path AND its line content
// contains that rule's context substring — survives unrelated edits (no bare line
// numbers) while still catching a NEW lobster added elsewhere in an allowlisted file.
//
// Gate: pnpm lint:no-lobster-leak  (wired into `pnpm check` -> the required CI lint job)
//
// This source intentionally contains NO literal lobster emoji — it is built from its
// codepoint so the gate never flags its own source.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Built from codepoints so this file holds no literal emoji.
export const LOBSTER = String.fromCodePoint(0x1f99e);
export const CRAB = String.fromCodePoint(0x1f980);
export const ALLOWLIST_REL = "scripts/ci/lobster-allowlist.txt";

function resolveRepoRoot() {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error("error: not a git working tree");
    process.exit(2);
  }
  return r.stdout.trim();
}

// Parse the allowlist text into `{ file, context }` rules.
// Format (one rule per line; blank lines and `#` comments ignored):
//   <path><whitespace><context-substring>
export function loadAllowlist(text) {
  const rules = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/u, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const m = trimmed.match(/^(\S+)\s+(.+)$/u);
    if (!m) {
      // A path with no context substring is rejected — a context anchor is required.
      throw new Error(
        `lobster-allowlist: malformed rule (need "<path> <context-substring>"): ${trimmed}`,
      );
    }
    rules.push({ file: m[1], context: m[2] });
  }
  return rules;
}

// Parse `git grep -n` output lines (`<file>:<line>:<content>`) into hits.
export function parseHits(stdout) {
  const hits = [];
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
    const file = raw.slice(0, firstColon);
    const line = Number.parseInt(raw.slice(firstColon + 1, secondColon), 10);
    const content = raw.slice(secondColon + 1);
    hits.push({ file, line, content, raw });
  }
  return hits;
}

export function isAllowlisted(hit, rules) {
  // The allowlist file itself holds context anchors that contain the lobster — it is
  // the human-reviewed trust root, never a leak surface, so it is always exempt.
  if (hit.file === ALLOWLIST_REL) {
    return true;
  }
  return rules.some((rule) => rule.file === hit.file && hit.content.includes(rule.context));
}

export function findViolations(hits, rules) {
  return hits.filter((hit) => !isAllowlisted(hit, rules));
}

function main() {
  const root = resolveRepoRoot();
  const allowlistPath = path.join(root, ALLOWLIST_REL);
  let rules = [];
  if (existsSync(allowlistPath)) {
    try {
      rules = loadAllowlist(readFileSync(allowlistPath, "utf8"));
    } catch (err) {
      console.error(`error: ${err.message}`);
      process.exit(2);
    }
  }

  const grep = spawnSync("git", ["grep", "-n", "-I", "-F", LOBSTER], {
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
  const violations = findViolations(hits, rules);

  if (violations.length === 0) {
    console.log(`No brand-leak lobster emoji (${LOBSTER}) detected outside the allowlist.`);
    process.exit(0);
  }

  console.error(`Brand-leak lobster emoji (${LOBSTER}) detected (${violations.length}):`);
  console.error("");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}: ${v.content.trim()}`);
  }
  console.error("");
  console.error(`Fix: replace the lobster ${LOBSTER} with the RemoteClaw crab ${CRAB}.`);
  console.error(
    `     If this lobster is intentional fixture data, add a context-anchored rule to ${ALLOWLIST_REL}`,
  );
  console.error(`     (one "<path> <context-substring>" line). See that file's header for format.`);
  process.exit(1);
}

// Only run when invoked directly (not when imported by the test).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
