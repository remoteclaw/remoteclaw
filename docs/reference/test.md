---
summary: "How to run tests locally (vitest) and when to use force/coverage modes"
read_when:
  - Running or fixing tests
title: "Tests"
---

# Tests

- Full testing kit (suites, live, Docker): [Testing](/help/testing)

- `pnpm test`: runs the native Vitest root projects config directly. File filters work natively across the configured projects.
- `pnpm test:force`: Kills any lingering gateway process holding the default control port, then runs the full Vitest suite with an isolated gateway port so server tests don’t collide with a running instance. Use this when a prior gateway run left port 18789 occupied.
- `pnpm test:coverage`: Runs the unit suite with V8 coverage (via `vitest.unit.config.ts`). This is a loaded-file unit coverage gate, not whole-repo all-file coverage. Thresholds are 70% lines/functions/statements and 55% branches. Because `coverage.all` is false, the gate measures files loaded by the unit coverage suite instead of treating every split-lane source file as uncovered.
- Base Vitest config defaults to `pool: "threads"` and `isolate: false`, with the shared non-isolated runner enabled across the repo configs.
- `pnpm test:channels`: runs `vitest.channels.config.ts`.
- `pnpm test:extensions`: runs the extension/plugin suites (`vitest.extensions.config.ts`).
- Gateway integration: opt-in via `REMOTECLAW_TEST_INCLUDE_GATEWAY=1 pnpm test` or `pnpm test:gateway`.
- `pnpm test:e2e`: Runs gateway end-to-end smoke tests (multi-instance WS/HTTP/node pairing). Defaults to `threads` + `isolate: false` with adaptive workers in `vitest.e2e.config.ts`; tune with `REMOTECLAW_E2E_WORKERS=<n>` and set `REMOTECLAW_E2E_VERBOSE=1` for verbose logs.
- `pnpm test:live`: Runs provider live tests. Requires API keys and `REMOTECLAW_LIVE_TEST=1` (or provider-specific `*_LIVE_TEST=1`) to unskip.

## Local PR gate

For local PR land/gate checks, run:

- `pnpm check`
- `pnpm build`
- `pnpm test`
- `pnpm check:docs`

If `pnpm test` flakes on a loaded host, rerun once before treating it as a regression, then isolate with `pnpm test <path/to/test>`. For memory-constrained hosts, use:

- `REMOTECLAW_TEST_WORKERS=1 pnpm test`

## CLI startup bench

Script: [`scripts/bench-cli-startup.ts`](https://github.com/remoteclaw/remoteclaw/blob/main/scripts/bench-cli-startup.ts)

Usage:

- `pnpm tsx scripts/bench-cli-startup.ts`
- `pnpm tsx scripts/bench-cli-startup.ts --runs 12`
- `pnpm tsx scripts/bench-cli-startup.ts --preset real`
- `pnpm tsx scripts/bench-cli-startup.ts --preset real --case status --case gatewayStatus --runs 3`
- `pnpm tsx scripts/bench-cli-startup.ts --entry remoteclaw.mjs --entry-secondary dist/entry.js --preset all`
- `pnpm tsx scripts/bench-cli-startup.ts --preset all --output .artifacts/cli-startup-bench-all.json`
- `pnpm tsx scripts/bench-cli-startup.ts --preset real --cpu-prof-dir .artifacts/cli-cpu`
- `pnpm tsx scripts/bench-cli-startup.ts --json`

Presets:

- `startup`: `--version`, `--help`, `health`, `health --json`, `status --json`, `status`
- `real`: `health`, `status`, `status --json`, `sessions`, `sessions --json`, `agents list --json`, `gateway status`, `gateway status --json`, `gateway health --json`, `config get gateway.port`
- `all`: both presets

Output includes `sampleCount`, avg, p50, p95, min/max, exit-code/signal distribution, and max RSS summaries for each command. Optional `--cpu-prof-dir` / `--heap-prof-dir` writes V8 profiles per run so timing and profile capture use the same harness.

## Onboarding E2E (Docker)

Docker is optional; this is only needed for containerized onboarding smoke tests.

Full cold-start flow in a clean Linux container:

```bash
scripts/e2e/onboard-docker.sh
```

This script drives the interactive wizard via a pseudo-tty, verifies config/workspace/session files, then starts the gateway and runs `remoteclaw health`.

## QR import smoke (Docker)

Ensures `qrcode-terminal` loads under the supported Docker Node runtimes (Node 24 default, Node 22 compatible):

```bash
pnpm test:docker:qr
```
