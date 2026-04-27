---
title: "Sync Cat C cluster C7 — src/cli/ + src/commands/ + src/auto-reply/ Memory-CLI + Provider-Defaults Disposition (#2593)"
description: "Per-file disposition for 10 upstream src/cli/ + src/commands/ + src/auto-reply/ files in Cat C cluster C7 — 1 KEEP (cherry-pick with rebrand), 1 EXTRACT, 8 EXCLUDE-GUT. Cluster TSV's pattern-classification (2 KEEP / 8 EXCLUDE-GUT) was overridden for 1 of the 2 supposed-KEEP files (nodes-cli approval-timeout test) after per-file inspection: depends on fork-absent infra/exec-approvals.js (exec-approvals subsystem gutted) and asserts hardcoded value matching upstream's 120_000 timeout (fork inlined as 30_000). The doctor migration test cherry-picks cleanly with mechanical rebrand (resolveOpenClawPackageRoot → resolveRemoteClawPackageRoot, OPENCLAW_UPDATE_IN_PROGRESS env var, /tmp path) plus a 1-line addition to doctor.fast-path-mocks.ts to mock the fork-added noteDeprecatedLegacyEnvVars helper."
read_when:
  - Reviewing or closing #2593 (Cat C cluster C7 sync of v2026.3.22)
  - Triaging future upstream tests under src/cli/nodes-cli/ that import from infra/exec-approvals.js
  - Looking up why DEFAULT_EXEC_APPROVAL_TIMEOUT_MS is inlined in register.invoke.ts at the gutted-subsystem boundary
  - Cross-referencing per-cluster registry-sync precedent for the v2026.3.22 backlog
---

# Sync Cat C cluster C7 — `src/cli/` + `src/commands/` + `src/auto-reply/` Memory-CLI + Provider-Defaults Disposition (#2593)

**Issue**: #2593 — Process Cat C cluster C7 (src/cli/ + src/commands/ + src/auto-reply/, 10 files) — registry-sync (memory CLI + provider defaults) + 2 cherry-picks
**Parent**: #2578 (Cat C decomposition)
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-26

## Summary

Of the 10 upstream files in Cat C cluster C7 (memory CLI + provider defaults + 2 incidentally-clustered tests across `src/cli/`, `src/commands/`, and `src/auto-reply/`), **1 file is dispositioned KEEP and cherry-picked (with rebrand)**, **1 file is dispositioned EXTRACT**, and **8 files are dispositioned EXCLUDE-GUT** — partial divergence from cluster TSV's initial pattern-classification (2 KEEP / 8 EXCLUDE-GUT).

The 8 EXCLUDE-GUT entries match cluster TSV pattern-classification verbatim — all touch subsystems gutted in the fork (memory CLI/runtime, model-provider catalog auth/defaults). The 2 supposed-KEEP files split: one cherry-picks cleanly with mechanical rebrand (doctor migration test), the other reclassifies to EXTRACT after per-file inspection (nodes-cli approval-timeout test).

The cluster TSV's pattern-classification ("registry-sync + 2 cherry-picks") was overridden for the nodes-cli test only — the test depends on `src/infra/exec-approvals.js`, a fork-absent file that resulted from the fork inlining a single constant when gutting the exec-approvals subsystem. The constant's value differs (upstream: `120_000`; fork: `30_000`), and the test asserts a hardcoded `130_000` value computed against the upstream value. Cherry-picking would require both an import-path rewrite AND a numeric assertion rewrite — divergence rather than clean cherry-pick.

9 new rows added to `hq/upstream/disposition.tsv` (sibling-of-repo, not in git): 8 EXCLUDE-GUT + 1 EXTRACT. The 1 cherry-pick (`src/commands/doctor.migrates-routing-allowfrom-channels-whatsapp-allowfrom.test.ts`) is added directly to the fork; no file-level disposition row needed because the existing `INCLUDE src/commands/` directory-wide rule (line 738) covers it.

## Per-file disposition

| #   | Path                                                                                 | Disposition | Source                      | Fork equivalent / Rationale                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------ | ----------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/auto-reply/reply/memory-flush.test.ts`                                          | EXCLUDE-GUT | pattern                     | gutted: test for memory subsystem — memory CLI + memory-search infrastructure removed in fork                                                                                                                                     |
| 2   | `src/cli/memory-cli.runtime.ts`                                                      | EXCLUDE-GUT | pattern                     | gutted: memory CLI runtime — memory subsystem removed in fork                                                                                                                                                                     |
| 3   | `src/cli/memory-cli.test.ts`                                                         | EXCLUDE-GUT | pattern                     | dead: test for memory CLI — memory subsystem removed in fork                                                                                                                                                                      |
| 4   | `src/cli/memory-cli.ts`                                                              | EXCLUDE-GUT | pattern                     | gutted: memory CLI command — memory subsystem removed in fork                                                                                                                                                                     |
| 5   | `src/cli/nodes-cli/register.invoke.nodes-run-approval-timeout.test.ts`               | EXTRACT     | per-file inspection (#2593) | fork-divergent: imports from fork-absent `src/infra/exec-approvals.js`; hardcoded test assertions assume upstream's `DEFAULT_EXEC_APPROVAL_TIMEOUT_MS = 120_000`; fork inlined value `30_000`. See § The nodes-cli test decision. |
| 6   | `src/commands/auth-choice.apply.api-key-providers.ts`                                | EXCLUDE-GUT | pattern                     | gutted: API key provider auth catalog — provider system gutted in fork                                                                                                                                                            |
| 7   | `src/commands/doctor.migrates-routing-allowfrom-channels-whatsapp-allowfrom.test.ts` | **KEEP**    | per-file inspection (#2593) | clean cherry-pick with mechanical rebrand: all referenced symbols exist in fork harness (some rebranded). See § The doctor migration test decision.                                                                               |
| 8   | `src/commands/google-gemini-model-default.ts`                                        | EXCLUDE-GUT | pattern                     | gutted: Gemini model default selection — model-provider catalog removed in fork                                                                                                                                                   |
| 9   | `src/commands/onboard-non-interactive/local/auth-choice.api-key-providers.ts`        | EXCLUDE-GUT | pattern                     | gutted: non-interactive API key provider onboarding — provider system gutted in fork                                                                                                                                              |
| 10  | `src/commands/openai-model-default.ts`                                               | EXCLUDE-GUT | pattern                     | gutted: OpenAI model default selection — model-provider catalog removed in fork                                                                                                                                                   |

## The `nodes-cli/register.invoke.nodes-run-approval-timeout.test.ts` decision

The single new EXTRACT in this cluster.

**Upstream content** (`src/cli/nodes-cli/register.invoke.nodes-run-approval-timeout.test.ts` @ `v2026.3.22`): regression test for upstream issue `#12098` — verifies that `nodes run` exec-approval requests use a CLI transport timeout long enough to outlast the gateway-side approval wait. The test imports:

```ts
import { DEFAULT_EXEC_APPROVAL_TIMEOUT_MS } from "../../infra/exec-approvals.js";
import { parseTimeoutMs } from "../nodes-run.js";
```

and asserts hardcoded values like:

```ts
const transportTimeoutMs = Math.max(parseTimeoutMs("foo") ?? 0, approvalTimeoutMs + 10_000);
expect(transportTimeoutMs).toBe(130_000);
```

`130_000 = DEFAULT_EXEC_APPROVAL_TIMEOUT_MS (120_000) + 10_000`.

**Fork architecture**: the exec-approvals subsystem (`src/infra/exec-approvals.ts`, `loadExecApprovals`, `resolveExecApprovalsFromFile`, `ExecApprovalsFile`, `normalizeExecAsk`, `normalizeExecSecurity`, etc.) was gutted in the fork. `src/cli/nodes-cli/register.invoke.ts` retains only the minimal subset needed for the `exec.approval.request` flow itself (the production code path the upstream test exercises), with the constant inlined at a different value:

```ts
// Exec-approvals subsystem was gutted — inline minimal types and helpers.
type ExecSecurity = "deny" | "allowlist" | "full";
type ExecAsk = "off" | "on-miss" | "always";
type ExecApprovalsFile = Record<string, unknown>;
const DEFAULT_EXEC_APPROVAL_TIMEOUT_MS = 30000;
```

Cherry-picking the upstream test would require:

1. Rewriting the import path: `../../infra/exec-approvals.js` (fork-absent) → either inline the value, import from `./register.invoke.js` (not currently exported), or duplicate the constant in the test.
2. Rewriting the hardcoded numeric assertions: `expect(transportTimeoutMs).toBe(130_000)` → `expect(transportTimeoutMs).toBe(40_000)` (because `30_000 + 10_000 = 40_000`).
3. Doing the same for the other 3 hardcoded assertions in the test file.

Both rewrites are mechanical, but together they constitute a divergent fork-specific test, not a clean cherry-pick. The test would no longer be tracking the upstream specification — it would be tracking the fork's gutted-subsystem variant. The upstream fix it verifies (overriding `transportTimeoutMs` so the CLI doesn't time out before the gateway approval completes) **is already present and live in the fork** at `src/cli/nodes-cli/register.invoke.ts:240-264`:

```ts
approvalId = crypto.randomUUID();
const approvalTimeoutMs = DEFAULT_EXEC_APPROVAL_TIMEOUT_MS;
// Keep client transport alive while the approver decides.
const transportTimeoutMs = Math.max(
  parseTimeoutMs(params.opts.timeout) ?? 0,
  approvalTimeoutMs + 10_000,
);
const decisionResult = (await callGatewayCli(
  "exec.approval.request",
  ...{ transportTimeoutMs },
)) as { decision?: string } | null;
```

The fork's `callGatewayCli` (`src/cli/nodes-cli/rpc.ts:16-37`) is byte-identical to upstream and accepts the same `{ transportTimeoutMs }` 4th-arg `callOpts` parameter. The fix logic is fork-shared; only the constant and its location differ.

**Disposition row added** to `hq/upstream/disposition.tsv`:

```text
EXTRACT  src/cli/nodes-cli/register.invoke.nodes-run-approval-timeout.test.ts  fork-divergent: imports DEFAULT_EXEC_APPROVAL_TIMEOUT_MS from src/infra/exec-approvals.js (fork-absent — exec-approvals subsystem gutted, constant inlined as 30000 in register.invoke.ts); test asserts hardcoded 130_000 against upstream's 120_000 timeout (would compute to 40_000 with fork's value); fork verifies same fix in register.invoke.ts:240-264 production code (#2593 C7)
```

If fork test coverage of the same fix is desired in the future, the right shape is a fork-owned test that sources `DEFAULT_EXEC_APPROVAL_TIMEOUT_MS` from the same location the production code does (currently inline) — not a rebranded copy of the upstream test. Tracking as EXTRACT keeps that follow-up visible.

## The `doctor.migrates-routing-allowfrom-channels-whatsapp-allowfrom.test.ts` decision

The single new KEEP cherry-pick in this cluster.

**Upstream content** (`src/commands/doctor.migrates-routing-allowfrom-channels-whatsapp-allowfrom.test.ts` @ `v2026.3.22`): three-test suite verifying:

1. `doctorCommand({ repair: true })` migrates a legacy `routing.allowFrom` config to `channels.whatsapp.allowFrom` and writes the result without adding a new gateway auth token.
2. `doctorCommand` skips uninstalling legacy gateway services when `serviceIsLoaded` returns `false` for the legacy label.
3. `doctorCommand` offers to update first when `resolveOpenClawPackageRoot` returns a git-checkout root, calling `runGatewayUpdate` with the resolved cwd and noting "Update result".

The test imports all of its harness symbols from `./doctor.e2e-harness.js` and pulls in `./doctor.fast-path-mocks.js` for the surrounding mock surface.

**Fork support**: every required harness symbol exists in the fork's `doctor.e2e-harness.ts`:

- `migrateLegacyConfig`, `mockDoctorConfigSnapshot`, `findLegacyGatewayServices`, `uninstallLegacyGatewayServices`, `serviceInstall`, `serviceIsLoaded`, `runGatewayUpdate`, `runCommandWithTimeout`, `note`, `readConfigFileSnapshot`, `writeConfigFile`, `createDoctorRuntime`: same names, same signatures, all wired as `vi.fn()` mocks.
- `resolveOpenClawPackageRoot` → fork has `resolveRemoteClawPackageRoot` (one-line rename, same behavior — the rebrand is already complete in fork's harness).
- `OPENCLAW_UPDATE_IN_PROGRESS` env var → fork uses `REMOTECLAW_UPDATE_IN_PROGRESS` (consumed by `src/commands/doctor-update.ts:34`).
- `/tmp/openclaw` test fixture path → rebrand to `/tmp/remoteclaw` for consistency with fork's other harness fixture paths (e.g., `/tmp/remoteclaw.json`).

The legacy upstream service label `com.steipete.openclaw.gateway` is **kept verbatim** in the test fixture data — the test exists precisely to verify the fork can detect and skip-or-clean these legacy upstream services for users migrating from upstream OpenClaw installations. Rebranding it would defeat the test's purpose.

**Migration logic verified end-to-end**:

- Fork's `migrateLegacyConfig` (re-exported from `src/config/legacy-migrate.ts:5`) wraps `applyLegacyMigrations` from `src/config/legacy.js`. The routing.allowFrom→channels.whatsapp.allowFrom migration rule lives in `src/config/legacy.rules.ts:97-99` ("`routing.allowFrom was removed; use channels.whatsapp.allowFrom instead (auto-migrated on load).`"). The test mocks the harness's `migrateLegacyConfig` directly, so the rule itself isn't exercised — but its presence confirms the migration is supported by the fork's runtime, not just the test mock.
- Fork's doctor flow does not directly call `migrateLegacyConfig`; instead, the doctor command delegates to `loadAndMaybeMigrateDoctorConfig` from `doctor-config-flow.ts`, which routes the (mocked) `migrateLegacyConfig` through the same code path the upstream test expects.

**Mock-gap fix** (single line of fork-side production support): the cherry-picked test runs `doctorCommand` end-to-end through `doctor.fast-path-mocks.ts`. Fork's `doctor.ts:85` calls `noteDeprecatedLegacyEnvVars()` — a fork-added helper (`src/commands/doctor-platform-notes.ts:123`) for migrating users from the legacy upstream `CLAWDBOT_*` env-var prefix to `REMOTECLAW_*`. The fork's `doctor.fast-path-mocks.ts` already mocks `doctor-platform-notes.js` but, prior to this change, did not include `noteDeprecatedLegacyEnvVars` in the mock object. One line was added to the mock to expose it as `vi.fn()`:

```diff
 vi.mock("./doctor-platform-notes.js", () => ({
   noteStartupOptimizationHints: vi.fn(),
   noteMacLaunchAgentOverrides: vi.fn().mockResolvedValue(undefined),
   noteMacLaunchctlGatewayEnvOverrides: vi.fn().mockResolvedValue(undefined),
+  noteDeprecatedLegacyEnvVars: vi.fn(),
 }));
```

This is a fork-bug fix (the mock was incomplete relative to fork's own production code); it benefits any future fork doctor test that uses `fast-path-mocks` to drive `doctorCommand` end-to-end. Without it, the cherry-picked test fails with `[vitest] No "noteDeprecatedLegacyEnvVars" export is defined on the "./doctor-platform-notes.js" mock`. With it, all 3 tests pass.

**Disposition**: no file-level row added to `disposition.tsv` — the existing directory-wide rule `INCLUDE src/commands/` (line 738: "CLI commands — alive core, want upstream improvements") covers the new test cleanly. The classify audit confirms it resolves to bucket `INCLUDE`.

## Audit verification

Programmatic verification against `hq/upstream/disposition.tsv` for the 10 C7 paths:

```
=== STATUS BREAKDOWN ===
  A: 10
  D: 0
  M: 0

=== BUCKET COUNTS ===
  EXCLUDE: 8
  EXTRACT: 1
  INCLUDE: 1

=== ACTION COUNTS ===
  EXCLUDE-GUT: 8
  EXTRACT: 1
  INCLUDE: 1

=== UNKNOWNS: 0 ===
```

Bulk audit residual for Cat C cluster C7 against `v2026.3.22`: **0**.

Test execution for the 1 cherry-picked file:

```
✓ src/commands/doctor.migrates-routing-allowfrom-channels-whatsapp-allowfrom.test.ts (3 tests | 3 passed)
  ✓ does not add a new gateway auth token while fixing legacy issues on invalid config
  ✓ skips legacy gateway services migration
  ✓ offers to update first for git checkouts
```

## Out of scope

- Other Cat C clusters: C1 (#2587 — closed, see PR #2599), C2 (#2588 — closed, see PR #2600), C3 (#2589 — closed, see PR #2601), C4 (#2590 — closed, see PR #2602), C5 (#2591 — closed, see PR #2603), C6 (#2592 — closed, see PR #2604), C8 (#2594) — separate per-cluster issues.
- Cat A waves (#2582-#2585) — closed, see PRs #2595-#2598.
- Cat B (#2577) — closed, see PR #2586.
- B11 sync batch (`v2026.3.22 → v2026.4.19-beta.2`) — scheduled after Cat A/B/C close.
- Fork-owned test for the `transportTimeoutMs` fix verified by the EXTRACT'd `register.invoke.nodes-run-approval-timeout.test.ts` — would need its own work item if coverage gap is judged material; the production fix itself is live in `register.invoke.ts:240-264`.
