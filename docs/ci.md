---
title: CI Pipeline
description: How the RemoteClaw CI pipeline works
read_when:
  - You need to understand why a CI job did or did not run
  - You are debugging failing GitHub Actions checks
---

# CI Pipeline

The CI runs on every push to `main` and every pull request. It uses smart scoping to skip expensive jobs when only unrelated areas changed.

## Job Overview

| Job               | Purpose                                                 | When it runs                       |
| ----------------- | ------------------------------------------------------- | ---------------------------------- |
| `docs-scope`      | Detect docs-only changes                                | Always                             |
| `changed-scope`   | Detect which areas changed (node/macos/android/windows) | Non-doc changes                    |
| `check`           | TypeScript types, lint, format                          | Non-docs, node changes             |
| `check-docs`      | Markdown lint + broken link check                       | Docs changed                       |
| `code-analysis`   | LOC threshold check (1000 lines)                        | PRs only                           |
| `secrets`         | Detect leaked secrets                                   | Always                             |
| `build-artifacts` | Build dist once, share with other jobs                  | Non-docs, node changes             |
| `release-check`   | Validate npm pack contents                              | After build                        |
| `checks`          | Node/Bun tests + protocol check                         | Non-docs, node changes             |
| `checks-windows`  | Windows-specific tests                                  | Non-docs, windows-relevant changes |
| `macos`           | Swift lint/build/test + TS tests                        | PRs with macos changes             |
| `android`         | Gradle build + tests                                    | Non-docs, android changes          |

## Fail-Fast Order

Jobs are ordered so cheap checks fail before expensive ones run:

1. `docs-scope` + `changed-scope` + `check` + `secrets` (parallel, cheap gates first)
2. `build-artifacts` + `release-check`
3. `checks` (Linux Node test split into 2 shards), `checks-windows`, `macos`, `android`

Scope logic lives in `scripts/ci-changed-scope.mjs` and is covered by unit tests in `src/scripts/ci-changed-scope.test.ts`.
The same shared scope module also drives the separate `install-smoke` workflow through a narrower `changed-smoke` gate, so Docker/install smoke only runs for install, packaging, and container-relevant changes.

## Runners

| Runner                           | Jobs                                       |
| -------------------------------- | ------------------------------------------ |
| `blacksmith-16vcpu-ubuntu-2404`  | Most Linux jobs, including scope detection |
| `blacksmith-32vcpu-windows-2025` | `checks-windows`                           |
| `macos-latest`                   | `macos`, `ios`                             |

## Local Equivalents

```bash
pnpm check          # types + lint + format
pnpm test           # vitest tests
pnpm check:docs     # docs format + lint + broken links
pnpm release:check  # validate npm pack
pnpm land:gate      # maintainer land gate: frozen-lock install + check + build + test + release:check
```

`pnpm land:gate` intentionally includes the same frozen-lockfile install step CI uses before running `check`, `build`, `test`, and `release:check`. Use it when you want local merge-gate parity instead of piecemeal commands.
