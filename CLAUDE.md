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

## CI

GitHub Actions (`.github/workflows/ci.yml`):
- **build** job: checkout, setup Node env, `pnpm build`
- **test** job: checkout, setup Node env, canvas bundle, `pnpm test`
- Both run on `ubuntu-latest` with Node 22 and pnpm 10.23.0
- Branch protection requires both `build` and `test` to pass

## Security

- Never commit real phone numbers, API keys, or live configuration values
- Use obviously fake placeholders in docs, tests, and examples
- Dependency patching (pnpm patches, overrides, vendored changes) requires
  explicit approval
- Any dependency in `pnpm.patchedDependencies` must use exact version (no `^`/`~`)

## Fork Context

RemoteClaw is an active fork of OpenClaw. The codebase currently contains
upstream OpenClaw naming (`openclaw` in package.json, env vars, paths).
A comprehensive rebrand is planned but not yet executed.

**What stays**: Channel adapters, gateway, messaging infrastructure.

**What's being replaced**: Execution engine (Pi-based orchestrator replaced
with AgentRuntime supporting CLI-only agents: Claude, Gemini, Codex, OpenCode).

**What's being removed**: Skills marketplace, plugin system, model provider
ecosystem, consumer onboarding UX.

When encountering `openclaw` references in code, understand they are upstream
artifacts. New code should use `remoteclaw` naming where possible.

## PR Submission Workflow

When submitting PRs on this project:

1. **LIVE smoke tests**: If the PR touches middleware or runtime code
   (`src/middleware/`), run `LIVE=1 pnpm test:live` before or during the
   PR drive loop. Report results in the PR description or as a comment.

2. **Auto-merge**: Enable auto-merge on PRs when CI is green. Use
   `gh pr merge --auto --squash` after creating the PR. No manual merge
   needed -- let CI + auto-merge handle it.
