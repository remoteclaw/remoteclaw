#!/usr/bin/env node
// Fails when the Control UI hands a user a docs target that does not resolve.
//
// WHY THIS GATE EXISTS, AND WHY IT IS NARROWER THAN #3160 ASKED FOR
//
// #3156-#3159 were four instances of one defect class: the Control UI rendering
// an affordance, link, or string for a subsystem this fork gutted. Nothing in CI
// failed on any of them, and five separate `gut(ui)` waves each removed 0 lines
// of the /agents Model Selection UI before #3156 did.
//
// #3160 proposed deriving a "gutted concept" vocabulary from the fork's own gut
// markers (`grep -rn "Gutted in RemoteClaw fork" src/`) and flagging `ui/` code
// that renders an affordance for one. That shape was measured against this tree
// and does not work — not because the boundary is hard to tune, but because
// there is no signal to derive:
//
//   - `ui/` has NO static edge to the gutted `src/` subsystems. Its 48
//     `ui/ -> src/` import statements reach 34 distinct modules — mostly
//     `shared/*` and `gateway/protocol/*`, but also `agents/`, `talk/`,
//     `config/`, `cron/` — and NOT ONE of the 34 carries a `Gutted in
//     RemoteClaw fork` marker. The Control UI talks to the gateway over RPC, so
//     a gut in `src/` leaves no trace in `ui/` to find. That absent edge is
//     precisely WHY five gut waves missed the Model Selection UI. (Reproduce:
//     list the modules, then grep each for the marker.)
//   - Symbol-derived vocabulary: extracting the symbols a gut marker governs
//     yields 2 hits in `ui/`, both false positives (`AgentContext`, a type
//     declared in `ui/src/lib/agents/display.ts` itself). Recall on all four
//     siblings: zero. An independent re-measurement with a stricter extraction
//     found 0 hits and likewise 0 recall — the conclusion is not sensitive to
//     how the vocabulary is extracted.
//   - Prose-derived vocabulary: 39 words -> 944 hits, led by `export` (218),
//     `state` (104), `index` (87), `test` (80), then the homographs #3160 itself
//     predicted: `model` (51), `provider` (33), `runtime` (37).
//
// Two adjacent mechanisms were measured and also rejected, so this file is the
// residue of a search rather than a first guess:
//
//   - Orphan UI module detection: 69 of 220 production files flagged, dominated
//     by dynamically-registered Lit elements. Same mis-tuning that keeps knip
//     out of CI (CLAUDE.md § Dead-code detection).
//   - Orphan i18n key detection: all 33 strict orphans are dynamic-composition
//     false positives (`t(`tabs.${id}`)`, 5 such call sites). That surface is
//     owned by #3208 regardless.
//
// What DOES hold is resolution, not classification. Every docs target the
// Control UI hands a user is a concrete path, and whether it resolves is a fact
// about the repo rather than a judgement about a word. So this gate checks
// exactly that, and claims exactly that: the *links* third of the defect class,
// which is #3157's instance. It does not detect #3156's rendered affordance or
// #3158's orphan strings, and it must not be read as covering them.
//
// The false-positive boundary #3160 worried about is satisfied by construction
// rather than by tuning: this gate never matches a concept word, so
// `resolveEmbedSandbox`, `ControlUiEmbedSandboxMode`, `bg-elevated`, and the
// live `thinking` / `provider` identifiers are not merely allowlisted — they are
// outside what it looks at.
//
// Reviewed exceptions live on KNOWN_DANGLING_UI_DOCS_TARGETS below, pinned to
// `file:line` so a moved entry re-fails the gate and gets re-reviewed rather
// than silently inheriting its exception, and so a paid-off entry fails as STALE
// and drains the ledger (same discipline as scripts/check-tooling-config-refs.mjs
// and scripts/check-no-raw-channel-fetch.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** This gate, as every message that asks a contributor to edit it should name it. */
const SELF_PATH = "scripts/check-control-ui-docs-affordances.mjs";

/** The Control UI module that decides which links are rewritten to the docs site. */
export const MARKDOWN_SOURCE = "ui/src/components/markdown.ts";

/** The Astro config whose `redirects` map decides which docs slugs resolve. */
export const ASTRO_CONFIG_SOURCE = "docs/astro.config.mjs";

/** Root of the docs content tree. */
export const DOCS_ROOT = "docs";

const PAGE_EXTENSIONS = ["md", "mdx"];

/**
 * Reviewed exceptions: Control UI docs targets that do not resolve today.
 *
 * Every entry is pinned to `file:line` and carries a tracking issue. Removing a
 * dangling target — or making it resolve — makes its entry STALE and fails the
 * gate, so the ledger cannot outlive its debt.
 *
 * This is a birth ledger, not a permanent one. It exists because #3160 is
 * explicitly scoped to the gate and NOT to the remediation: #3180 owns clearing
 * the 404ing shortlinks, and #3211 owns the residue #3180 does not name. Wiring
 * the gate green on a hand-fixed tree would have meant absorbing both.
 */
export const KNOWN_DANGLING_UI_DOCS_TARGETS = [
  // ---------------------------------------------------------------------
  // #3180 — DOCS_SHORTLINK_PATHS entries with no page and no redirect.
  //
  // These are the 38 slugs #3180 measured as 404ing on docs.remoteclaw.org
  // after #3157 re-pointed DOCS_ORIGIN. The population is dominated by gutted
  // subsystems — the model-provider slugs (/anthropic, /openai, /azure,
  // /openrouter, /glm, /qianfan, /zai, /xiaomi), the Pi-era subsystems
  // (/thinking, /elevated, /agent-loop, /context-engine, /lore, /wizard), the
  // skills marketplace (/clawdhub, /mac/skills), and the template system
  // (/templates/*) — which is what makes this gate a real detector for the
  // #3157 defect class rather than a generic link linter. A few (/cron, /mcp,
  // /opencode) name subsystems this fork DOES have; those dangle because the
  // docs page is absent, not because the subsystem is. Either way the user gets
  // a 404, and #3180 decides per slug whether to drop it or write the page.
  { file: MARKDOWN_SOURCE, line: 219, value: "/agent-loop", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 223, value: "/anthropic", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 227, value: "/azure", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 236, value: "/clawdhub", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 240, value: "/context-engine", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 242, value: "/cron", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 251, value: "/duckduckgo-search", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 252, value: "/elevated", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 253, value: "/exa-search", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 259, value: "/gemini-search", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 261, value: "/glm", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 262, value: "/gmail-pubsub", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 263, value: "/grammy", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 264, value: "/grok-search", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 273, value: "/kimi-search", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 278, value: "/lore", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 292, value: "/mac/skills", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 299, value: "/mcp", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 308, value: "/oauth", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 309, value: "/openai", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 310, value: "/opencode", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 311, value: "/opencode-go", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 312, value: "/openrouter", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 319, value: "/qianfan", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 331, value: "/showcase", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 339, value: "/templates/AGENTS", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 340, value: "/templates/BOOT", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 341, value: "/templates/BOOTSTRAP", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 342, value: "/templates/HEARTBEAT", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 343, value: "/templates/IDENTITY", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 344, value: "/templates/SOUL", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 345, value: "/templates/TOOLS", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 346, value: "/templates/USER", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 348, value: "/thinking", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 355, value: "/web-fetch", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 360, value: "/wizard", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 361, value: "/xiaomi", issue: "#3180" },
  { file: MARKDOWN_SOURCE, line: 362, value: "/zai", issue: "#3180" },

  // ---------------------------------------------------------------------
  // #3211 — the residue #3180 does not name.
  //
  // Three shortlinks resolve to a redirect whose TARGET has no page, so they
  // 404 one hop later than the 38 above and #3180's count excludes them.
  { file: MARKDOWN_SOURCE, line: 302, value: "/minimax", issue: "#3211" },
  { file: MARKDOWN_SOURCE, line: 303, value: "/mistral", issue: "#3211" },
  { file: MARKDOWN_SOURCE, line: 304, value: "/moonshot", issue: "#3211" },

  // Six DOCS_ROOT_SEGMENTS entries with no page, no directory, and no redirect
  // under that prefix. `clawhub` is the gutted skills marketplace and
  // `openclaw-agent-runtime` is both an upstream brand leak and a gutted Pi-era
  // subsystem — neither is caught by rebrand-gate, which is changed-files-only.
  // Deliberately NOT repaired here: #3157 audited DOCS_ROOT_SEGMENTS and left it
  // unmodified on purpose, and dropping a segment changes link-rewriting
  // behaviour for every path under it. Reversing that scoping decision belongs
  // to a review of its own.
  { file: MARKDOWN_SOURCE, line: 173, value: "agent-runtime-architecture", issue: "#3211" },
  { file: MARKDOWN_SOURCE, line: 174, value: "announcements", issue: "#3211" },
  { file: MARKDOWN_SOURCE, line: 180, value: "clawhub", issue: "#3211" },
  { file: MARKDOWN_SOURCE, line: 191, value: "maturity-scorecard", issue: "#3211" },
  { file: MARKDOWN_SOURCE, line: 194, value: "openclaw-agent-runtime", issue: "#3211" },
  { file: MARKDOWN_SOURCE, line: 204, value: "specs", issue: "#3211" },
];

/**
 * Scans from the delimiter at `openIndex` to the one that matches it, reporting
 * the comment spans skipped along the way.
 *
 * Both declarations this gate reads were first parsed by searching for a literal
 * terminator (`]);` and `\n};`). That works only for the shape those files
 * happen to have today: running `pnpm format` over a fixture collapsed
 * `const redirects = {\n};` to `const redirects = {};`, the `\n};` search
 * missed, and the gate threw on a file that was perfectly well-formed. The same
 * reformat of the real docs/astro.config.mjs would have done the same thing.
 * Counting delimiters is not defensive polish here — it removes a dependency on
 * a formatting choice nothing guarantees.
 *
 * Comments are tracked for the same reason. A `//` note inside either table is
 * an edit waiting to happen — #3180 and #3211 drain the ledger by editing this
 * exact table, and upstream sync re-applies it wholesale — and every character
 * class in a comment is load-bearing to a scanner that cannot see it:
 * `// see #3180]` ends the block early and silently drops every entry after it;
 * `// it's gutted` opens a quote that swallows the terminator; and a slug quoted
 * in prose (`// #3157 dropped "/skill-workshop"`) becomes a phantom target the
 * gate then reports as dangling. Returning the spans lets the callers blank them
 * before matching, so all three collapse into one mechanism.
 *
 * `closeIndex` is -1 when the delimiter is unbalanced. Still not a JS parser:
 * quotes and comments are enough for two data-only literals, and a regex literal
 * or a division would confuse it.
 */
function scanDelimitedBlock(source, openIndex, open, close) {
  const comments = [];
  let depth = 0;
  let quote = null;
  let comment = null;
  for (let index = openIndex; index < source.length; index += 1) {
    const character = source[index];
    if (comment) {
      if (comment.kind === "line") {
        if (character === "\n") {
          // Ends *before* the newline, so blanking leaves the newline in place
          // and the line numbers the callers derive stay put.
          comments.push([comment.start, index]);
          comment = null;
        }
        continue;
      }
      if (character === "*" && source[index + 1] === "/") {
        index += 1;
        comments.push([comment.start, index + 1]);
        comment = null;
      }
      continue;
    }
    if (quote) {
      if (character === "\\") {
        index += 1;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }
    if (character === "/" && (source[index + 1] === "/" || source[index + 1] === "*")) {
      comment = { kind: source[index + 1] === "/" ? "line" : "block", start: index };
      index += 1;
    } else if (character === '"' || character === "'" || character === "`") {
      quote = character;
    } else if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return { closeIndex: index, comments };
      }
    }
  }
  // No trailing comment span to record: reaching EOF means the delimiter never
  // balanced, and both callers throw on that without reading the spans.
  return { closeIndex: -1, comments };
}

/** Overwrites `[start, end)` spans with spaces, preserving offsets and newlines. */
function blankSpans(source, spans) {
  let out = "";
  let cursor = 0;
  for (const [start, end] of spans) {
    // `[^\n]` without the `u` flag replaces per UTF-16 code unit, so an astral
    // character in a comment cannot shift the offsets the callers slice by.
    out += source.slice(cursor, start) + source.slice(start, end).replace(/[^\n]/g, " ");
    cursor = end;
  }
  return out + source.slice(cursor);
}

/**
 * Extracts the quoted entries of a `const NAME = new Set([...])` literal,
 * carrying each entry's 1-based line number.
 *
 * Throws when the block is absent. A parser that silently returns `[]` when the
 * shape it expects has moved is exactly the failure this gate is built to avoid:
 * the run would report every target resolving, having checked none.
 */
export function extractSetEntries(source, setName, file) {
  const openMarker = `${setName} = new Set([`;
  const openIndex = source.indexOf(openMarker);
  if (openIndex === -1) {
    throw new Error(
      `${file}: could not find \`${setName} = new Set([\`. The gate reads this ` +
        `declaration to learn which docs targets the Control UI exposes; if the ` +
        `declaration was renamed or reshaped, update ${SELF_PATH} to match.`,
    );
  }
  const { closeIndex, comments } = scanDelimitedBlock(
    source,
    openIndex + openMarker.length - 1,
    "[",
    "]",
  );
  if (closeIndex === -1) {
    throw new Error(`${file}: \`${setName}\` has no matching \`]\`.`);
  }
  const lineOffset = source.slice(0, openIndex).split("\n").length;
  const body = blankSpans(source, comments).slice(openIndex, closeIndex);
  const entries = [];
  body.split("\n").forEach((text, index) => {
    for (const match of text.matchAll(/"([^"]+)"/g)) {
      entries.push({ value: match[1], file, line: lineOffset + index });
    }
  });
  return entries;
}

/**
 * Parses the `redirects` map out of the Astro config.
 *
 * Throws when the map is absent, for the same reason `extractSetEntries` does.
 */
export function extractRedirects(source, file) {
  const openIndex = source.indexOf("const redirects = {");
  if (openIndex === -1) {
    throw new Error(
      `${file}: could not find \`const redirects = {\`. The Control UI's ` +
        `shortlink table resolves through this map; without it every shortlink ` +
        `would read as dangling.`,
    );
  }
  const { closeIndex, comments } = scanDelimitedBlock(
    source,
    openIndex + "const redirects = {".length - 1,
    "{",
    "}",
  );
  if (closeIndex === -1) {
    throw new Error(`${file}: \`redirects\` has no matching \`}\`.`);
  }
  const body = blankSpans(source, comments).slice(openIndex, closeIndex);
  return new Map([...body.matchAll(/^\s*"([^"]+)"\s*:\s*"([^"]+)"/gm)].map((m) => [m[1], m[2]]));
}

function pageExists(repoRoot, docsPath) {
  const relative = docsPath.replace(/^\//, "").replace(/[#?].*$/, "");
  if (relative === "") {
    return false;
  }
  const base = path.resolve(repoRoot, DOCS_ROOT, relative);
  return PAGE_EXTENSIONS.some(
    (extension) =>
      fs.existsSync(`${base}.${extension}`) || fs.existsSync(path.join(base, `index.${extension}`)),
  );
}

function directoryExists(repoRoot, segment) {
  const target = path.resolve(repoRoot, DOCS_ROOT, segment);
  return fs.existsSync(target) && fs.statSync(target).isDirectory();
}

/**
 * Resolves one shortlink, following the redirects map.
 *
 * Returns `{ resolved: true }`, or `{ resolved: false, reason }` naming whether
 * the slug had no page and no redirect, or reached a redirect whose target has
 * no page — the two failure shapes read differently in review.
 */
export function resolveShortlink(slug, { repoRoot, redirects }) {
  if (pageExists(repoRoot, slug)) {
    return { resolved: true };
  }
  const seen = new Set([slug]);
  let current = slug;
  while (redirects.has(current)) {
    const next = redirects.get(current);
    if (seen.has(next)) {
      return { resolved: false, reason: `redirect cycle at "${next}"` };
    }
    seen.add(next);
    if (pageExists(repoRoot, next)) {
      return { resolved: true };
    }
    current = next;
  }
  if (seen.size > 1) {
    return {
      resolved: false,
      reason: `redirects to "${current}", which has no page under ${DOCS_ROOT}/`,
    };
  }
  return { resolved: false, reason: `no page under ${DOCS_ROOT}/ and no redirect` };
}

/**
 * Resolves one root segment. A segment legitimately resolves as a directory, as
 * a single page, or as the prefix of at least one redirect key — all three are
 * live shapes in this tree, and checking only the first produces false positives
 * on `docs/ci.md`-style single-file sections.
 */
export function resolveRootSegment(segment, { repoRoot, redirects }) {
  if (directoryExists(repoRoot, segment) || pageExists(repoRoot, `/${segment}`)) {
    return { resolved: true };
  }
  for (const key of redirects.keys()) {
    if (key === `/${segment}` || key.startsWith(`/${segment}/`)) {
      return { resolved: true };
    }
  }
  return {
    resolved: false,
    reason: `no directory or page under ${DOCS_ROOT}/, and no redirect below /${segment}`,
  };
}

const ledgerKey = (entry) => `${entry.file}:${entry.line}:${entry.value}`;

/** Splits dangling targets into unreviewed ones and stale ledger entries. */
export function compareToLedger(dangling, ledger = KNOWN_DANGLING_UI_DOCS_TARGETS) {
  const ledgerKeys = new Set(ledger.map(ledgerKey));
  const seenKeys = new Set(dangling.map(ledgerKey));
  return {
    unreviewed: dangling.filter((entry) => !ledgerKeys.has(ledgerKey(entry))),
    stale: ledger.filter((entry) => !seenKeys.has(ledgerKey(entry))),
  };
}

/**
 * Runs the gate.
 *
 * `mode` is one of:
 *   - "default"   — ledgered entries pass; unreviewed and stale entries fail.
 *   - "strict"    — every dangling target fails, ledgered or not. Use before
 *                   closing a remediation issue, to prove its entries can go.
 *   - "inventory" — reports every dangling target and fails on none of them.
 *                   Still fails on a zero-cardinality scan: an inventory
 *                   compiled by an instrument that read nothing is not a shorter
 *                   inventory, it is a false one.
 */
export function checkControlUiDocsAffordances({
  repoRoot = REPO_ROOT,
  ledger = KNOWN_DANGLING_UI_DOCS_TARGETS,
  mode = "default",
} = {}) {
  const markdownSource = fs.readFileSync(path.resolve(repoRoot, MARKDOWN_SOURCE), "utf8");
  const astroSource = fs.readFileSync(path.resolve(repoRoot, ASTRO_CONFIG_SOURCE), "utf8");

  const shortlinks = extractSetEntries(markdownSource, "DOCS_SHORTLINK_PATHS", MARKDOWN_SOURCE);
  const rootSegments = extractSetEntries(markdownSource, "DOCS_ROOT_SEGMENTS", MARKDOWN_SOURCE);
  const redirects = extractRedirects(astroSource, ASTRO_CONFIG_SOURCE);

  const counts = {
    shortlinks: shortlinks.length,
    rootSegments: rootSegments.length,
    redirects: redirects.size,
  };

  // Cardinality gate. Each of these derivations is a place where a silent
  // upstream reshape turns this gate into a green no-op: an empty shortlink set
  // means nothing is checked, and an empty redirects map means everything
  // resolves through file existence alone. Both would print a healthy-looking
  // pass. #3138 established the precedent — the throwing-stub gate reports how
  // many production files it walked and fails when that count is zero, in every
  // mode — and #3160's own review comment asked for it here specifically,
  // because a seeded leak catches a broken matcher but not an empty vocabulary.
  const emptyDerivations = Object.entries({
    DOCS_SHORTLINK_PATHS: counts.shortlinks,
    DOCS_ROOT_SEGMENTS: counts.rootSegments,
    "redirects (docs/astro.config.mjs)": counts.redirects,
  })
    .filter(([, size]) => size === 0)
    .map(([name]) => name);

  if (emptyDerivations.length > 0) {
    return {
      ok: false,
      counts,
      messages: emptyDerivations.map(
        (name) =>
          `${name} yielded 0 entries. The gate has nothing to check and would pass ` +
          `vacuously, which is indistinguishable from a healthy run. Fix the ` +
          `derivation before trusting this gate's verdict.`,
      ),
    };
  }

  const dangling = [];
  for (const entry of shortlinks) {
    const outcome = resolveShortlink(entry.value, { repoRoot, redirects });
    if (!outcome.resolved) {
      dangling.push({ ...entry, kind: "shortlink", reason: outcome.reason });
    }
  }
  for (const entry of rootSegments) {
    const outcome = resolveRootSegment(entry.value, { repoRoot, redirects });
    if (!outcome.resolved) {
      dangling.push({ ...entry, kind: "root segment", reason: outcome.reason });
    }
  }

  if (mode === "inventory") {
    return {
      ok: true,
      counts,
      messages: dangling.map(
        (entry) => `${entry.file}:${entry.line} ${entry.kind} "${entry.value}" — ${entry.reason}`,
      ),
      dangling,
    };
  }

  const { unreviewed, stale } =
    mode === "strict" ? { unreviewed: dangling, stale: [] } : compareToLedger(dangling, ledger);

  const messages = [];
  for (const entry of unreviewed) {
    messages.push(
      `${entry.file}:${entry.line} ${entry.kind} "${entry.value}" — ${entry.reason}. ` +
        `The Control UI links a user to a docs page that does not exist. Drop the ` +
        `entry, point it at a real page, or add a reviewed entry (with a tracking ` +
        `issue) to KNOWN_DANGLING_UI_DOCS_TARGETS in ${SELF_PATH}.`,
    );
  }
  for (const entry of stale) {
    messages.push(
      `KNOWN_DANGLING_UI_DOCS_TARGETS entry ${entry.file}:${entry.line} ("${entry.value}") no ` +
        `longer matches a dangling target. Remove the ledger entry — it is debt that ` +
        `has been paid, or the target moved and needs re-review.`,
    );
  }

  return { ok: messages.length === 0, counts, messages, dangling };
}

/**
 * `--repo-root` exists so the CLI itself is testable against a fixture, the way
 * `check-throwing-stub-callers.mjs --roots=` is. Without it the only reachable
 * assertion is on the exported function, and the two can disagree: a revision of
 * this file returned `ok: false` on a zero-cardinality scan while the
 * `--inventory` branch left `process.exitCode` at 0, and the suite stayed green
 * because it asserted on the function. CI runs the gate unflagged.
 *
 * A `--repo-root` with no usable value is an error, not a fall-back to
 * `REPO_ROOT`, for the reason `parseRootsFlag` in that sibling gives: scanning
 * the whole repo when the caller asked for a fixture is indistinguishable from
 * scanning the fixture, and the real tree is green, so a mistyped flag would
 * turn every fixture assertion into a green that proves nothing.
 */
export function parseArgs(argv) {
  const mode = argv.includes("--strict")
    ? "strict"
    : argv.includes("--inventory")
      ? "inventory"
      : "default";
  const missingValue = {
    error: "`--repo-root` needs a value: --repo-root <path> or --repo-root=<path>",
  };

  const flagIndex = argv.indexOf("--repo-root");
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1];
    // A following flag is a missing value, not a path: `--repo-root --strict`
    // would otherwise scan a directory literally named `--strict`.
    return value === undefined || value.startsWith("--") ? missingValue : { mode, repoRoot: value };
  }

  const inlineRoot = argv.find((argument) => argument.startsWith("--repo-root="));
  if (inlineRoot !== undefined) {
    const value = inlineRoot.slice("--repo-root=".length);
    return value === "" ? missingValue : { mode, repoRoot: value };
  }

  return { mode, repoRoot: REPO_ROOT };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { mode, repoRoot, error } = parseArgs(process.argv.slice(2));
  if (error) {
    console.error(`[control-ui-docs-affordances] ${error}`);
    process.exit(1);
  }
  let result;
  try {
    result = checkControlUiDocsAffordances({ mode, repoRoot });
  } catch (error) {
    console.error(`[control-ui-docs-affordances] ${error.message}`);
    process.exit(1);
  }

  const scanned =
    `${result.counts.shortlinks} shortlink(s) + ${result.counts.rootSegments} root segment(s) ` +
    `checked against ${result.counts.redirects} redirect(s)`;

  if (mode === "inventory") {
    console.log(`[control-ui-docs-affordances] ${scanned}.`);
    console.log(`[control-ui-docs-affordances] ${result.messages.length} dangling target(s):`);
    for (const message of result.messages) {
      console.log(`  - ${message}`);
    }
    // Inventory mode does not fail on findings — that is its purpose — but the
    // cardinality floor still has to bite here, exactly as it does for
    // `check-throwing-stub-callers.mjs --inventory`. Reading `result.ok` rather
    // than assuming inventory is always exit 0 is what keeps that promise at the
    // surface a user actually invokes: `checkControlUiDocsAffordances` already
    // returns `ok: false` on a zero-cardinality scan in every mode, and an
    // earlier revision of this branch dropped that on the floor here while the
    // suite still passed, because the test asserted on the exported function
    // instead of the exit code.
    if (!result.ok) {
      process.exitCode = 1;
    }
  } else if (!result.ok) {
    console.error(`Control UI docs targets that do not resolve (${scanned}):\n`);
    for (const message of result.messages) {
      console.error(`  - ${message}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `[control-ui-docs-affordances] ${scanned}; all resolve ` +
        `(${KNOWN_DANGLING_UI_DOCS_TARGETS.length} reviewed exception(s)).`,
    );
  }
}
