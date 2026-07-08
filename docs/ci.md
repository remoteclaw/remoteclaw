---
title: CI Pipeline
summary: "CI job graph and local command equivalents for the RemoteClaw fork"
read_when:
  - You need to understand why a CI job did or did not run
  - You are debugging a failing GitHub Actions check
  - You are coordinating a release validation run or rerun
---

# CI Pipeline

CI runs on every pull request, every push to `main`, and on published releases. The workflow is defined in `.github/workflows/ci.yml`.

RemoteClaw is a fork of RemoteClaw with the execution engine gutted (CLI-based agent runtimes replace in-process model providers). Its CI is correspondingly leaner than upstream's lane-based pipeline: a flat set of correctness jobs plus fork-integrity gates, with no changed-scope lane routing — every job runs on every PR.

## Jobs

| Job                          | Purpose                                                                           | When it runs         |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------- |
| `rebrand-gate`               | Detect `remoteclaw`/`RemoteClaw` leakage that should have been rebranded          | Always               |
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

The six `*-gate` jobs are fork-specific integrity checks that enforce the gut/keep boundary (the Middleware Boundary Principle). They have no upstream equivalent — they guard against an upstream sync silently re-introducing gutted code, leaking the `remoteclaw` brand, or growing stub debt.

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

## Local check gates and changed routing

Local changed-lane logic lives in `scripts/changed-lanes.mjs` and is executed by `scripts/check-changed.mjs`. That local check gate is stricter about architecture boundaries than the broad CI platform scope:

- core production changes run core prod and core test typecheck plus core lint/guards;
- core test-only changes run only core test typecheck plus core lint;
- extension production changes run extension prod and extension test typecheck plus extension lint;
- extension test-only changes run extension test typecheck plus extension lint;
- public Plugin SDK or plugin-contract changes expand to extension typecheck because extensions depend on those core contracts (Vitest extension sweeps stay explicit test work);
- release metadata-only version bumps run targeted version/config/root-dependency checks;
- unknown root/config changes fail safe to all check lanes.

Local changed-test routing lives in `scripts/test-projects.test-support.mjs` and is intentionally cheaper than `check:changed`: direct test edits run themselves, source edits prefer explicit mappings, then sibling tests and import-graph dependents. Shared group-room delivery config is one of the explicit mappings: changes to the group visible-reply config, source reply delivery mode, or the message-tool system prompt route through the core reply tests plus Discord and Slack delivery regressions so a shared default change fails before the first PR push. Use `REMOTECLAW_TEST_CHANGED_BROAD=1 pnpm test:changed` only when the change is harness-wide enough that the cheap mapped set is not a trustworthy proxy.

## Testbox validation

Crabbox is the repo-owned remote-box wrapper for maintainer Linux proof. Use it
from the repo root when a check is too broad for a local edit loop, when CI
parity matters, or when the proof needs secrets, Docker, package lanes,
reusable boxes, or remote logs. The normal RemoteClaw backend is
`blacksmith-testbox`; owned AWS/Hetzner capacity is a fallback for Blacksmith
outages, quota issues, or explicit owned-capacity testing.

Crabbox-backed Blacksmith runs warm, claim, sync, run, report, and clean up
one-shot Testboxes. The built-in sync sanity check fails fast when required
root files such as `pnpm-lock.yaml` disappear or when `git status --short`
shows at least 200 tracked deletions. For intentional large-deletion PRs, set
`REMOTECLAW_TESTBOX_ALLOW_MASS_DELETIONS=1` for the remote command.

`pnpm testbox:run` also terminates a local Blacksmith CLI invocation that stays in the sync phase for more than five minutes without post-sync output. Set `REMOTECLAW_TESTBOX_SYNC_TIMEOUT_MS=0` to disable that guard, or use a larger millisecond value for unusually large local diffs.

## Related

- [Install overview](/install)
- [Development channels](/install/development-channels)
