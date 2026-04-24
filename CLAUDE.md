# RemoteClaw

Universal AI agent middleware. Fork of [OpenClaw](https://github.com/openclaw/openclaw).

**Core idea**: Run your `~/.claude` (or Gemini, Codex, OpenCode) remotely via
messaging channels (WhatsApp, Telegram, Slack, Discord, etc.) without
reinventing the agentic loop.

RemoteClaw is middleware, not a platform. It connects agent CLIs to messaging
channels. Generic agent capabilities come from each CLI's own MCP ecosystem.

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `src/` | Core source (CLI, commands, channels, gateway, infra, agents) |
| `extensions/` | Channel plugins as workspace packages (38 integrations) |
| `apps/` | Native apps (android, ios, macos, shared) |
| `packages/` | Internal workspace packages |
| `ui/` | Web UI |
| `skills/` | Upstream OpenClaw skills (being gutted) |
| `vendor/` | Vendored dependencies |
| `test/` | Test setup and shared test utilities |
| `scripts/` | Build, dev, and CI helper scripts |
| `docs/` | Documentation |
| `dist/` | Build output (gitignored) |

**Monorepo**: pnpm workspaces (root + `ui` + `packages/*` + `extensions/*`).

## Build & Development

**Runtime**: Node.js 22+ (see `engines` in package.json).

**Package manager**: pnpm 10.23.0 (`corepack enable` to use).

| Task | Command |
|------|---------|
| Install deps | `pnpm install` |
| Build | `pnpm build` |
| Build canvas bundle (required before tests) | `pnpm canvas:a2ui:bundle` |
| Run tests | `pnpm test` |
| Run tests with coverage | `pnpm test:coverage` |
| Type-check | `pnpm tsgo` |
| Lint (type-aware) | `pnpm lint` |
| Format check | `pnpm format` |
| Format fix | `pnpm format:fix` |
| Full check (format + typecheck + lint) | `pnpm check` |
| Run dev server | `pnpm dev` |

**Build pipeline**: `pnpm build` runs canvas bundle, tsdown, plugin-sdk DTS
generation, and post-build copy scripts. The `pnpm canvas:a2ui:bundle` step
must run before tests (CI does this automatically).

## Code Conventions

### Language & Module System

- **TypeScript** (strict mode, ESM-only via `"type": "module"`)
- Target: `es2023`, module: `NodeNext`
- Never add `@ts-nocheck`; never disable `no-explicit-any`

### Formatting & Linting

- **Formatter**: oxfmt (2-space indent, sorted imports)
- **Linter**: oxlint (type-aware, categories: correctness, perf, suspicious)
- **CSS class drift**: `pnpm check` cross-references `class="..."` tokens in
  `ui/src/**/*.{ts,tsx,html}` against the CSS rule definitions reachable from
  `ui/src/styles.css`. Fails when a template-string class reference has no
  matching rule. Prevents the regression class seen in the v2026.3.13-1 and
  v2026.3.22 syncs (#2501, #2508-#2511) where upstream renames silently
  desync from fork-side template strings. See § Fork-integrity gates.
- Run `pnpm check` before committing

### File Organization

- Source in `src/`, tests colocated as `*.test.ts`
- Keep files under ~500 LOC; split when it improves clarity
- Extension-only deps go in the extension's own `package.json`, not root

### Naming

- Product/app references: **RemoteClaw** (headings, docs)
- CLI/binary/package/config: `remoteclaw` (lowercase)
- Upstream references: `openclaw`/`OpenClaw` until rebrand is complete

### Commit Messages

Follow **Conventional Commits** with optional scope:

```
type(scope): imperative description (#issue)
```

- **Types**: `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`, `perf`
- **Project-specific types**: `rebrand` (openclaw→remoteclaw renaming), `gut` (removing dead upstream subsystems)
- **Scope**: optional, lowercase — e.g., `middleware`, `cron`, `app:macos`
- **Subject**: imperative mood, lowercase start, no trailing period
- **Rationale clause**: use em-dash for context when helpful — e.g., `fix(middleware): close stdin on spawn — prevents CLI hang`
- **Issue refs**: append `(#N)` when a GitHub issue exists
- Group related changes; avoid bundling unrelated refactors

## Testing

- **Framework**: Vitest with V8 coverage
- **Coverage thresholds**: 70% lines/functions/statements, 55% branches
- **Test naming**: `*.test.ts` (unit), `*.e2e.test.ts` (e2e), `*.live.test.ts` (live)
- **Configs**: `vitest.config.ts` (base), `vitest.unit.config.ts`,
  `vitest.e2e.config.ts`, `vitest.extensions.config.ts`,
  `vitest.gateway.config.ts`, `vitest.live.config.ts`
- **CI env vars**: `REMOTECLAW_TEST_WORKERS=2`, `REMOTECLAW_TEST_MAX_OLD_SPACE_SIZE_MB=4096`

### Browser-mode smoke tests

`ui/src/ui/app.smoke.test.ts` (#2495, #2496) and `ui/src/ui/app.computed-style.test.ts`
(#2519) form a defense-in-depth lane against the sync-regression class —
production class drifts from fork-side markup/CSS contracts after an
upstream migration. They run in real Chromium via
`@vitest/browser-playwright` with `ui/vitest.config.ts`. The class-instance
suite asserts every required host-interface field is initialized on the
`RemoteClawApp` instance. The computed-style suite mounts the app, forces
a desktop viewport (`page.viewport(1280, 720)` from `vitest/browser`),
waits for layout (`updateComplete` + double `requestAnimationFrame`),
and asserts `getBoundingClientRect` dimensions —
catching "production renders but layout is broken" regressions like #2517.

- **Run locally**: `pnpm test:ui:smoke` (root) or
  `pnpm --dir ui exec vitest run --config vitest.config.ts src/ui/app.smoke.test.ts src/ui/app.computed-style.test.ts`
- **CI**: scoped `test-ui-smoke` job; installs Chromium via
  `pnpm --dir ui exec playwright install --with-deps chromium`
- **Scope discipline**: scoped to the two smoke suites specifically —
  other `ui/**/*.test.ts` suites are NOT run by this lane. `pnpm test:ui`
  (the broader UI lane) is not in CI and has pre-existing failures
  unrelated to the sync-regression class

## CI

GitHub Actions (`.github/workflows/ci.yml`):
- **build** job: checkout, setup Node env, `pnpm build`
- **test** job: checkout, setup Node env, canvas bundle, `pnpm test`
- **test-ui-smoke** job: browser-mode RemoteClawApp smoke lane (see
  § Testing → Browser-mode smoke tests)
- Jobs run on `ubuntu-latest` with Node 22 and pnpm 10.23.0
- Branch protection requires `build`, `test`, `lint`, and `docs` to pass

### Fork-integrity gates

Standalone scripts in `scripts/` each run as their own CI job. They guard
against regressions specific to the fork-sync lifecycle:

- **rebrand-gate**: `openclaw`/`OpenClaw` leakage into files the fork owns.
- **zombie-import-gate**: imports from modules that have been gutted.
- **stub-debt-gate**: rejects any `@ts-expect-error` suppression under
  `src/`, `extensions/`, or `ui/` (zero-tolerance — fork-sync type debt
  must be fixed, not suppressed). Also tracks `vi.mock(...)` calls
  targeting `src/agents/` or `src/middleware/` via
  `.fork-boundary-mock-baseline` — see `CONTRIBUTING.md` § Fork-boundary
  mocks.
- **throwing-stub-callers-gate** (`.throwing-stub-callers-allowlist`):
  detects throwing stubs with live non-test callers — see § Fork Stub
  Conventions.
- **obsolescence-audit-gate**: retrospective audit sentinels for gut waves.
- **css-class-drift-gate** (`pnpm lint:ui:no-css-class-drift`, part of
  `pnpm check`): cross-references `class="..."` tokens in
  `ui/src/**/*.{ts,tsx,html}` against the CSS rule definitions reachable
  from `ui/src/styles.css`; fails when a template-string class reference
  has no matching rule. Runs inside the `lint` CI job (via `pnpm check`),
  not as a standalone job. Surfaces upstream class renames that silently
  desync from fork-side call sites — the regression shape that produced
  #2501, #2508-#2511.

### Release publishing

- **Trigger**: `publish-latest` runs on `release: [published]` event —
  create a GitHub release (which auto-creates the tag) to trigger it.
  A bare `git tag` push does NOT trigger publishing.
- **Version stamping**: CI automatically stamps `package.json` version from
  the release tag (`v0.1.0` → `0.1.0`) — no manual version bump needed
  before releasing. Extension versions are also synced automatically via
  `pnpm plugins:sync-version`. A final `pnpm release:check` validates
  everything matches before publishing.
- **npm tag routing**: pre-release → `beta` tag; stable release → `latest` tag.
- **`next` channel**: `publish-next` runs on every push to `main` — automatic,
  no manual step. Stamps dynamic version on root + all extensions.
- **Post-release bump**: After a release is confirmed green, bump `package.json`
  and all `extensions/*/package.json` to the next minor version (e.g.,
  `0.2.0` → `0.3.0`) so `next` builds start on the new development version.
- **Checklist**: `docs/reference/RELEASING.md` (upstream-inherited, adapted).

## Security

- Never commit real phone numbers, API keys, or live configuration values
- Use obviously fake placeholders in docs, tests, and examples
- Dependency patching (pnpm patches, overrides, vendored changes) requires
  explicit approval
- Any dependency in `pnpm.patchedDependencies` must use exact version (no `^`/`~`)

## Fork Stub Conventions

During upstream sync, functions whose implementation depends on gutted
subsystems (Pi-era provider/model catalogs, skills marketplace, etc.) are
replaced with **stubs** that throw at call time. Every stub is either:

1. **Dead** — no live callers. Safe and idiomatic; typically paired with a
   `// Gutted in RemoteClaw fork` marker comment for grep-ability.
2. **Live regression** — has live non-test callers in production paths. Ships
   the "unavailable in RemoteClaw fork" error to users. This is an outage
   vector (see #2408) and the **throwing-stub-callers-gate** catches it.

### Legitimate upstream-compat stub

Use the pattern below for case (1). The CI gate accepts it because there are
no callers outside of test files:

```ts
// Gutted in RemoteClaw fork — CLI runtimes own model selection.
export function listProviderModels(..._args: unknown[]): never {
  throw new Error("listProviderModels is not available in RemoteClaw fork");
}
```

### Shipping a new caller of an existing stub

Don't. Either migrate the stub to a working implementation first, or route
the caller to a live alternative. If you genuinely need a short-lived window
where a live regression exists, file a remediation issue and add a line to
`.throwing-stub-callers-allowlist`:

```text
src/agents/agent-scope.ts::resolveAgentRuntimeOrThrow  # #2408
```

Do not add allowlist entries without a tracking issue — the allowlist is a
debt ledger, not an escape hatch.

### Detecting the pattern locally

```bash
# Reports known violations (same as CI default):
node scripts/check-throwing-stub-callers.mjs

# Strict mode — fails even on allowlisted entries (useful before closing a
# remediation issue, to prove the allowlist line can be removed):
node scripts/check-throwing-stub-callers.mjs --strict

# Inventory only — never fails, lists every detected stub:
node scripts/check-throwing-stub-callers.mjs --inventory
```

## Fork Context

RemoteClaw is an active fork of OpenClaw. The codebase currently contains
upstream OpenClaw naming (`openclaw` in package.json, env vars, paths).
A comprehensive rebrand is planned but not yet executed.

**What stays**: Channel adapters, gateway, messaging infrastructure, plugin
system (plugin SDK plus bundled channel and tool plugins in `extensions/*`).

**What's being replaced**: Execution engine (Pi-based orchestrator replaced
with AgentRuntime supporting CLI-only agents: Claude, Gemini, Codex, OpenCode).

**What's being removed**: Skills marketplace, model provider ecosystem,
consumer onboarding UX.

When encountering `openclaw` references in code, understand they are upstream
artifacts. New code should use `remoteclaw` naming where possible.

**User state boundary.** The fork boundary is also a user boundary. Users of
upstream OpenClaw or pre-rebrand RemoteClaw are not RemoteClaw users — their
persisted state (`openclaw.*` localStorage keys, config files, stored
preferences, URL schemes, any artifact touched by the rebrand) is NOT
RemoteClaw legacy. No migration path is owed; do not open issues proposing
one. When auditing for "legacy values that need migration," filter each hit
by asking: *was this artifact ever written by shipped, post-rebrand
RemoteClaw code?* If the only writer is upstream OpenClaw or pre-rebrand
internal state, classify as ACCURATE/HISTORICAL — not as "fragility" or
"needs migration." The rebrand was a clean break, not a backward-compat
lapse.

## PR Submission Workflow

When submitting PRs on this project:

1. **LIVE smoke tests**: If the PR touches middleware or runtime code
   (`src/middleware/`), run `LIVE=1 pnpm test:live` before or during the
   PR drive loop. Report results in the PR description or as a comment.

2. **Auto-merge**: Enable auto-merge on PRs when CI is green. Use
   `gh pr merge --auto --squash` after creating the PR. No manual merge
   needed -- let CI + auto-merge handle it.
