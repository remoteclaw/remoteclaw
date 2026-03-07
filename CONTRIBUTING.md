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

RemoteClaw is forked from [OpenClaw](https://github.com/openclaw/openclaw).
