import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkControlUiDocsAffordances,
  compareToLedger,
  extractRedirects,
  extractSetEntries,
  KNOWN_DANGLING_UI_DOCS_TARGETS,
  parseArgs,
  resolveRootSegment,
  resolveShortlink,
} from "../../scripts/check-control-ui-docs-affordances.mjs";

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../fixtures/control-ui-docs-affordances",
);

const fixture = (name: string) => path.join(FIXTURE_ROOT, name);

const GATE_SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../scripts/check-control-ui-docs-affordances.mjs",
);

/** Runs the gate the way CI and a developer do — as a process, reading its exit code. */
const runCli = (args: string[]) =>
  spawnSync(process.execPath, [GATE_SCRIPT, ...args], { encoding: "utf8" });

describe("check-control-ui-docs-affordances — canary", () => {
  // THE DISCRIMINATING TEST. #3160 asks for a gate that can be shown to FAIL, on
  // the reasoning that a gate which only passes on a clean tree proves nothing.
  // Everything else in this file is secondary to this assertion.
  it("FAILS on the seeded leak — gutted-subsystem targets restored", () => {
    const result = checkControlUiDocsAffordances({
      repoRoot: fixture("seeded-leak"),
      ledger: [],
    });

    expect(result.ok).toBe(false);
    const flagged = result.dangling.map((entry) => entry.value).toSorted();
    expect(flagged).toEqual(["/models", "/sandbox", "/skill-workshop", "clawhub"]);
  });

  it("passes on the equivalent fixture with those targets removed", () => {
    // Same fixture minus the seed. Pairing the two is what makes the failure
    // above attributable to the leak rather than to anything else in the tree.
    const result = checkControlUiDocsAffordances({
      repoRoot: fixture("resolves"),
      ledger: [],
    });

    expect(result.messages).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("does not fire on the homographs #3160 named, which sit in the same file", () => {
    // `resolveEmbedSandbox`, `ControlUiEmbedSandboxMode`, `bg-elevated` and the
    // live `provider` / `model` / `thinking` identifiers are all present in the
    // `resolves` fixture's markdown.ts. The gate reads link targets, so they are
    // outside what it looks at rather than allowlisted — and the seeded-leak
    // fixture carries the same identifiers while its "/sandbox" SHORTLINK does
    // fire, which is the pair that distinguishes "reads targets" from
    // "reads words".
    const result = checkControlUiDocsAffordances({ repoRoot: fixture("resolves"), ledger: [] });
    const reported = result.messages.join("\n");

    for (const homograph of ["EmbedSandbox", "bg-elevated", "thinking", "provider"]) {
      expect(reported).not.toContain(homograph);
    }
  });
});

describe("check-control-ui-docs-affordances — cardinality floor", () => {
  // A seeded leak catches a broken matcher. It does not catch an empty
  // vocabulary: a gate with nothing to check passes, and its output is
  // byte-identical to a healthy run. #3138 established the counter-measure in
  // this repo (report what was walked, fail at zero) and #3160's review comment
  // asked for it here by name.
  it("fails when the shortlink table yields zero entries", () => {
    const result = checkControlUiDocsAffordances({
      repoRoot: fixture("empty-vocabulary"),
      ledger: [],
    });

    expect(result.ok).toBe(false);
    expect(result.counts.shortlinks).toBe(0);
    expect(result.messages.join("\n")).toContain("DOCS_SHORTLINK_PATHS yielded 0 entries");
  });

  it("fails when the redirects map yields zero entries", () => {
    const result = checkControlUiDocsAffordances({
      repoRoot: fixture("empty-redirects"),
      ledger: [],
    });

    expect(result.ok).toBe(false);
    expect(result.counts.redirects).toBe(0);
    expect(result.messages.join("\n")).toContain("redirects (docs/astro.config.mjs) yielded 0");
  });

  it("fails in inventory mode too, where findings are non-fatal", () => {
    // Inventory mode reports dangling targets without failing on them. The
    // zero-cardinality floor still has to bite: an inventory compiled by an
    // instrument that read nothing is not a shorter inventory, it is a false one.
    const result = checkControlUiDocsAffordances({
      repoRoot: fixture("empty-vocabulary"),
      ledger: [],
      mode: "inventory",
    });

    expect(result.ok).toBe(false);
  });

  it("exits non-zero from the CLI on a zero-cardinality inventory, not just the API", () => {
    // The assertion above passed while the shipped surface did the opposite: the
    // `--inventory` branch printed its report and never consulted `result.ok`,
    // so `process.exitCode` stayed 0. The function was right and the CLI was
    // wrong, and a test that only reads the function cannot tell them apart —
    // the #3138 shape one level up. So assert the exit code a caller observes.
    const empty = runCli(["--inventory", "--repo-root", fixture("empty-vocabulary")]);
    expect(empty.status).toBe(1);
    expect(empty.stdout).toContain("DOCS_SHORTLINK_PATHS yielded 0 entries");

    // Paired control: same mode, same flags, a fixture that reads a real
    // vocabulary. Without this the assertion above is satisfied by a CLI that
    // exits 1 unconditionally.
    const healthy = runCli(["--inventory", "--repo-root", fixture("resolves")]);
    expect(healthy.status).toBe(0);
  });

  it("exits non-zero from the CLI when a declaration is absent", () => {
    const result = runCli(["--repo-root", fixture("absent-declaration")]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DOCS_SHORTLINK_PATHS");
  });

  it("throws, rather than reporting clean, when the declaration is absent", () => {
    expect(() =>
      checkControlUiDocsAffordances({ repoRoot: fixture("absent-declaration"), ledger: [] }),
    ).toThrow(/DOCS_SHORTLINK_PATHS = new Set\(\[/);
  });
});

describe("check-control-ui-docs-affordances — resolution", () => {
  it("resolves a slug through the redirects map", () => {
    const redirects = new Map([["/control-ui", "/web/control-ui"]]);
    expect(
      resolveShortlink("/control-ui", { repoRoot: fixture("resolves"), redirects }).resolved,
    ).toBe(true);
  });

  it("reports a redirect whose target has no page distinctly from an absent one", () => {
    // Both 404 for the user, but they read differently in review and are owned by
    // different issues, so the message has to tell them apart.
    const redirects = new Map([["/mistral", "/providers/mistral"]]);
    const hop = resolveShortlink("/mistral", { repoRoot: fixture("resolves"), redirects });
    const bare = resolveShortlink("/mistral", {
      repoRoot: fixture("resolves"),
      redirects: new Map(),
    });

    expect(hop.reason).toContain('redirects to "/providers/mistral"');
    expect(bare.reason).toContain("no page under docs/ and no redirect");
  });

  it("does not loop forever on a redirect cycle", () => {
    const redirects = new Map([
      ["/a", "/b"],
      ["/b", "/a"],
    ]);
    const outcome = resolveShortlink("/a", { repoRoot: fixture("resolves"), redirects });

    expect(outcome.resolved).toBe(false);
    expect(outcome.reason).toContain("redirect cycle");
  });

  it("accepts a root segment that is a single page rather than a directory", () => {
    // docs/ci.md and docs/date-time.md are real single-file sections. Checking
    // only for a directory would flag them, which is the false-positive class
    // that trains people to pad the ledger.
    const redirects = new Map<string, string>();
    expect(resolveRootSegment("web", { repoRoot: fixture("resolves"), redirects }).resolved).toBe(
      true,
    );
    expect(
      resolveRootSegment("clawhub", { repoRoot: fixture("resolves"), redirects }).resolved,
    ).toBe(false);
  });
});

describe("check-control-ui-docs-affordances — parsing", () => {
  it("carries 1-based line numbers so ledger entries can be pinned", () => {
    const source = ["// header", "const S = new Set([", '  "/one",', '  "/two",', "]);"].join("\n");

    expect(extractSetEntries(source, "S", "f.ts")).toEqual([
      { value: "/one", file: "f.ts", line: 3 },
      { value: "/two", file: "f.ts", line: 4 },
    ]);
  });

  it("parses redirect pairs and ignores prose around them", () => {
    const source = [
      "// a comment mentioning /control-ui",
      "const redirects = {",
      '  "/control-ui": "/web/control-ui",',
      "};",
    ].join("\n");

    expect([...extractRedirects(source, "docs/astro.config.mjs")]).toEqual([
      ["/control-ui", "/web/control-ui"],
    ]);
  });

  it("throws when the redirects map is absent", () => {
    expect(() => extractRedirects("export default {};", "docs/astro.config.mjs")).toThrow(
      /const redirects = \{/,
    );
  });

  it("finds a declaration the formatter has collapsed onto one line", () => {
    // Not hypothetical: `pnpm format` collapsed `const redirects = {\n};` in the
    // empty-redirects fixture, and the original literal `\n};` terminator then
    // threw on a well-formed file. Both declarations are now found by counting
    // delimiters, so neither depends on a formatting choice nothing guarantees.
    expect(extractSetEntries('const S = new Set(["/one", "/two"]);', "S", "f.ts")).toEqual([
      { value: "/one", file: "f.ts", line: 1 },
      { value: "/two", file: "f.ts", line: 1 },
    ]);
    expect([...extractRedirects("const redirects = {};", "c.mjs")]).toEqual([]);
  });

  it("extracts redirect pairs line by line, so a collapsed map parses as empty", () => {
    // Stated rather than implied, because it is the one place the collapsed-line
    // guarantee above stops: finding the map no longer depends on formatting,
    // but extracting its entries still does — the pair regex is line-anchored.
    // Safe only because empty is the loudest possible outcome: the cardinality
    // floor fails the run rather than letting every shortlink read as dangling.
    expect([...extractRedirects('const redirects = { "/a": "/b" };', "c.mjs")]).toEqual([]);
  });

  it("does not end a declaration on a delimiter inside a quoted value", () => {
    const source = ["const S = new Set([", '  "/a]b",', '  "/c",', "]);"].join("\n");

    expect(extractSetEntries(source, "S", "f.ts").map((entry) => entry.value)).toEqual([
      "/a]b",
      "/c",
    ]);
  });

  it("ignores comments inside a declaration, in all three ways they broke the scan", () => {
    // A note inside these tables is an edit waiting to happen — #3180 and #3211
    // drain the ledger by editing this exact table, and upstream sync re-applies
    // it wholesale. Each line below broke the scanner differently, and only one
    // of the three broke it loudly.
    const source = [
      "const S = new Set([",
      '  "/keep",',
      "  // a stray ] used to end the block here, dropping every entry below it",
      "  // an apostrophe like it's used to open a quote that ate the terminator",
      '  // and a slug quoted in prose ("/skill-workshop") became a phantom target',
      '  "/kept-too",',
      "]);",
    ].join("\n");

    expect(extractSetEntries(source, "S", "f.ts").map((entry) => entry.value)).toEqual([
      "/keep",
      "/kept-too",
    ]);
  });

  it("keeps line numbers correct across a multi-line block comment", () => {
    // Blanking a comment must preserve its newlines, or every ledger entry
    // pinned below one silently points at the wrong line.
    const source = [
      "const S = new Set([",
      '  "/a",',
      "  /* note",
      "     more */",
      '  "/b",',
      "]);",
    ].join("\n");

    expect(extractSetEntries(source, "S", "f.ts")).toEqual([
      { value: "/a", file: "f.ts", line: 2 },
      { value: "/b", file: "f.ts", line: 5 },
    ]);
  });

  it("does not mistake the // inside a string value for a comment", () => {
    expect(
      extractSetEntries('const S = new Set(["https://docs.example/x", "/b"]);', "S", "f.ts").map(
        (entry) => entry.value,
      ),
    ).toEqual(["https://docs.example/x", "/b"]);
  });

  it("ignores a comment inside the redirects map", () => {
    const source = [
      "const redirects = {",
      '  // was "/gone": "/nowhere", dropped along with the } subsystem',
      '  "/b": "/x/b",',
      "};",
    ].join("\n");

    expect([...extractRedirects(source, "c.mjs")]).toEqual([["/b", "/x/b"]]);
  });
});

describe("check-control-ui-docs-affordances — repository state", () => {
  // The AC's second half: green against the real tree once #3156-#3159 merged.
  // Asserting it here means a future PR that adds a dangling Control UI docs
  // target fails `pnpm test` as well as the standalone gate job.
  it("is green against the real repository", () => {
    const result = checkControlUiDocsAffordances();

    expect(result.messages).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("reports a non-zero scan of the real repository", () => {
    const result = checkControlUiDocsAffordances();

    expect(result.counts.shortlinks).toBeGreaterThan(0);
    expect(result.counts.rootSegments).toBeGreaterThan(0);
    expect(result.counts.redirects).toBeGreaterThan(0);
  });

  it("keeps every ledger entry pinned to a file, line, and tracking issue", () => {
    for (const entry of KNOWN_DANGLING_UI_DOCS_TARGETS) {
      expect(entry.file).toBeTruthy();
      expect(Number.isInteger(entry.line)).toBe(true);
      expect(entry.issue).toMatch(/^#\d+$/);
    }
  });

  it("has no stale ledger entries — every exception still describes a real target", () => {
    // The drain. A ledger entry whose target now resolves fails here, so the
    // ledger cannot outlive its debt as #3180 and #3211 pay it down.
    //
    // Compared through the gate's own `compareToLedger` rather than a
    // re-implemented key: a test that builds both sides of the comparison itself
    // stays green when the real key format changes underneath it.
    const { dangling } = checkControlUiDocsAffordances({ mode: "inventory" });

    expect(compareToLedger(dangling).stale).toEqual([]);
  });

  it("fails in --strict mode on the ledgered entries, so a line can be proven removable", () => {
    // The mode's whole contract, and nothing else asserted it: `--strict` exists
    // to show that a ledger line is ready to go before its issue is closed, which
    // is worth nothing if strict quietly honours the ledger like the default does.
    const strict = checkControlUiDocsAffordances({ mode: "strict" });

    expect(strict.ok).toBe(false);
    expect(strict.messages).toHaveLength(KNOWN_DANGLING_UI_DOCS_TARGETS.length);
  });
});

describe("check-control-ui-docs-affordances — CLI arguments", () => {
  it("rejects a --repo-root with no usable value rather than scanning the real repo", () => {
    // The silent-fallback shape `check-throwing-stub-callers.mjs` rejects by name
    // in `parseRootsFlag`. It bites harder here: the real tree is green, so a
    // mistyped flag would turn every fixture assertion above into a pass that
    // proves nothing at all.
    expect(parseArgs(["--repo-root"]).error).toMatch(/needs a value/);
    expect(parseArgs(["--repo-root", "--strict"]).error).toMatch(/needs a value/);
    expect(parseArgs(["--repo-root="]).error).toMatch(/needs a value/);

    const bare = runCli(["--repo-root"]);
    expect(bare.status).toBe(1);
    expect(bare.stderr).toContain("needs a value");
  });

  it("accepts both --repo-root spellings and reads the mode alongside them", () => {
    expect(parseArgs(["--repo-root", "fixtures/x"])).toEqual({
      mode: "default",
      repoRoot: "fixtures/x",
    });
    expect(parseArgs(["--inventory", "--repo-root=fixtures/x"])).toEqual({
      mode: "inventory",
      repoRoot: "fixtures/x",
    });
  });
});
