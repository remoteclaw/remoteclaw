# Contributing to RemoteClaw

## Quick Links

- **GitHub:** https://github.com/remoteclaw/remoteclaw
- **Vision:** [`VISION.md`](VISION.md)

## How to Contribute

1. **Bugs & small fixes** → Open a PR!
2. **New features / architecture** → Start a [GitHub Discussion](https://github.com/remoteclaw/remoteclaw/discussions) first

## Before You PR

- Test locally with your RemoteClaw instance
- Run tests: `pnpm build && pnpm check && pnpm test`
- Ensure CI checks pass
- Keep PRs focused (one thing per PR; do not mix unrelated concerns)
- Describe what & why
- **Include screenshots** — one showing the problem/before, one showing the fix/after (for UI or visual changes)

## Control UI Decorators

The Control UI uses Lit with **legacy** decorators (current Rollup parsing does not support
`accessor` fields required for standard decorators). When adding reactive fields, keep the
legacy style:

```ts
@state() foo = "bar";
@property({ type: Number }) count = 0;
```

The root `tsconfig.json` is configured for legacy decorators (`experimentalDecorators: true`)
with `useDefineForClassFields: false`. Avoid flipping these unless you are also updating the UI
build tooling to support standard decorators.

## AI/Vibe-Coded PRs Welcome

Built with Codex, Claude, or other AI tools? **Awesome - just mark it!**

Please include in your PR:

- [ ] Mark as AI-assisted in the PR title or description
- [ ] Note the degree of testing (untested / lightly tested / fully tested)
- [ ] Include prompts or session logs if possible (super helpful!)
- [ ] Confirm you understand what the code does

AI PRs are first-class citizens here. We just want transparency so reviewers know what to look for.

## Current Focus & Roadmap

We are currently prioritizing:

- **Stability**: Fixing edge cases in channel connections (WhatsApp/Telegram).
- **UX**: Improving the onboarding wizard and error messages.
- **Performance**: Optimizing token usage and compaction logic.

Check the [GitHub Issues](https://github.com/remoteclaw/remoteclaw/issues) for "good first issue" labels!

## Creating a Release

Releases are created manually via `gh release create`. Creating a release triggers the npm publish workflow.

### Stable Release

```bash
# 1. Ensure package.json version is updated and merged to main
# 2. Create the release (creates the tag AND triggers publish)
gh release create v2026.3.7 \
  --title "RemoteClaw v2026.3.7" \
  --generate-notes \
  --latest
```

To scope release notes from a specific prior tag:

```bash
gh release create v2026.3.7 \
  --title "RemoteClaw v2026.3.7" \
  --generate-notes \
  --notes-start-tag v2026.2.26 \
  --latest
```

### Prerelease

```bash
gh release create v2026.3.7-beta.1 \
  --title "RemoteClaw v2026.3.7-beta.1" \
  --generate-notes \
  --prerelease
```

### Release Body

After creation, edit the release to include an install section:

````markdown
## Install

```bash
npm install -g remoteclaw@2026.3.7
```
````

### Release Notes Categorization

PR labels are used to categorize auto-generated release notes (configured in `.github/release.yml`):

| Label             | Category         |
| ----------------- | ---------------- |
| `breaking-change` | Breaking Changes |
| `enhancement`     | New Features     |
| `bug`             | Bug Fixes        |
| `documentation`   | Documentation    |
| _(other)_         | Other Changes    |

## Report a Vulnerability

We take security reports seriously. See [`SECURITY.md`](SECURITY.md) for full reporting instructions.

## Fork Context

RemoteClaw is forked from [RemoteClaw](https://github.com/remoteclaw/remoteclaw).

## Fork-boundary mocks

Tests that mock modules under `src/agents/` or `src/middleware/` can mask
production throwing-stubs — the test exercises the mock, production hits a
broken stub. This is the test-side cause of the #2408-class regression.

The `check-stub-debt` CI gate tracks the count of `vi.mock(...)` calls
targeting these prefixes via `.fork-boundary-mock-baseline`. Increases
require justification in the PR description categorized by one of:

| Category             | When it applies                                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **isolation**        | Mocking a dependency with side effects (network, filesystem, global state) to unit-test logic that would otherwise require full integration setup.                                                                                                                             |
| **performance**      | Mocking an expensive real implementation to keep the test suite fast. Use sparingly; prefer sharing test fixtures.                                                                                                                                                             |
| **stub-placeholder** | **RED FLAG.** Mocking a function because the real implementation is a throwing-stub or otherwise non-functional. This is the anti-pattern the gate exists to catch — open a tracking issue for the stub, reference it in the PR, and add the mock only as a short-term bridge. |

When decreasing the baseline (e.g., refactoring a test to hit the real
module), update `.fork-boundary-mock-baseline` to lock in the improvement.

Reference: ADR 0005 H8 (hq-internal, rule name is stable).

## Module attestations

Every fork-boundary module (initial scope: `src/agents/` depth-1) exports a
`MODULE_ATTESTATIONS` constant that declares the runtime status of each
export. The attestation-gate CI job (`scripts/check-attestations.mjs`)
enforces structural consistency; human reviewers (via CODEOWNERS) enforce
semantic correctness.

```ts
export const MODULE_ATTESTATIONS = {
  resolveFoo: "live", // real implementation, safe to call
  listBars: "stub", // gutted; MUST have zero non-test callers
  resolveBaz: "partial", // works for some inputs, gutted for others
  legacyQux: "deprecated", // do not use in new code; scheduled for removal
} as const;
```

### Categories

| Category       | Meaning                                                                                                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **live**       | Real implementation. Safe to call, returns correct results. Gate fails if the function body matches a throwing-stub pattern (variadic-unknown + throw, fork-attributed throw message, `Gutted in RemoteClaw fork` marker comment, or `: never` return type with no typed params). |
| **stub**       | Gutted function. Must have zero non-test importers (the gate fails if any live caller exists, because calling the stub would crash production). Use while the stub is awaiting replacement; link a tracking issue in the PR description.                                          |
| **partial**    | Works for some inputs but has gutted branches. No automatic validation — reviewer discipline only. Document the partial behavior in a code comment.                                                                                                                               |
| **deprecated** | Scheduled for removal. Discourage new callers, plan migration. No automatic validation.                                                                                                                                                                                           |

### When this fires

The gate fails CI when:

1. A new runtime export is added without a `MODULE_ATTESTATIONS` entry
2. An attestation entry references a symbol that is no longer exported (stale)
3. An attestation says `"live"` but the function matches a throwing-stub pattern
4. An attestation says `"stub"` but the function has live (non-test) callers
5. An attestation uses an invalid category (not one of the four above)

### How to update

When sync or a refactor changes a module's surface:

1. Edit the `MODULE_ATTESTATIONS` entries in the module (inline, top of file after imports)
2. If re-attesting from `"live"` to `"stub"` / `"partial"` / `"deprecated"`: link a tracking issue in the PR description
3. If re-attesting from `"stub"` to `"live"`: verify the real implementation is restored; run `node scripts/check-throwing-stub-callers.mjs --inventory` to confirm no violations
4. CODEOWNERS will require explicit review for any `MODULE_ATTESTATIONS` change

Reference: ADR 0005 H9 (hq-internal, rule name is stable).
