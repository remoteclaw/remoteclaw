---
title: "Sync Cat C cluster C8 — src/channels/ + src/config/ + test/helpers/ + test/scripts/ Plugin-Contract + Test-Infra Disposition (#2594)"
description: "Per-file disposition for 9 upstream src/channels/ + src/config/ + test/helpers/ + test/scripts/ files in Cat C cluster C8 — 9 EXCLUDE-GUT after registry override of cluster TSV's pattern-based 5 KEEP / 4 EXCLUDE-GUT split. Per-file inspection found that all 5 supposed-KEEP files belong to families with explicit registry EXCLUDE-GUT entries for siblings (src/channels/plugins/contracts/* gutted plugin contract testing infrastructure; read-only-account-inspect.* family entirely gutted; legacy.migrations.part-{1,3}.ts already EXCLUDE-GUT). 9 new rows added to disposition.tsv (8 file-level + 1 explicit override of test/ INCLUDE for test/scripts/test-find-thread-candidates.test.ts)."
read_when:
  - Reviewing or closing #2594 (Cat C cluster C8 sync of v2026.3.22)
  - Triaging future upstream files under src/channels/plugins/contracts/ (gutted plugin contract testing infra)
  - Triaging future upstream files matching read-only-account-inspect.{channel}.runtime.ts pattern
  - Triaging future upstream files matching legacy.migrations.part-N.ts split pattern
  - Looking up why test/scripts/* tests need explicit file-level EXCLUDE-GUT rules even though test/scripts/ has a dir-level EXCLUDE rule (classify.py first-match-wins among dir rules — broader test/ INCLUDE rule appears earlier)
  - Cross-referencing per-cluster registry-sync precedent for the v2026.3.22 backlog
---

# Sync Cat C cluster C8 — `src/channels/` + `src/config/` + `test/helpers/` + `test/scripts/` Plugin-Contract + Test-Infra Disposition (#2594)

**Issue**: #2594 — Process Cat C cluster C8 (src/channels/ + src/config/ + test/helpers/ + test/scripts/, 9 files) — cherry-pick (5) + registry-sync (4) — test-infra rename verification for v2026.3.22 sync backlog
**Parent**: #2578 (Cat C decomposition)
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-27

## Summary

Of the 9 upstream files in Cat C cluster C8 (plugin-contract tests + telegram inspect runtime + legacy migration + 4 test-infra files across `src/channels/`, `src/config/`, `test/helpers/`, and `test/scripts/`), **all 9 files are dispositioned EXCLUDE-GUT** — substantial divergence from cluster TSV's initial pattern-classification (5 KEEP / 4 EXCLUDE-GUT).

The 4 originally-EXCLUDE-GUT entries (3 test/helpers/extensions/\* + 1 test/scripts/\*) verify cleanly: the 3 test/helpers/extensions/\* paths are upstream renames of registry-tagged dead helpers; the test/scripts/ path is dir-rule-covered semantically but requires an explicit file-level rule (see § The `test/scripts/test-find-thread-candidates.test.ts` explicit override). The 5 originally-KEEP entries all reclassify to EXCLUDE-GUT after per-file inspection against the registry — the cluster TSV's `pattern` source-classification missed that all 5 belong to families with explicit registry EXCLUDE-GUT entries for sibling files. This is the same precedent C7 (#2593) established (cluster TSV pattern-classification overridden by per-file inspection), applied here at larger scale (5/5 reclassified instead of 1/2).

9 new rows added to `hq/upstream/disposition.tsv` (sibling-of-repo, not in git): 8 file-level EXCLUDE-GUT for the previously-unclassified upstream paths plus 1 explicit file-level EXCLUDE-GUT for `test/scripts/test-find-thread-candidates.test.ts` to override the broader `test/` INCLUDE rule (line 774) — `classify.py` resolves directory rules by first-match-wins per its module docstring, so the `test/scripts/` EXCLUDE rule (line 776) does not automatically win against the earlier `test/` INCLUDE rule. The fork's existing convention (lines 4215-4225) is to add explicit file-level rules for `test/scripts/*.test.ts` files, and this addition follows that pattern.

## Per-file disposition

| #   | Path                                                               | Disposition | Source                      | Fork equivalent / Rationale                                                                                                                                                                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------ | ----------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/channels/plugins/contracts/inbound.contract.test.ts`          | EXCLUDE-GUT | per-file inspection (#2594) | dead: test for inbound contract — plugin system gutted; imports `./inbound-testkit.js` (registry EXCLUDE-GUT line 3011) and `./suites.js` (NEW upstream, missing in fork). See § The plugin-contract reclassification.                                                                                                                                                 |
| 2   | `src/channels/plugins/contracts/outbound-payload.contract.test.ts` | EXCLUDE-GUT | per-file inspection (#2594) | dead: test for outbound payload contract — plugin system gutted; imports `./suites.js` (missing in fork) and `extensions/{discord,whatsapp}/src/outbound-adapter.ts` (missing in fork). See § The plugin-contract reclassification.                                                                                                                                    |
| 3   | `src/channels/plugins/contracts/registry-backed.contract.test.ts`  | EXCLUDE-GUT | per-file inspection (#2594) | dead: test for registry-backed contract — plugin system gutted; imports `./registry.js` (NEW upstream, no fork equivalent) and `extensions/matrix/api.js` (missing in fork). See § The plugin-contract reclassification.                                                                                                                                               |
| 4   | `src/channels/read-only-account-inspect.telegram.runtime.ts`       | EXCLUDE-GUT | per-file inspection (#2594) | dead: Telegram account inspect — upstream rename of `read-only-account-inspect.telegram.ts` (registry EXCLUDE-GUT line 3051); imports from `extensions/telegram/api.js` barrel (missing in fork); entire `read-only-account-inspect.*` family registry EXCLUDE-GUT including parent (line 3052). See § The read-only-account-inspect reclassification.                 |
| 5   | `src/config/legacy.migrations.part-2.ts`                           | EXCLUDE-GUT | per-file inspection (#2594) | gutted: legacy config migration — sibling parts `part-1.ts` (line 215) and `part-3.ts` (line 216) BOTH already EXCLUDE-GUT; fork has flat `legacy.migrations.ts` (no part-N split); upstream's part-2 migrates to multi-model `agent.models` array structure (gutted in fork). See § The legacy.migrations.part-2 reclassification.                                    |
| 6   | `test/helpers/extensions/plugin-api.ts`                            | EXCLUDE-GUT | tbd-confirmed               | upstream-only: plugin API test helper — upstream rename of `test/helpers/plugins/plugin-api.ts` (registry EXCLUDE-GUT line 4180); imports `OpenClawPluginApi` with gutted methods (`registerProvider`, `registerSpeechProvider`, `registerMediaUnderstandingProvider`, `registerImageGenerationProvider`, `registerWebSearchProvider`, `registerMemoryPromptSection`). |
| 7   | `test/helpers/extensions/plugin-runtime-mock.ts`                   | EXCLUDE-GUT | tbd-confirmed               | upstream-only: plugin runtime mock helper — upstream rename of `test/helpers/plugins/plugin-runtime-mock.ts` (registry EXCLUDE-GUT line 4184); imports `DEFAULT_MODEL`/`DEFAULT_PROVIDER` (gutted), `runEmbeddedPiAgent` (Pi-era gutted), `mediaUnderstanding`/`imageGeneration`/`tts` (gutted subsystems).                                                            |
| 8   | `test/helpers/extensions/start-account-context.ts`                 | EXCLUDE-GUT | tbd-confirmed               | dead: account context helper — upstream rename of `test/helpers/plugins/start-account-context.ts` (registry EXCLUDE-GUT line 4195); upstream callers (`extensions/{discord,line,nextcloud-talk,nostr,telegram}/src/channel*.test.ts`) NOT in fork's cherry-pick scope.                                                                                                 |
| 9   | `test/scripts/test-find-thread-candidates.test.ts`                 | EXCLUDE-GUT | pattern + dir-rule          | upstream-only: test for thread-candidate scoring helper — covered semantically by `test/scripts/` EXCLUDE dir rule (line 776) but explicit file-level rule added to override broader `test/` INCLUDE rule (line 774) per `classify.py` first-match-wins among dir rules; fork has its own `scripts/test-find-thread-candidates.mjs`.                                   |

## The plugin-contract reclassification

Three new EXCLUDE-GUT entries against the cluster TSV's pattern-classified KEEP.

**Upstream content** (`src/channels/plugins/contracts/{inbound,outbound-payload,registry-backed}.contract.test.ts` @ `v2026.3.22`): three test files in the upstream `src/channels/plugins/contracts/` directory that exercise plugin contract suites. The directory contains 9 upstream files in total at `v2026.3.22`:

```text
src/channels/plugins/contracts/group-policy.contract.test.ts
src/channels/plugins/contracts/inbound-testkit.ts
src/channels/plugins/contracts/inbound.contract.test.ts          ← C8 cluster
src/channels/plugins/contracts/manifest.ts
src/channels/plugins/contracts/outbound-payload.contract.test.ts ← C8 cluster
src/channels/plugins/contracts/registry-backed.contract.test.ts  ← C8 cluster
src/channels/plugins/contracts/registry.contract.test.ts
src/channels/plugins/contracts/registry.ts
src/channels/plugins/contracts/suites.ts
```

**Fork architecture**: the fork does NOT have the `src/channels/plugins/contracts/` directory at all — it was never cherry-picked. Of upstream's 9 current sibling files, 3 are already EXCLUDE-GUT in the registry (lines 3010-3012 of `disposition.tsv`):

- `group-policy.contract.test.ts` — "dead: test for group policy contract — plugin system gutted"
- `inbound-testkit.ts` — "dead: inbound testkit — plugin system gutted"
- `manifest.ts` — "dead: contract manifest — plugin system gutted"

The registry also carries 2 historical entries for sibling files no longer in upstream's current `v2026.3.22` set (lines 3009 and 3013):

- `dm-policy.contract.test.ts` — "dead: test for DM policy contract — plugin system gutted"
- `plugins-core.contract.test.ts` — "dead: test for core plugin contract"

The remaining 6 files in upstream's current set (`inbound.contract.test.ts`, `outbound-payload.contract.test.ts`, `registry-backed.contract.test.ts`, `registry.contract.test.ts`, `registry.ts`, `suites.ts`) are NEW upstream additions (between fork-point and `v2026.3.22`). The audit flagged 3 of these 6 as cluster C8 paths — the remaining 3 (`registry.contract.test.ts`, `registry.ts`, `suites.ts`) are presumably scoped for a future audit run.

**Why cherry-pick is impractical**: the 3 contract tests in cluster C8 import from sibling files that themselves are EXCLUDE-GUT or absent in the fork:

```ts
// inbound.contract.test.ts upstream imports
import { withTempHome } from "../../../../test/helpers/temp-home.js";
import { inboundCtxCapture } from "./inbound-testkit.js"; // ./inbound-testkit.js → registry EXCLUDE-GUT (line 3011)
import { expectChannelInboundContextContract } from "./suites.js"; // ./suites.js → missing in fork

// outbound-payload.contract.test.ts upstream imports
import { discordOutbound } from "../../../../extensions/discord/src/outbound-adapter.js"; // missing in fork
import { whatsappOutbound } from "../../../../extensions/whatsapp/src/outbound-adapter.js"; // missing in fork
import {
  installChannelOutboundPayloadContractSuite,
  primeChannelOutboundSendMock,
} from "./suites.js"; // ./suites.js → missing in fork

// registry-backed.contract.test.ts upstream imports
import { resetMatrixThreadBindingsForTests } from "../../../../extensions/matrix/api.js"; // missing in fork
import {
  installChannelPluginContractSuite,
  // 7 more contract-suite installers
} from "./suites.js"; // ./suites.js → missing in fork
import {
  pluginContractRegistry,
  // 7 more registries
} from "./registry.js"; // ./registry.js → missing in fork
```

Cherry-picking the 3 contract tests would require ALSO cherry-picking `inbound-testkit.ts` (registry-tagged dead), `suites.ts` (NEW), `registry.ts` (NEW), plus creating fork-side `extensions/{discord,whatsapp}/src/outbound-adapter.ts` and `extensions/matrix/api.ts` (none exist in fork). The fork's design routes channel I/O through different seams — the test infrastructure these contracts test is fundamentally fork-divergent.

**Live test-coverage check**: searched fork for any reference to `installChannelPluginContractSuite`, `expectChannelInboundContextContract`, or any other contract-suite installer/expectation function — zero matches. The fork's `test/fixtures/test-timings.unit.json:334` carries a stale historical reference to `src/channels/plugins/contracts/registry-backed.contract.test.ts` from before the v2026.3.22 sync (file's `generatedAt` field is `2026-03-23T05:11:36`, predating the audit window) — the file is autogenerated from test runs and the entry is residual data, not a live dependency.

**Disposition row added** for each file. Same family-rationale as the existing `dm-policy.contract.test.ts` / `group-policy.contract.test.ts` / etc.

## The `read-only-account-inspect.telegram.runtime.ts` reclassification

Cherry-pick rejected — sibling registry override.

**Upstream content** (`src/channels/read-only-account-inspect.telegram.runtime.ts` @ `v2026.3.22`): 12-line file that re-exports `inspectTelegramAccount` from `extensions/telegram/api.js` (the upstream barrel re-exports module). It's a module-loadable indirection target for the parent `read-only-account-inspect.ts` orchestrator (which dynamic-imports each `*.runtime.ts` per-channel).

**File family at upstream `v2026.3.22`**:

```text
src/channels/read-only-account-inspect.discord.runtime.ts
src/channels/read-only-account-inspect.slack.runtime.ts
src/channels/read-only-account-inspect.telegram.runtime.ts ← C8 cluster (rename from .telegram.ts)
src/channels/read-only-account-inspect.ts
```

**Fork architecture**: the fork has none of the `read-only-account-inspect.*` files. The registry already classifies the entire family as EXCLUDE-GUT (lines 3049-3052):

- `read-only-account-inspect.discord.runtime.ts` — "dead: Discord account inspect — references gutted plugin system"
- `read-only-account-inspect.slack.runtime.ts` — "dead: Slack account inspect — references gutted plugin system"
- `read-only-account-inspect.telegram.ts` — "dead: Telegram account inspect — references gutted plugin system"
- `read-only-account-inspect.ts` — "gutted: callers eliminated, stub deleted"

**Rename detection**: the upstream file `read-only-account-inspect.telegram.ts` (line 3051 of registry) was renamed by upstream to `read-only-account-inspect.telegram.runtime.ts` between fork-point and `v2026.3.22` (commit `f71f44576a "Status: lazy-load read-only account inspectors"` — 2026-03-15). The OLD-name registry entry still applies as a historical record; the NEW-name entry is added with the same rationale.

**Why cherry-pick is impractical**: even setting aside the family-gutted classification, the upstream file imports from `extensions/telegram/api.js` — a barrel re-export module that does NOT exist in the fork. Fork's `extensions/telegram/` has only `index.ts`, `package.json`, `remoteclaw.plugin.json`, and `src/`. Cherry-picking would require either creating the barrel (~15 re-exports) or rewriting the import to `extensions/telegram/src/account-inspect.js` directly. The fork already exports `inspectTelegramAccount` via `src/plugin-sdk/telegram.ts:38` and `src/plugin-sdk/index.ts:718` — there is no fork need for this indirection module.

**Live caller check**: searched fork for any reference to `read-only-account-inspect`, `inspectReadOnlyChannelAccount`, or `loadTelegramInspectModule` — zero matches in `src/`, `extensions/`, or `test/`.

## The `legacy.migrations.part-2.ts` reclassification

Cherry-pick rejected — sibling registry override + structural divergence.

**Upstream content** (`src/config/legacy.migrations.part-2.ts` @ `v2026.3.22`): 426-line file containing 4 legacy config migrations:

1. `agent.model-config-v2` — Migrate legacy `agent.model`/`allowedModels`/`modelAliases`/`modelFallbacks`/`imageModelFallbacks` to `agent.models` + model lists.
2. `routing.agents-v2` — Move `routing.agents`/`defaultAgentId` to `agents.list`.
3. `routing.config-v2` — Move `routing.bindings`/`groupChat`/`queue`/`agentToAgent`/`transcribeAudio`.
4. `audio.transcription-v2` — Move `audio.transcription` to `tools.media.audio.models`.

The upstream file is part of an upstream split where `legacy.migrations.ts` was decomposed into 3 parts:

```text
src/config/legacy.migrations.part-1.ts ← registry EXCLUDE-GUT (line 215)
src/config/legacy.migrations.part-2.ts ← C8 cluster
src/config/legacy.migrations.part-3.ts ← registry EXCLUDE-GUT (line 216)
src/config/legacy.migrations.ts        ← upstream barrel: aggregates parts 1-3
```

**Fork architecture**: fork has a single 256-line `src/config/legacy.migrations.ts` (no part-N split) with fork-specific migrations: `strip-agent-default-field`, `strip-agents-defaults-embedded-pi`, `strip-thinking-level-fields`, `strip-agent-params-bags`, `telegram-require-mention`, `tts-enabled-to-auto`, `agent-model-to-agents-defaults`. None overlap with upstream's part-2 migrations.

**Why the upstream migrations are dead in fork**:

- `agent.model-config-v2` migrates TO `agent.models` (multi-model array). Fork uses `agents.defaults.model` (single-model — multi-model catalog is gutted per Middleware Boundary).
- `routing.agents-v2` and `routing.config-v2` use upstream's multi-agent routing config schema. Fork has different routing structure.
- `audio.transcription-v2` migrates TO `tools.media.audio.models` array. Fork has gutted media tools (no multi-model media transcription catalog).

**Symmetry argument**: parts 1 and 3 are already EXCLUDE-GUT with rationale "gutted: legacy config migration — dead platform config" — same justification applies to part-2.

**Live caller check**: searched fork for any reference to `legacy.migrations.part-2` or `LEGACY_CONFIG_MIGRATIONS_PART_2` — zero matches.

## The `test/scripts/test-find-thread-candidates.test.ts` explicit override

Pattern-classified EXCLUDE-GUT — but added as file-level rule to satisfy `classify.py`.

**Upstream content** (`test/scripts/test-find-thread-candidates.test.ts` @ `v2026.3.22`): test for the upstream `test-find-thread-candidates` script — a vitest-profile helper that reports test files with high mean duration and recommends thread isolation candidates.

**Issue body claim**: the file is "covered by `test/scripts/ EXCLUDE` dir rule" (line 776). Under a strict reading of disposition.tsv semantics this is correct. However, `classify.py` resolves directory rules by **first-match-wins** (per its module docstring), and the registry has an earlier `INCLUDE test/` rule at line 774 which matches first:

```text
INCLUDE       test/                  integration tests — alive, want upstream improvements
EXCLUDE       test/helpers/plugins/  gutted: plugin test helpers — dead after provider plugin removal
EXCLUDE       test/helpers/providers/ gutted: provider test helpers — dead after provider removal
EXCLUDE       test/scripts/          gutted: script tests — upstream CI infrastructure differs
```

Without an explicit file-level override, `classify.py` resolves `test/scripts/test-find-thread-candidates.test.ts` to INCLUDE (matched against `test/`), not EXCLUDE-GUT — making the bulk-audit residual non-zero.

The fork's existing convention (lines 4215-4225) is to add explicit file-level rules for `test/scripts/*.test.ts` files. The new entry follows this pattern with rationale "upstream-only: test for thread-candidate scoring helper — covered by test/scripts/ EXCLUDE dir rule (line 776) but explicit file-level rule needed to override broader test/ INCLUDE rule (line 774) per classify.py first-match-wins among dir rules; fork has its own scripts/test-find-thread-candidates.mjs".

**Fork has its own version**: fork has `scripts/test-find-thread-candidates.mjs` (the production script — fork-shared). The upstream test file would test that script, but fork's test infrastructure differs (covered by the existing `test/scripts/` EXCLUDE dir rule rationale "upstream CI infrastructure differs").

## Audit verification

Programmatic verification against `hq/upstream/disposition.tsv` (post-update) using `hq/scripts/classify.py`:

```text
=== STATUS BREAKDOWN ===
  A: 9
  D: 0
  M: 0

=== BUCKET COUNTS ===
  EXCLUDE: 9

=== ACTION COUNTS ===
  EXCLUDE-GUT: 9

=== COLLISIONS (A/D matching PROTECTED): 0 ===

=== UNKNOWNS: 0 ===
```

Per-path resolution:

| Path                                                               | Action      | Matched rule                                                       | Line |
| ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------ | ---- |
| `src/channels/plugins/contracts/inbound.contract.test.ts`          | EXCLUDE-GUT | `src/channels/plugins/contracts/inbound.contract.test.ts`          | 3013 |
| `src/channels/plugins/contracts/outbound-payload.contract.test.ts` | EXCLUDE-GUT | `src/channels/plugins/contracts/outbound-payload.contract.test.ts` | 3015 |
| `src/channels/plugins/contracts/registry-backed.contract.test.ts`  | EXCLUDE-GUT | `src/channels/plugins/contracts/registry-backed.contract.test.ts`  | 3017 |
| `src/channels/read-only-account-inspect.telegram.runtime.ts`       | EXCLUDE-GUT | `src/channels/read-only-account-inspect.telegram.runtime.ts`       | 3055 |
| `src/config/legacy.migrations.part-2.ts`                           | EXCLUDE-GUT | `src/config/legacy.migrations.part-2.ts`                           | 216  |
| `test/helpers/extensions/plugin-api.ts`                            | EXCLUDE-GUT | `test/helpers/extensions/plugin-api.ts`                            | 4168 |
| `test/helpers/extensions/plugin-runtime-mock.ts`                   | EXCLUDE-GUT | `test/helpers/extensions/plugin-runtime-mock.ts`                   | 4169 |
| `test/helpers/extensions/start-account-context.ts`                 | EXCLUDE-GUT | `test/helpers/extensions/start-account-context.ts`                 | 4170 |
| `test/scripts/test-find-thread-candidates.test.ts`                 | EXCLUDE-GUT | `test/scripts/test-find-thread-candidates.test.ts`                 | 4222 |

Bulk audit residual for Cat C cluster C8 against `v2026.3.22`: **0**.

No source code changes — registry-only update plus this precedent doc. No `pnpm check` / `pnpm test` impact: no fork files modified, no imports changed.

## Out of scope

- Other Cat C clusters: C1 (#2587 — closed, see PR #2599), C2 (#2588 — closed, see PR #2600), C3 (#2589 — closed, see PR #2601), C4 (#2590 — closed, see PR #2602), C5 (#2591 — closed, see PR #2603), C6 (#2592 — closed, see PR #2604), C7 (#2593 — closed, see PR #2605) — separate per-cluster issues.
- Cat A waves (#2582-#2585) — closed, see PRs #2595-#2598.
- Cat B (#2577) — closed, see PR #2586.
- B11 sync batch (`v2026.3.22 → v2026.4.19-beta.2`) — scheduled after Cat A/B/C close.
- Future upstream additions to `src/channels/plugins/contracts/` (`registry.contract.test.ts`, `registry.ts`, `suites.ts` — present at `v2026.3.22` but not flagged in this cluster's audit) — will be caught by the next audit run; classification expected to follow the same family-gutted disposition unless plugin contract testing is revived in fork.
- Fork-owned contract testing infrastructure — would need its own work item if test coverage of plugin-contract semantics is judged material; fork's current strategy is to test channel behavior at the channel-adapter level, not via contract suites.
