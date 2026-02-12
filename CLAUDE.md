# RemoteClaw

Fork of `openclaw/openclaw` (git remote: `openclaw`). Replacing OpenClaw's execution engine with Claude Agent SDK, preserving channel adapter layer.

## Conventions

### Code Style

- Language: TypeScript (ESM), strict mode
- Formatting/linting: Oxlint + Oxfmt (`pnpm check`, `pnpm format`)
- `no-explicit-any` enforced — prefer strict typing
- Keep files under ~500 LOC; split/refactor for clarity
- Add brief comments for tricky or non-obvious logic only
- Tests: colocated `*.test.ts`; e2e in `*.e2e.test.ts`
- Extensions: `extensions/*` are workspace packages with own `package.json`
- Built output: `dist/`

### Naming

- Product references: **RemoteClaw** in headings/docs, `remoteclaw` for CLI/package/paths
- Files: kebab-case (`channel-bridge.ts`)
- Tests: match source name (`channel-bridge.test.ts`)

### Commit Conventions

Three commit origins, distinguishable in `git log`:

| Origin                  | Convention                               | Trailer                                      |
| ----------------------- | ---------------------------------------- | -------------------------------------------- |
| **RemoteClaw original** | `feat(middleware): wire channel-bridge`  | None (default)                               |
| **Cherry-pick**         | `feat(security): add audit logging`      | `Cherry-picked-from: openclaw/openclaw#NNNN` |
| **Upstream sync**       | `chore(upstream): sync channel adapters` | `Upstream-sync: openclaw/openclaw@abc..def`  |

### Branch Naming

| Origin              | Pattern                               | Example                          |
| ------------------- | ------------------------------------- | -------------------------------- |
| RemoteClaw original | `feat/description`, `fix/description` | `feat/middleware-bridge`         |
| Cherry-pick         | `cherry-pick/NNNN-description`        | `cherry-pick/3948-audit-logging` |
| Upstream sync       | `upstream/YYYY-MM-DD`                 | `upstream/2026-02-15`            |

## Development

| Command              | Purpose                          |
| -------------------- | -------------------------------- |
| `pnpm install`       | Install dependencies             |
| `pnpm build`         | Build                            |
| `pnpm check`         | Type-check + lint + format check |
| `pnpm format`        | Auto-fix formatting              |
| `pnpm test`          | Run tests (Vitest)               |
| `pnpm test:coverage` | Tests with V8 coverage           |
| `pnpm dev`           | Run in development mode          |

### Testing

- Framework: Vitest with V8 coverage (70% threshold)
- Run `pnpm test` before pushing when touching logic
- Live tests: `LIVE=1 pnpm test:live`

## Channel Adapters

When refactoring shared channel logic (routing, allowlists, pairing, command gating), consider ALL channels:

- **Core** (`src/`): telegram, discord, slack, signal, imessage, web (WhatsApp), channels, routing
- **Extensions** (`extensions/`): msteams, matrix, zalo, bluebubbles, googlechat, line, irc, nostr, twitch, and more

Core channel docs: `docs/channels/`

## Upstream Sync

- Remote: `openclaw` (not `upstream`)
- Strategy: `git merge` (not rebase). Monthly cadence.
- Conflicts in gutted areas: keep our deletions
- See ADR: `engineering/decisions/0003-upstream-merge-strategy.md` (in HQ repo)

## Security

- Never commit real phone numbers, API keys, or live configuration values
- Use fake placeholders in docs, tests, and examples
- Secret detection: `.detect-secrets.cfg` baseline maintained
- No `jiti` — no dynamic TypeScript transpilation at runtime
- No `skill-scanner.ts` — your skills run as-is, your responsibility
- No ClawHub — no downloading untrusted code

## Dependencies

- Patched dependencies (`pnpm.patchedDependencies`) must use exact versions (no `^`/`~`)
- Patching requires explicit approval — do not patch by default
- Never update the Carbon dependency
