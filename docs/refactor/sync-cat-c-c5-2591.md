---
title: "Sync Cat C cluster C5 — extensions/{channel}/*.test.ts Channel-Test-Additions Disposition (#2591)"
description: "Per-file disposition for 28 upstream extensions/{channel}/*.test.ts files in Cat C cluster C5 — 1 KEEP (cherry-pick), 27 EXTRACT. Cluster TSV's pattern-classification (25 KEEP, channel adapter INCLUDE rule) was overridden after per-file inspection: upstream restructured channel registration with new abstractions (setup-core, setup-surface, setup-status, runtime-api, session-route, channel.{directory,security}, group-policy modules) that the fork has not adopted. Only extensions/googlechat/src/auth.test.ts cherry-picks cleanly because fork's auth.ts is byte-identical to upstream."
read_when:
  - Reviewing or closing #2591 (Cat C cluster C5 sync of v2026.3.22)
  - Triaging future upstream extensions/{channel}/setup-* or runtime-api additions and considering whether to migrate fork to upstream's setup-wizard layout
  - Cross-referencing per-cluster registry-sync precedent for the v2026.3.22 backlog
  - Looking up why a channel-test upstream file was not cherry-picked despite the channel-adapter INCLUDE dir rule
---

# Sync Cat C cluster C5 — `extensions/{channel}/*.test.ts` Channel-Test-Additions Disposition (#2591)

**Issue**: #2591 — Process Cat C cluster C5 (extensions/{channel}/\*.test.ts, 28 files) — cherry-pick (channel test additions)
**Parent**: #2578 (Cat C decomposition)
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-26

## Summary

Of the 28 upstream files in Cat C cluster C5 (channel test additions across 11 channels: googlechat, nextcloud-talk, tlon, synology-chat, mattermost, msteams, irc, feishu, nostr, device-pair, bluebubbles), **1 file is dispositioned KEEP and cherry-picked**, **27 files are dispositioned EXTRACT** — divergent from cluster TSV's initial pattern-classification (25 KEEP / 3 EXTRACT).

The cluster TSV's pattern-classification ("Cherry-pick (25 KEEP test additions, channel adapter INCLUDE dir rule line 4287)" plus 3 known EXTRACT registry-rules) was overridden for 22 of the 25 supposed-KEEP files after per-file inspection revealed an upstream **structural restructure** (the same divergence class that drove Cat C cluster C4's all-EXTRACT verdict, PR #2602):

- **Upstream v2026.3.22**: introduced new per-channel modules under each `extensions/{channel}/src/` for setup-wizard abstractions (`setup-core.ts`, `setup-surface.ts`, `setup-status.ts`), routing (`session-route.ts`, `channel.directory.ts`, `channel.security.ts`), policy helpers (`group-policy.ts`), test fixtures (`test-fixtures.ts`), and per-channel runtime API re-exports (`extensions/{channel}/runtime-api.ts` re-exporting from `openclaw/plugin-sdk/{submodule}`). The 28 test files in C5 exercise these new modules.
- **Fork**: retains the pre-restructure layout. Channels register via `extensions/{channel}/index.ts` and inject runtime via `setRuntime()` patterns; setup wizard logic lives in `onboarding.ts` (different abstraction). Runtime API is consumed via `remoteclaw/plugin-sdk/{channel}` (fork-renamed SDK), not via per-channel `runtime-api.ts` re-exports. Fork's `extensions/{channel}/src/` does not contain the new setup-core/surface/status modules.

22 new EXTRACT rows added to `hq/upstream/disposition.tsv` (sibling-of-repo, not in git). 2 supplementary EXTRACT rows added for divergence classes outside the structural-restructure pattern (fork-divergent type schema, divergent mock target). The 3 registry-confirmed EXTRACT entries (mattermost/index.test.ts registrationMode feature; synology-chat/src/{config-schema,session-key}.test.ts fork-absent helpers) carry forward unchanged. The 1 KEEP file (`extensions/googlechat/src/auth.test.ts`) is added directly to the fork.

## Per-file disposition

| #   | Path                                                  | Disposition | Source                      | Fork equivalent / Rationale                                                                                                                                                    |
| --- | ----------------------------------------------------- | ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `extensions/bluebubbles/src/group-policy.test.ts`     | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `extensions/bluebubbles/src/group-policy.ts`; equivalent helper not present (no fork test target)                                          |
| 2   | `extensions/device-pair/notify.test.ts`               | EXTRACT     | per-file inspection (#2591) | fork-divergent type schema: upstream test exercises `role`, `roles`, `scopes` fields on `PendingPairingRequest`; fork's type lacks these fields                                |
| 3   | `extensions/feishu/index.test.ts`                     | EXTRACT     | per-file inspection (#2591) | structural restructure: imports `OpenClawPluginApi` from `./runtime-api.js`; fork has no `extensions/feishu/runtime-api.ts`                                                    |
| 4   | `extensions/feishu/src/setup-status.test.ts`          | EXTRACT     | per-file inspection (#2591) | structural restructure: imports `../runtime-api.js` and `./setup-status.js`; fork has neither (uses `onboarding.ts` pattern instead)                                           |
| 5   | `extensions/googlechat/src/auth.test.ts`              | **KEEP**    | per-file inspection (#2591) | clean cherry-pick: fork's `auth.ts` is byte-identical to upstream; test mocks only `google-auth-library` (npm dep), no fork-divergent imports                                  |
| 6   | `extensions/googlechat/src/channel.directory.test.ts` | EXTRACT     | per-file inspection (#2591) | structural restructure: imports `../runtime-api.js`; fork has no `extensions/googlechat/runtime-api.ts` and no `channel.directory.ts`                                          |
| 7   | `extensions/googlechat/src/channel.security.test.ts`  | EXTRACT     | per-file inspection (#2591) | structural restructure: imports `../runtime-api.js`; fork has no `runtime-api.ts` and no `channel.security.ts`                                                                 |
| 8   | `extensions/googlechat/src/group-policy.test.ts`      | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `extensions/googlechat/src/group-policy.ts`                                                                                                |
| 9   | `extensions/googlechat/src/setup-core.test.ts`        | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `setup-core.ts`; imports `DEFAULT_ACCOUNT_ID` from `openclaw/plugin-sdk/setup` (fork SDK lacks this submodule)                             |
| 10  | `extensions/googlechat/src/setup-surface.test.ts`     | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `setup-surface.ts` and no `runtime-api.ts`                                                                                                 |
| 11  | `extensions/irc/src/setup-core.test.ts`               | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `extensions/irc/src/setup-core.ts`                                                                                                         |
| 12  | `extensions/irc/src/setup-surface.test.ts`            | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `setup-surface.ts`                                                                                                                         |
| 13  | `extensions/mattermost/index.test.ts`                 | EXTRACT     | registry (already present)  | upstream `59bcac472e` adds `registrationMode:"setup-only"` feature across 14 plugin files; feature port is separate WI                                                         |
| 14  | `extensions/mattermost/src/setup-status.test.ts`      | EXTRACT     | per-file inspection (#2591) | structural restructure: imports `../runtime-api.js` and `./setup-surface.js`; fork has neither                                                                                 |
| 15  | `extensions/mattermost/src/setup-surface.test.ts`     | EXTRACT     | per-file inspection (#2591) | structural restructure: imports `../runtime-api.js` and `./setup-surface.js`; fork has neither                                                                                 |
| 16  | `extensions/msteams/src/session-route.test.ts`        | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `session-route.ts` (session routing handled differently)                                                                                   |
| 17  | `extensions/msteams/src/setup-core.test.ts`           | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `setup-core.ts`; imports from `openclaw/plugin-sdk/setup`                                                                                  |
| 18  | `extensions/nextcloud-talk/src/room-info.test.ts`     | EXTRACT     | per-file inspection (#2591) | divergent mock target: mocks `../runtime-api.js` for `fetchWithSsrFGuard`; fork imports the same symbol from `remoteclaw/plugin-sdk/nextcloud-talk` (mock would not intercept) |
| 19  | `extensions/nextcloud-talk/src/session-route.test.ts` | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `session-route.ts`                                                                                                                         |
| 20  | `extensions/nextcloud-talk/src/setup-core.test.ts`    | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `setup-core.ts`; imports `DEFAULT_ACCOUNT_ID` from `openclaw/plugin-sdk/routing`                                                           |
| 21  | `extensions/nextcloud-talk/src/setup-surface.test.ts` | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `setup-surface.ts`; imports `DEFAULT_ACCOUNT_ID` from `../../../src/routing/session-key.js`                                                |
| 22  | `extensions/nostr/src/setup-surface.test.ts`          | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `runtime-api.ts` and no `test-fixtures.ts`                                                                                                 |
| 23  | `extensions/synology-chat/src/config-schema.test.ts`  | EXTRACT     | registry (already present)  | fork synology-chat has no `config-schema.ts`; fork handles config differently                                                                                                  |
| 24  | `extensions/synology-chat/src/session-key.test.ts`    | EXTRACT     | registry (already present)  | fork synology-chat has no `session-key.ts`; fork-divergent                                                                                                                     |
| 25  | `extensions/synology-chat/src/setup-surface.test.ts`  | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `setup-surface.ts`                                                                                                                         |
| 26  | `extensions/tlon/src/channel.test.ts`                 | EXTRACT     | per-file inspection (#2591) | upstream-only API module: imports `OpenClawConfig` from `../api.js`; fork has no `extensions/tlon/api.ts` (fork uses `RemoteClawConfig` from SDK)                              |
| 27  | `extensions/tlon/src/setup-surface.test.ts`           | EXTRACT     | per-file inspection (#2591) | structural restructure: fork has no `setup-surface.ts`; imports `OpenClawConfig` from `../api.js` (fork-absent)                                                                |
| 28  | `extensions/tlon/src/types.test.ts`                   | EXTRACT     | per-file inspection (#2591) | upstream-only API module: imports `OpenClawConfig` from `../api.js`; fork has `types.ts` but uses `RemoteClawConfig` from `remoteclaw/plugin-sdk/tlon`                         |

24 of the 27 EXTRACT entries map to NEW file-level rows in `hq/upstream/disposition.tsv`. The 3 registry-confirmed entries (#13, #23, #24) carry forward unchanged. The 1 KEEP entry (#5) requires no registry change — it falls under the existing `extensions/` INCLUDE dir rule and is added as a regular cherry-pick.

## Disposition class breakdown

The 27 EXTRACT verdicts partition into five divergence classes:

| Divergence class                                        | Files | Member files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Why fork diverges                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural restructure (setup-wizard / channel modules) |    20 | bluebubbles `group-policy.test.ts`; feishu `index.test.ts`, `setup-status.test.ts`; googlechat `channel.directory.test.ts`, `channel.security.test.ts`, `group-policy.test.ts`, `setup-core.test.ts`, `setup-surface.test.ts`; irc `setup-core.test.ts`, `setup-surface.test.ts`; mattermost `setup-status.test.ts`, `setup-surface.test.ts`; msteams `session-route.test.ts`, `setup-core.test.ts`; nextcloud-talk `session-route.test.ts`, `setup-core.test.ts`, `setup-surface.test.ts`; nostr `setup-surface.test.ts`; synology-chat `setup-surface.test.ts`; tlon `setup-surface.test.ts` | Upstream introduced per-channel `setup-{core,surface,status}.ts`, `session-route.ts`, `runtime-api.ts`, `channel.{directory,security}.ts`, `group-policy.ts`, `test-fixtures.ts` modules; fork uses `onboarding.ts` + direct SDK consumption |
| Fork-divergent type schema                              |     1 | device-pair `notify.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Upstream's `PendingPairingRequest` type adds `role`, `roles`, `scopes` fields; fork's type does not include them                                                                                                                             |
| Divergent mock target                                   |     1 | nextcloud-talk `room-info.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Test mocks `../runtime-api.js` (fork-absent); fork imports `fetchWithSsrFGuard` from `remoteclaw/plugin-sdk/nextcloud-talk` — mock would not intercept                                                                                       |
| Upstream-only API module + type rename                  |     2 | tlon `channel.test.ts`, `types.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Tests import `OpenClawConfig` from `extensions/tlon/api.ts` (fork has no such module — fork's tests would import `RemoteClawConfig` from `remoteclaw/plugin-sdk/tlon`)                                                                       |
| Pre-existing feature-port deferral (registry-confirmed) |     3 | mattermost `index.test.ts`; synology-chat `config-schema.test.ts`, `session-key.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | mattermost: upstream `59bcac472e` adds `registrationMode:"setup-only"` feature across 14 plugin files (feature port = separate WI); synology-chat: fork has no `config-schema.ts` / `session-key.ts` (fork-divergent design)                 |

Total: 20 + 1 + 1 + 2 + 3 = 27.

## The 1 KEEP — `extensions/googlechat/src/auth.test.ts`

The single cherry-pickable test file in C5. Verified clean by:

1. **Test target identity**: `git diff v2026.3.22:extensions/googlechat/src/auth.ts extensions/googlechat/src/auth.ts` — empty (fork's `auth.ts` is byte-identical to upstream `v2026.3.22`).
2. **No fork-divergent imports**: test file imports only `vitest` and (via dynamic import) `./auth.js`; mocks only `google-auth-library` (npm dependency).
3. **No rebrand sensitivity**: `grep -i 'openclaw' auth.test.ts` — empty.
4. **Test execution**: `pnpm test:extensions extensions/googlechat/src/auth.test.ts` — 4 tests, 4 passed (covers `verifyGoogleChatRequest` for app-url tokens with Chat issuer, add-on tokens without principal binding, add-on tokens with matching principal, add-on tokens with mismatched principal).

Single upstream commit: `a47722de7e Integrations: tighten inbound callback and allowlist checks (#46787)`.

## Why EXTRACT (and not KEEP / EXCLUDE-GUT) for the 22 new structural-restructure entries

The cluster TSV's heuristic flagged these 22 paths as KEEP because:

1. The `extensions/` directory rule is `INCLUDE channel adapter extensions — alive, want upstream improvements` (line 4287 of `disposition.tsv`).
2. The 22 paths had no specific file-level rules (so they fell through to the dir rule → KEEP/INCLUDE).
3. Pattern-classification trusts that test files for already-present channels are mechanical KEEPs.

Per-file inspection clears the heuristic for these 22:

1. **The fork has the channel implementations**, but **not the new test targets**. `extensions/googlechat/src/setup-core.ts`, `extensions/feishu/src/setup-status.ts`, `extensions/mattermost/src/setup-surface.ts`, etc. — none exist in fork. Cherry-picking the test file would either (a) fail TypeScript compile (missing import target) or (b) test nothing useful (target absent).

2. **Cherry-picking would not even resolve plugin-sdk imports**. Several tests import `DEFAULT_ACCOUNT_ID` from `openclaw/plugin-sdk/setup` or `openclaw/plugin-sdk/routing` — submodules that exist in upstream's plugin-sdk but **not in fork's `src/plugin-sdk/`** (verified: fork's plugin-sdk consolidated submodules into `index.ts` re-exports plus `compat.ts`; fine-grained submodule paths absent — same finding as Cat C cluster C4 PR #2602).

3. **Cherry-picking with naive rebrand would not work**. `OpenClawConfig` → `RemoteClawConfig` rebrand is mechanical, but the import path divergence (`extensions/tlon/api.ts` does not exist in fork; fork tests import `RemoteClawConfig` from `remoteclaw/plugin-sdk/tlon`) requires reasoning about which fork module re-exports the equivalent symbol — beyond mechanical rebrand.

4. **Mock target divergence is invisible to grep**. `extensions/nextcloud-talk/src/room-info.test.ts` mocks `../runtime-api.js`. Fork's `room-info.ts` imports `fetchWithSsrFGuard` from `remoteclaw/plugin-sdk/nextcloud-talk`, not from `../runtime-api.js`. Cherry-picked test would silently bypass the mock and hit real network code, or fail at vitest's strict mock-path resolution. (See vitest docs: `vi.mock()` only intercepts modules actually imported into the test target's dependency graph.)

5. **EXCLUDE-GUT is the wrong semantic**. The 22 upstream paths are NOT "deleted from fork, must stay deleted" (the EXCLUDE-GUT contract). They are paths where fork has divergent test layouts at different abstractions (e.g., `extensions/{channel}/src/onboarding.ts` instead of `setup-core.ts`). The EXTRACT semantic — "fork has a divergent variant; future ports must reconcile against the upstream version" — fits exactly. Same precedent as C4 PR #2602.

## Why EXTRACT for the 2 non-structural-restructure entries

**`extensions/device-pair/notify.test.ts` (fork-divergent type schema)**: Upstream test asserts on `formatPendingRequests()` output containing `role=operator` and `scopes=operator.admin, operator.read`. Fork's `PendingPairingRequest` type defines `{requestId, deviceId, displayName?, platform?, remoteIp?, ts?}` — no `role`, `roles`, or `scopes` fields. Cherry-pick would fail TypeScript compile at the test fixture (`role: "operator"` not assignable to `PendingPairingRequest`). Fork's `formatPendingRequests` output also lacks role/scopes formatting (verified: fork's implementation only emits `name=`, `platform=`, `ip=`). The upstream test exercises features not present in fork. Future port would need to (1) extend fork's type with role/roles/scopes, (2) extend fork's formatter to emit role/scopes lines, (3) cherry-pick the test.

**`extensions/nextcloud-talk/src/room-info.test.ts` (divergent mock target)**: As described above — mock target `../runtime-api.js` does not match fork's import source (`remoteclaw/plugin-sdk/nextcloud-talk`). Future port would need to (1) replace the mock target with `remoteclaw/plugin-sdk/nextcloud-talk` (or whichever module re-exports `fetchWithSsrFGuard`), (2) cherry-pick the test.

## Out of scope

- Other Cat C clusters: C1 (#2587 — closed, see PR #2599), C2 (#2588 — closed, see PR #2600), C3 (#2589 — closed, see PR #2601), C4 (#2590 — closed, see PR #2602), C6 (#2592), C7 (#2593), C8 (#2594) — separate per-cluster issues.
- Cat A waves (#2582-#2585) — closed, see PRs #2595-#2598.
- Cat B (#2577) — closed, see PR #2586.
- B11 sync batch (`v2026.3.22 → v2026.4.19-beta.2`) — scheduled after Cat A/B/C close.
- **Adopting upstream's setup-wizard restructure** (introducing per-channel `setup-{core,surface,status}.ts`, `session-route.ts`, `runtime-api.ts` re-exports, `channel.{directory,security}.ts`, `group-policy.ts`, `test-fixtures.ts` modules) — would unblock cherry-picking the 20 structural-restructure test files in a future sync. Requires: (1) decomposing fork's plugin-sdk into upstream's submodule layout (`plugin-sdk/setup`, `plugin-sdk/routing`) or providing alias re-exports, (2) splitting fork's `onboarding.ts` into `setup-core.ts` + `setup-surface.ts` + `setup-status.ts` per upstream's pattern, (3) adding per-channel `runtime-api.ts` re-exports, (4) adapting fork channel registration to use the new modules, (5) reconciling fork-divergent functions, (6) porting the 20 test files. **Separate refactor, not in scope here.**
- **Porting the `registrationMode:"setup-only"` feature for mattermost** (the path #13 EXTRACT) — upstream `59bcac472e` adds the feature across 14 plugin files. Separate work item.
- **Porting synology-chat `config-schema.ts` and `session-key.ts` from upstream** — would unblock cherry-picking the 2 paired tests (#23, #24). Requires reconciling fork's divergent config handling. Separate work item.
- **Porting device-pair role/scopes feature** — would unblock cherry-picking `notify.test.ts` (#2). Requires extending fork's `PendingPairingRequest` type and formatter. Separate work item.
- **Adapting nextcloud-talk `room-info.test.ts` mock target to fork SDK path** — would allow cherry-picking the test. Trivial mechanical port. Separate work item or absorb into a future sync wave.
- **Adapting tlon `channel.test.ts` and `types.test.ts` to fork's `RemoteClawConfig` imports** — would allow cherry-picking the 2 tests. Trivial mechanical rebrand once the cherry-pick mechanics are settled (need to reason about whether to add a fork-side `extensions/tlon/api.ts` re-export to match upstream layout). Separate work item.

## Audit verification

Programmatic verification against `hq/upstream/disposition.tsv` (post-update) using `hq/scripts/classify.py`:

- **Total expected**: 28
- **KEEP found**: 1/1 (`extensions/googlechat/src/auth.test.ts`, falls under `extensions/` INCLUDE dir rule)
- **EXTRACT found**: 27/27 (24 new file-level rules + 3 registry-confirmed)
- **UNKNOWNS**: 0
- **COLLISIONS**: 0

Bulk audit residual for Cat C cluster C5 against `v2026.3.22`: **0**.

Test execution for the 1 KEEP entry: `pnpm test:extensions extensions/googlechat/src/auth.test.ts` — 4 tests, 4 passed (run-time 428ms).
