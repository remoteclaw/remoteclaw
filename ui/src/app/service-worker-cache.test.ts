// Control UI tests cover service worker cache behavior.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => fs.readFileSync(path.join(here, rel), "utf8");

describe("Control UI service worker cache versioning", () => {
  it("registers the service worker with a build id and bounds prior build caches", () => {
    const mainSource = read("../main.ts");
    const serviceWorkerSource = read("../../public/sw.js");
    const viteConfigSource = read("../../vite.config.ts");

    expect(mainSource).toContain('swUrl.searchParams.set("v"');
    expect(mainSource).toContain('updateViaCache: "none"');
    expect(serviceWorkerSource).toContain(
      'const EMBEDDED_CACHE_VERSION = "__REMOTECLAW_CONTROL_UI_BUILD_ID__"',
    );
    expect(serviceWorkerSource).toContain("URL_CACHE_VERSION");
    expect(serviceWorkerSource).toContain("CONTROL_CACHE_LIMIT = 3");
    expect(serviceWorkerSource).toContain("slice(-priorCacheLimit)");
    expect(serviceWorkerSource).toContain("caches.delete");
    expect(viteConfigSource).toContain("source.replace(placeholder, JSON.stringify(buildId))");
    expect(serviceWorkerSource).not.toContain('const CACHE_NAME = "remoteclaw-control-v1"');
  });

  // #3024: the v2026.5.28 sync re-applied ui/vite.config.ts from upstream without the fork's
  // uppercase env rebrand, desyncing it from the fork-owned sw.js and main.ts. Both halves
  // below are extracted from their owning file rather than pinned as literals here, so a
  // rename on either side surfaces as a desync instead of quietly passing.
  it("keeps the build-id placeholder and define key in sync with their consumers", () => {
    const mainSource = read("../main.ts");
    const serviceWorkerSource = read("../../public/sw.js");
    const viteConfigSource = read("../../vite.config.ts");

    // The token sw.js actually embeds must be the exact string vite.config.ts substitutes.
    // A mismatch makes the replace a no-op, which fails `pnpm ui:build` (publish lanes only).
    const swToken = /const EMBEDDED_CACHE_VERSION = "(__[A-Z0-9_]+__)";/.exec(
      serviceWorkerSource,
    )?.[1];
    expect(
      swToken,
      "sw.js must declare EMBEDDED_CACHE_VERSION from a __TOKEN__ placeholder",
    ).toBeTruthy();
    expect(viteConfigSource).toContain(`const placeholder = '"${swToken}"'`);

    // Substitution is `String.replace(string, ...)`, which rewrites only the FIRST occurrence.
    // sw.js therefore depends on the assignment preceding the "was I built?" sentinel compare —
    // reorder them and the build would silently substitute the sentinel instead.
    const assignmentAt = serviceWorkerSource.indexOf(`const EMBEDDED_CACHE_VERSION = "${swToken}"`);
    const sentinelCompareAt = serviceWorkerSource.indexOf(
      `EMBEDDED_CACHE_VERSION !== "${swToken}"`,
    );
    expect(assignmentAt).toBeLessThan(sentinelCompareAt);

    // The identifier main.ts declares and reads must be the key vite defines. Otherwise vite
    // never substitutes it and the prod bundle ships a bare undeclared global, throwing
    // ReferenceError at module scope on every production page load in a secure context.
    const buildIdGlobal = /declare const ([A-Z0-9_]+): string \| undefined;/.exec(mainSource)?.[1];
    expect(buildIdGlobal, "main.ts must declare the injected build-id global").toBeTruthy();
    expect(mainSource).toContain(`swUrl.searchParams.set("v", ${buildIdGlobal} || "dev")`);
    expect(viteConfigSource).toContain(`${buildIdGlobal}: JSON.stringify(controlUiBuildId)`);

    // Sibling injectors must define the same key. Neither is covered by a CI lane
    // (*.e2e.test.ts is excluded from every vitest config), so this is their only guard.
    const e2eHelperSource = read("../test-helpers/control-ui-e2e.ts");
    const mockDevSource = read("../../../scripts/control-ui-mock-dev.ts");
    expect(e2eHelperSource).toContain(`${buildIdGlobal}: JSON.stringify(`);
    expect(mockDevSource).toContain(`${buildIdGlobal}: JSON.stringify(`);

    // The env overrides vite reads must carry the fork prefix; a sync re-applying upstream's
    // file flips these to REMOTECLAW_* and the documented knobs go silently dead.
    for (const envName of [
      "REMOTECLAW_CONTROL_UI_BUILD_ID",
      "REMOTECLAW_VERSION",
      "REMOTECLAW_CONTROL_UI_BASE_PATH",
    ]) {
      expect(viteConfigSource).toContain(`process.env.${envName}`);
    }
  });
});
