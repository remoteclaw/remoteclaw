/**
 * Why the recovery pass may default an unreported send outcome to "replay".
 *
 * `recoverPendingDeliveries` classifies failures it did not raise, so it depends
 * on the `DeliverFn` it is handed annotating its errors
 * (`delivered-before-failure.ts`). An unannotated failure is read as "definitely
 * did not land" and replayed — correct for the non-outbound DeliverFns that
 * default exists for, and a potential duplicate for a sender that actually
 * reaches a chat platform.
 *
 * Failing closed instead (quarantine-on-absent) would strand every
 * non-annotating DeliverFn's mail in the operator's manual queue and never send
 * it — see § The `platformSendAttempted` default in `delivery-queue.ts`. What
 * keeps the open default safe is therefore not the default itself: it is that
 * production wires the recovery pass to exactly one DeliverFn, and that one
 * always annotates.
 *
 * This pins that invariant (#3063). A second production wiring, or a different
 * sender on the existing one, fails here — so the next author has to reason
 * about the default rather than silently inherit one chosen for a different
 * caller.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "../../..");

/** The module that declares it — its own definition and doc-comments are not wirings. */
const DECLARING_FILE = "src/infra/outbound/delivery-queue.ts";
const SCAN_ROOTS = ["src", "extensions"];
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git", "__snapshots__"]);

function toPosix(relativePath: string): string {
  return relativePath.split(path.sep).join("/");
}

function listSourceFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (absolute: string) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(path.join(absolute, entry.name));
        }
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts")) {
        continue;
      }
      // Test files may wire any DeliverFn they like — that is the point of them.
      if (entry.name.includes(".test.")) {
        continue;
      }
      files.push(toPosix(path.relative(repoRoot, path.join(absolute, entry.name))));
    }
  };
  walk(path.join(repoRoot, root));
  return files;
}

function findProductionCallSites(): string[] {
  return SCAN_ROOTS.flatMap(listSourceFiles)
    .filter((file) => file !== DECLARING_FILE)
    .filter((file) => /\brecoverPendingDeliveries\s*\(/.test(readRepoFile(file)))
    .toSorted();
}

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

describe("delivery recovery wiring", () => {
  it("has exactly one production caller of recoverPendingDeliveries", () => {
    // Adding a second one is not forbidden — it just cannot be done silently.
    // Whoever adds it owns the question this file exists to keep asked: does the
    // DeliverFn behind it annotate how far a failed send got?
    expect(findProductionCallSites()).toEqual(["src/gateway/server.impl.ts"]);
  });

  it("wires that caller to the annotating outbound sender", () => {
    // `deliverOutboundPayloads` reports both facts the recovery classifier needs
    // — the landed count and whether a platform send was entered — on the thrown
    // error and, under bestEffort where nothing is thrown, on each per-payload
    // error it hands to onError. Swapping in a sender that reports neither
    // re-opens the replay-an-ambiguous-failure window on the recovery path.
    const [callSite] = findProductionCallSites();
    expect(callSite).toBeDefined();
    const source = readRepoFile(callSite);
    expect(source).toMatch(
      /recoverPendingDeliveries\s*\(\s*\{[^}]*deliver:\s*deliverOutboundPayloads/,
    );
  });

  it("keeps that sender annotating both of its failure channels", () => {
    // The throwing channel (#3061) and the bestEffort resolve channel (#3063).
    // Losing either one silently downgrades the recovery pass to "assume nothing
    // landed" for the failures it covered, which is how the duplicate returns.
    const sender = readRepoFile("src/infra/outbound/deliver.ts");
    const annotations = sender.match(/annotatePlatformSendAttempted\s*\(/g) ?? [];
    expect(annotations.length).toBeGreaterThanOrEqual(2);
  });
});
