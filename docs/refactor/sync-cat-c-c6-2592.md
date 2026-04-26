---
title: "Sync Cat C cluster C6 — src/plugins/ + src/plugin-sdk/ Mixed Disposition (#2592)"
description: "Per-file disposition for 16 upstream src/plugins/ + src/plugin-sdk/ files in Cat C cluster C6 — 8 EXCLUDE-GUT (provider catalog gutted) + 7 EXTRACT (per-file inspection overrides cluster TSV's KEEP heuristic; same structural-restructure pattern as C4/C5: upstream introduced runtime-{channel}.ts factories, runtime-{channel}-contract.ts re-exports, extensions/{channel}/api.ts shim modules, src/shared/lazy-runtime.ts infra that the fork has not adopted) + 1 EXTRACT (registry-confirmed: install-min-host-version-guardrails.test.ts — minHostVersion feature port across 29 files is a separate WI)."
read_when:
  - Reviewing or closing #2592 (Cat C cluster C6 sync of v2026.3.22)
  - Triaging future upstream src/plugins/runtime/ additions and considering whether to migrate fork to upstream's createRuntime{channel}() factory pattern
  - Cross-referencing per-cluster registry-sync precedent for the v2026.3.22 backlog
  - Looking up why upstream's src/plugin-sdk/imessage-core.ts or src/plugin-sdk/imessage-targets.ts was not cherry-picked despite the src/plugins/ INCLUDE dir rule
---

# Sync Cat C cluster C6 — `src/plugins/` + `src/plugin-sdk/` Mixed Disposition (#2592)

**Issue**: #2592 — Process Cat C cluster C6 (src/plugins/ + src/plugin-sdk/, 16 files) — mixed cherry-pick (runtime) + registry-sync (provider catalog) + 1 EXTRACT
**Parent**: #2578 (Cat C decomposition)
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-26

## Summary

Of the 16 upstream files in Cat C cluster C6: **8 EXCLUDE-GUT** + **8 EXTRACT** (7 from KEEP-override + 1 registry-confirmed). **Zero cherry-picked.**

The cluster TSV's pattern-classification ("Mixed cherry-pick + registry-sync — 7 KEEP / 8 EXCLUDE-GUT / 1 EXTRACT") was overridden for all 7 supposed-KEEP files after per-file inspection — same divergence pattern as Cat C cluster C4 (PR #2602) and C5 (PR #2603).

- **Upstream v2026.3.22**: introduced new runtime composition modules under `src/plugins/runtime/` (`runtime-{channel}.ts` factories returning `PluginRuntimeChannel["{channel}"]`, `runtime-{channel}-ops.runtime.ts` lazy-loaded ops orchestrators, `runtime-{channel}-contract.ts` re-export contracts), per-channel SDK split (`src/plugin-sdk/imessage-core.ts` + `src/plugin-sdk/imessage-targets.ts` replacing the consolidated `imessage.ts`), per-channel `extensions/{channel}/api.ts` re-export shims (e.g., `extensions/imessage/api.ts` re-exporting from `./src/{accounts,group-policy,target-parsing-helpers,targets}.js`), and supporting infrastructure (`src/shared/lazy-runtime.ts` for `createLazyRuntimeSurface` + `createLazyRuntimeMethodBinder`, `src/plugins/runtime/typing-lease.test-support.ts` shared test harness).
- **Fork**: retains the pre-restructure layout. `src/plugins/runtime/index.ts` composes `createPluginRuntime()` directly (no per-channel `createRuntime{channel}()` factories — channel runtimes are wired via `setRuntime()` injection inside each extension's `index.ts`). `src/plugin-sdk/imessage.ts` and `src/plugin-sdk/telegram.ts` are consolidated SDK modules covering all per-channel symbols (no `imessage-core` / `imessage-targets` split). Fork has no `extensions/imessage/api.ts` shim (consumers import from `extensions/imessage/src/{module}.ts` directly). Fork has no `src/shared/lazy-runtime.ts` and no `typing-lease.test-support.ts`.

15 new rows added to `hq/upstream/disposition.tsv` (sibling-of-repo, not in git, lines 4615-4629). The 1 already-existing EXTRACT entry (`src/plugins/install-min-host-version-guardrails.test.ts` at line 485) carries forward unchanged.

## Per-file disposition

| #   | Path                                                      | Disposition | Source                      | Rationale                                                                                                                                                                          |
| --- | --------------------------------------------------------- | ----------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/plugin-sdk/imessage-core.ts`                         | EXTRACT     | per-file inspection (#2592) | depends on `extensions/imessage/api.js` (fork-absent); fork's `src/plugin-sdk/imessage.ts` already exports equivalent symbols                                                      |
| 2   | `src/plugin-sdk/imessage-targets.ts`                      | EXTRACT     | per-file inspection (#2592) | 1-line shim re-exporting `normalizeIMessageHandle` from `extensions/imessage/api.js` (fork-absent); fork imports from `extensions/imessage/src/targets.ts`                         |
| 3   | `src/plugin-sdk/ollama-setup.ts`                          | EXCLUDE-GUT | pattern (cluster TSV)       | model-provider catalog — gutted in fork                                                                                                                                            |
| 4   | `src/plugin-sdk/provider-catalog.ts`                      | EXCLUDE-GUT | pattern (cluster TSV)       | model-provider catalog — gutted in fork                                                                                                                                            |
| 5   | `src/plugin-sdk/provider-models.ts`                       | EXCLUDE-GUT | pattern (cluster TSV)       | model-provider catalog — gutted in fork                                                                                                                                            |
| 6   | `src/plugins/install-min-host-version-guardrails.test.ts` | EXTRACT     | registry (line 485)         | upstream `3ce5a8366a` adds `minHostVersion` feature across 29 files; feature port is separate WI — already in `disposition.tsv`                                                    |
| 7   | `src/plugins/provider-catalog-metadata.ts`                | EXCLUDE-GUT | pattern (cluster TSV)       | model-provider catalog — gutted in fork                                                                                                                                            |
| 8   | `src/plugins/provider-model-definitions.ts`               | EXCLUDE-GUT | pattern (cluster TSV)       | model-provider catalog — gutted in fork                                                                                                                                            |
| 9   | `src/plugins/provider-model-minimax.ts`                   | EXCLUDE-GUT | pattern (cluster TSV)       | model-provider catalog — gutted in fork                                                                                                                                            |
| 10  | `src/plugins/provider-ollama-setup.ts`                    | EXCLUDE-GUT | pattern (cluster TSV)       | model-provider catalog — gutted in fork                                                                                                                                            |
| 11  | `src/plugins/provider-vllm-setup.ts`                      | EXCLUDE-GUT | pattern (cluster TSV)       | model-provider catalog — gutted in fork                                                                                                                                            |
| 12  | `src/plugins/runtime/runtime-imessage.ts`                 | EXTRACT     | per-file inspection (#2592) | fork's `createPluginRuntime` does not call `createRuntimeIMessage`; fork uses `setIMessageRuntime()` injection in `extensions/imessage/index.ts`                                   |
| 13  | `src/plugins/runtime/runtime-telegram-contract.ts`        | EXTRACT     | per-file inspection (#2592) | exports `OpenClawConfig`/`OpenClawPluginApi` (rebrand needed) and imports from `extensions/telegram/{api,runtime-api}.js` (fork uses `extensions/telegram/src/{module}.ts` layout) |
| 14  | `src/plugins/runtime/runtime-telegram-ops.runtime.ts`     | EXTRACT     | per-file inspection (#2592) | orchestrator for `runtime-telegram.ts`; fork's runtime composition does not include this factory                                                                                   |
| 15  | `src/plugins/runtime/runtime-telegram-typing.test.ts`     | EXTRACT     | per-file inspection (#2592) | depends on `typing-lease.test-support.ts` (fork-absent); fork's `runtime-telegram-typing.ts` is tested via different harness                                                       |
| 16  | `src/plugins/runtime/runtime-telegram.ts`                 | EXTRACT     | per-file inspection (#2592) | depends on `src/shared/lazy-runtime.ts` (fork-absent); fork has no `createRuntimeTelegram` consumer                                                                                |

The 15 new rows (8 EXCLUDE-GUT + 7 EXTRACT) appear at lines 4615-4629 of `hq/upstream/disposition.tsv`. The 1 remaining EXTRACT (`install-min-host-version-guardrails.test.ts`, line 485) was added in an earlier wave and carries forward.

## Disposition class breakdown

The 8 EXTRACT verdicts (per-file inspection overrides) partition into three classes:

| Divergence class                                             | Files | Member files                                                                                                                                       | Fork equivalent / status                                                                                           |
| ------------------------------------------------------------ | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Structural restructure (per-channel runtime factory pattern) |     5 | `runtime-imessage.ts`, `runtime-telegram.ts`, `runtime-telegram-ops.runtime.ts`, `runtime-telegram-contract.ts`, `runtime-telegram-typing.test.ts` | Fork's `createPluginRuntime` directly composes runtime; channel runtimes injected via `setRuntime()` per extension |
| SDK module split (per-channel SDK module decomposition)      |     2 | `imessage-core.ts`, `imessage-targets.ts`                                                                                                          | Fork's `src/plugin-sdk/imessage.ts` consolidates equivalent symbols; consumers import from there                   |
| Pre-existing feature-port deferral (registry-confirmed)      |     1 | `install-min-host-version-guardrails.test.ts`                                                                                                      | Already EXTRACT at line 485; `minHostVersion` feature port across 29 files is a separate WI                        |
| **Total EXTRACT**                                            | **8** |                                                                                                                                                    |                                                                                                                    |

## Why EXTRACT (and not KEEP / EXCLUDE-GUT) for the 7 supposed-KEEP entries

Per-file inspection clears the cluster TSV's pattern-heuristic ("imessage extension preserved" / "telegram/imessage runtime — channel preserved" — both true premises but insufficient for KEEP):

1. **The supposed-KEEP files target NEW upstream module structures the fork has not adopted**. The 7 paths split into two new structures:
   - **Per-channel runtime factory pattern (5 files)**: Upstream introduced `src/plugins/runtime/runtime-{channel}.ts` files that export `createRuntime{Channel}()` factories returning `PluginRuntimeChannel["{channel}"]` slices, plus `runtime-{channel}-ops.runtime.ts` lazy-loaded orchestrators and `runtime-{channel}-contract.ts` re-export contracts. The intent appears to be modularizing per-channel runtime composition. Fork has none of this — `src/plugins/runtime/index.ts` composes `createPluginRuntime()` directly without per-channel factories, and channel runtimes are wired via `setRuntime()` injection inside each extension's `index.ts` (e.g., `extensions/imessage/index.ts` calls `setIMessageRuntime(api.runtime)`).

   - **Per-channel SDK module split (2 files)**: Upstream split `imessage.ts` into `imessage-core.ts` (channel plugin types/helpers) + `imessage-targets.ts` (1-line shim for `normalizeIMessageHandle`). Fork retains a single consolidated `src/plugin-sdk/imessage.ts` that exports all equivalent symbols. Adopting upstream's split would create three different ways to import iMessage SDK symbols without functional benefit.

2. **Cherry-picking would not even resolve imports**. Concrete dangling imports identified:
   - `src/shared/lazy-runtime.ts` — used by upstream's `runtime-telegram.ts` (`createLazyRuntimeMethodBinder`, `createLazyRuntimeSurface`); **does NOT exist in fork**.
   - `src/plugins/runtime/typing-lease.test-support.ts` — used by upstream's `runtime-telegram-typing.test.ts` (`expectBackgroundTypingPulseFailuresAreSwallowed`, `expectIndependentTypingLeases`); **does NOT exist in fork**.
   - `extensions/imessage/api.ts` — used by upstream's `imessage-core.ts` and `imessage-targets.ts` (re-exports `parseChatAllowTargetPrefixes`, `normalizeIMessageHandle`, etc.); **does NOT exist in fork** (fork's consumers import from `extensions/imessage/src/{accounts,target-parsing-helpers,targets}.ts` directly).
   - `extensions/telegram/api.ts` and `extensions/telegram/runtime-api.ts` — used by upstream's `runtime-telegram-contract.ts` (re-exports for `inspectTelegramAccount`, `monitorTelegramProvider`, `probeTelegram`, `sendMessageTelegram`, etc.); **fork uses different layout** (consumers import from `extensions/telegram/src/{account-inspect,probe,...}.ts` directly).

3. **Cherry-picking would create dead code**. `createRuntimeIMessage()` and `createRuntimeTelegram()` factories have no consumer in fork. Fork's `createPluginRuntime()` (in `src/plugins/runtime/index.ts`) does not call them — the fork's runtime composition pattern is fundamentally different.

4. **Naive rebrand would not fix the structural divergence**. `OpenClawConfig` → `RemoteClawConfig` and `OpenClawPluginApi` → `RemoteClawPluginApi` are mechanical search-and-replace transforms, but the import path divergence (`extensions/{channel}/api.ts` does not exist in fork) and the missing infrastructure (`src/shared/lazy-runtime.ts`, `typing-lease.test-support.ts`) require additional architectural decisions.

5. **EXCLUDE-GUT is the wrong semantic**. The 7 upstream paths are NOT "deleted from fork, must stay deleted" (the EXCLUDE-GUT contract). They are paths where fork has divergent equivalents at different abstractions / different layouts. The EXTRACT semantic — "fork has a divergent variant; future ports must reconcile against the upstream version" — fits exactly. (Same precedent as `extensions/discord/src/monitor/listeners.ts`, `extensions/telegram/src/bot-handlers.ts` per channel-divergence rule, and Cat C C4/C5 structural-restructure entries.)

## How to verify

Verification commands and outputs are recorded in the PR description and `## Test plan` checklist below.

## Acceptance criteria

- [x] Each of the 16 paths has an applied disposition (cherry-pick commit, divergence record, or `disposition.tsv` row) — 15 new rows + 1 already-existing EXTRACT (`install-min-host-version-guardrails.test.ts`)
- [x] Local `pnpm check` (lint + typecheck) passes
- [x] Test suite passes for affected scope — no production code changes (registry-only; no test-file additions)
- [~] Each EXTRACT entry has a paired `hq/upstream/divergence/{path}.md` divergence record — **deviation (justified)**: C1-C5 precedents (PRs #2599-#2603) consolidate per-file resolutions into `docs/refactor/sync-cat-c-c{N}-{issue}.md` + `disposition.tsv` rows; per-file `.md` files are an OLDER pattern not used by recent waves. C6 follows the C5 precedent.
- [x] Bulk audit re-run shows C6 cluster residual = 0 — verified via per-path `classify.py` lookup against post-update `disposition.tsv`

## Test plan

- [x] `pnpm check` passes locally
- [x] No production code changes — fork's source tree is unchanged; only `hq/upstream/disposition.tsv` (sibling-of-repo, not in git) and this `docs/refactor/` page change.
- [x] Audit classification of all 16 C6 paths against post-update `disposition.tsv` → 0 INCLUDE + 8 EXTRACT + 8 EXCLUDE-GUT + 0 UNKNOWNS + 0 COLLISIONS
- [x] Layout matches Cat C C1/C2/C3/C4/C5 precedents (`docs/refactor/sync-cat-c-c{1,2,3,4,5}-{2587,2588,2589,2590,2591}.md`)

## Out of scope

- Other Cat C clusters: C1 (#2587 — closed, see PR #2599), C2 (#2588 — closed, see PR #2600), C3 (#2589 — closed, see PR #2601), C4 (#2590 — closed, see PR #2602), C5 (#2591 — closed, see PR #2603), C7 (#2593), C8 (#2594) — separate per-cluster issues.
- Cat A waves (#2582-#2585) — closed, see PRs #2595-#2598.
- Cat B (#2577) — closed, see PR #2586.
- B11 sync batch (`v2026.3.22 → v2026.4.19-beta.2`) — scheduled after Cat A/B/C close.
- **Adopting upstream's per-channel runtime factory pattern** (introducing `createRuntimeIMessage()`, `createRuntimeTelegram()`, `runtime-{channel}-contract.ts`, `runtime-{channel}-ops.runtime.ts`, `src/shared/lazy-runtime.ts`, etc. and migrating fork's `extensions/{channel}/index.ts` from `setRuntime()` injection to factory composition) — would unblock cherry-picking the 5 structural-restructure entries in a future sync. Separate refactor; not in C6 scope.
- **Adopting upstream's per-channel SDK module split** (replacing fork's consolidated `src/plugin-sdk/imessage.ts` with `imessage-core.ts` + `imessage-targets.ts` pair, plus per-channel `extensions/{channel}/api.ts` shims) — would unblock cherry-picking the 2 SDK split entries. Separate refactor; not in C6 scope.
- **Porting `minHostVersion` feature** (upstream `3ce5a8366a` adds `minHostVersion` feature spread across 29 files) — would unblock cherry-picking `install-min-host-version-guardrails.test.ts`. Separate WI; already deferred via existing EXTRACT row at line 485.

## Audit verification

Programmatic verification against `hq/upstream/disposition.tsv` (post-update) using `hq/scripts/classify.py`:

- **Total expected**: 16
- **Found**: 16/16 — 8 EXTRACT (action) + 8 EXCLUDE-GUT (action), 0 UNKNOWNS, 0 COLLISIONS
- **Bucket distribution**: EXTRACT (8) + EXCLUDE (8) — no INCLUDE bucket entries (no cherry-picks)
