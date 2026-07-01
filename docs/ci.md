---
title: CI Pipeline
summary: "CI job graph and local command equivalents for the RemoteClaw fork"
read_when:
  - You need to understand why a CI job did or did not run
  - You are debugging failing GitHub Actions checks
---

# CI Pipeline

CI runs on every pull request, every push to `main`, and on published releases. The workflow is defined in `.github/workflows/ci.yml`.

RemoteClaw is a fork of OpenClaw with the execution engine gutted (CLI-based agent runtimes replace in-process model providers). Its CI is correspondingly leaner than upstream's lane-based pipeline: a flat set of correctness jobs plus fork-integrity gates, with no changed-scope lane routing — every job runs on every PR.

## Jobs

| Job                          | Purpose                                                                           | When it runs         |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------- |
| `rebrand-gate`               | Detect `openclaw`/`OpenClaw` leakage that should have been rebranded              | Always               |
| `zombie-import-gate`         | Catch imports from gutted modules                                                 | Always               |
| `stub-debt-gate`             | Bound the number of gutted stubs against the committed baseline                   | Always               |
| `throwing-stub-callers-gate` | Reject live callers of throwing stubs (self-tested against a fixture first)       | Always               |
| `attestation-gate`           | Verify module attestation blocks are present and current (self-tested first)      | Always               |
| `obsolescence-audit-gate`    | Retrospective audit sentinels for gut waves                                       | Always               |
| `lint`                       | `pnpm check` — format check, prod typecheck (`tsgo`), lint, and fork guards       | Always               |
| `build`                      | `pnpm build`, then `pnpm release:check` as an early release-artifact signal       | Always               |
| `test`                       | `pnpm test` — the full Vitest suite (after building the canvas bundle)            | Always               |
| `test-gateway`               | Full gateway behavioral suite — `src/gateway/**/*.test.ts` (#2720)                | Always               |
| `test-ui-smoke`              | Browser-mode smoke for the Control UI sync-regression suites (#2495/#2496, #2519) | Always               |
| `CI`                         | Required aggregate — fails if any job above did not succeed                       | Always               |
| `publish-next`               | Publish a `next`-tagged prerelease to npm (OIDC provenance)                       | Push to `main`       |
| `publish-latest`             | Publish the release version to npm (OIDC provenance)                              | On published release |

The six `*-gate` jobs are fork-specific integrity checks that enforce the gut/keep boundary (the Middleware Boundary Principle). They have no upstream equivalent — they guard against an upstream sync silently re-introducing gutted code, leaking the `openclaw` brand, or growing stub debt.

## Local equivalents

```bash
pnpm check         # format check + prod tsgo + lint + fork guards (the `lint` job)
pnpm build         # build dist/ (the `build` job)
pnpm release:check # validate the release artifact (also runs inside build / publish)
pnpm test          # full Vitest suite (the `test` job)
pnpm check:docs    # docs format + lint + broken-link check
```

The fork-integrity gates run as standalone scripts:

```bash
bash scripts/ci/check-rebrand-leakage.sh        # rebrand-gate
node scripts/check-no-zombie-imports.mjs         # zombie-import-gate
node scripts/check-stub-debt.mjs                 # stub-debt-gate
node scripts/check-throwing-stub-callers.mjs     # throwing-stub-callers-gate
node scripts/check-attestations.mjs              # attestation-gate
node scripts/check-obsolescence-audit.mjs        # obsolescence-audit-gate
```

## Runners

All jobs run on GitHub-hosted `ubuntu-latest` runners.

## Notes

- On a pull request, a newer push cancels in-progress runs for the same PR (`concurrency` with `cancel-in-progress`). On `main`, runs are not cancelled — treat a `cancelled` job as CI noise unless the newest run for the same ref is also failing.
- `publish-next` and `publish-latest` use the `npm-publish` environment with OIDC provenance and run only on push / release, never on PRs.
- Separate workflows cover other concerns: CodeQL security scanning (`codeql.yml`), documentation build and deploy (`docs.yml`), and sync-PR auditing (`sync-pr-audit.yml`).

## Related

- [Install overview](/install)
- [Release channels](/install/development-channels)
