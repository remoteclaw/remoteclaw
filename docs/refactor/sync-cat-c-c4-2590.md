---
title: "Sync Cat C cluster C4 — extensions/line/src/ Structural-Restructure Disposition (#2590)"
description: "Per-file disposition for 12 upstream extensions/line/src/ files in Cat C cluster C4 — all 12 EXTRACT. Cluster TSV's pattern-classification (KEEP, channel adapter INCLUDE rule) was overridden after per-file inspection: upstream restructured LINE bot/webhook code from src/line/ to extensions/line/src/, but fork retains the pre-restructure src/line/ layout under a PROTECTED rule. Equivalent functionality lives in fork's src/line/ tree; for group-policy.test.ts, the helper resolveLineGroupRequireMention lives at src/channels/plugins/group-mentions.ts (centralized)."
read_when:
  - Reviewing or closing #2590 (Cat C cluster C4 sync of v2026.3.22)
  - Triaging future upstream extensions/line/src/ additions and considering whether to migrate fork to extensions/line/src/ layout
  - Cross-referencing per-cluster registry-sync precedent for the v2026.3.22 backlog
  - Looking up why a LINE-related upstream file was not cherry-picked despite the channel-adapter INCLUDE dir rule
---

# Sync Cat C cluster C4 — `extensions/line/src/` Structural-Restructure Disposition (#2590)

**Issue**: #2590 — Process Cat C cluster C4 (extensions/line/src/, 12 files) — cherry-pick (LINE bot/webhook code)
**Parent**: #2578 (Cat C decomposition)
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-26

## Summary

All 12 upstream files in Cat C cluster C4 (`extensions/line/src/` — LINE bot/webhook code at upstream's post-restructure layout) are dispositioned **EXTRACT** — none are cherry-picked into the fork.

The cluster TSV's initial pattern-classification ("Cherry-pick (12 KEEP, single feature)" via the `extensions/line/ INCLUDE` directory rule, line 4287 of `disposition.tsv`) was overridden after per-file inspection revealed an upstream **structural restructure** that the fork has not adopted:

- **Upstream v2026.3.22**: LINE plugin's bot/webhook implementation lives in `extensions/line/src/`. Verified via `git show v2026.3.22:extensions/line/src/` — 30+ files including all 12 target files. Imports use fine-grained plugin-sdk submodules (`openclaw/plugin-sdk/{config-runtime,reply-history,runtime-env,infra-runtime,text-runtime,channel-reply-pipeline,channel-pairing,channel-inbound,routing,conversation-runtime,webhook-ingress,reply-runtime,allow-from,group-access,command-auth,runtime}`).
- **Upstream pre-restructure** (historical): LINE bot/webhook code lived in `src/line/`. Refactor commits between v2026.3.13-1 and v2026.3.22 (e.g., `2131981230 refactor(plugins): move remaining channel and provider ownership out of src`, `1aae93b1fa LINE: remove shared group mentions helper`, `de503dbcbb refactor: move setup fallback into setup registry`) moved files from `src/line/` to `extensions/line/src/`.
- **Fork**: Retains the pre-restructure layout. `src/line/` is the canonical home for LINE implementation in fork — registry rule line 63 of `disposition.tsv`: `PROTECTED src/line/ fork-only: LINE Messaging API bot (not in upstream)`. Fork's `extensions/line/` is thin (channel registration, runtime injection, card-command dispatch); the bot/webhook surface lives in `src/line/`.

12 new EXTRACT rows added to `hq/upstream/disposition.tsv` (registry lines 4579-4590, sibling-of-repo, not in git). Each row pinpoints the equivalent fork location.

## Per-file disposition

| #   | Path                                         | Disposition | Source                      | Fork equivalent                                                                                                                                            |
| --- | -------------------------------------------- | ----------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `extensions/line/src/bot-access.ts`          | EXTRACT     | per-file inspection (#2590) | `src/line/bot-access.ts` (existing fork file, divergent imports + API names)                                                                               |
| 2   | `extensions/line/src/bot-handlers.ts`        | EXTRACT     | per-file inspection (#2590) | `src/line/bot-handlers.ts`                                                                                                                                 |
| 3   | `extensions/line/src/bot-message-context.ts` | EXTRACT     | per-file inspection (#2590) | `src/line/bot-message-context.ts`                                                                                                                          |
| 4   | `extensions/line/src/bot.ts`                 | EXTRACT     | per-file inspection (#2590) | `src/line/bot.ts`                                                                                                                                          |
| 5   | `extensions/line/src/download.test.ts`       | EXTRACT     | per-file inspection (#2590) | `src/line/download.test.ts` (paired with `src/line/download.ts`)                                                                                           |
| 6   | `extensions/line/src/group-policy.test.ts`   | EXTRACT     | per-file inspection (#2590) | tests `resolveLineGroupRequireMention` — fork's helper at `src/channels/plugins/group-mentions.ts:328` (centralized); per-channel test coverage not ported |
| 7   | `extensions/line/src/monitor.ts`             | EXTRACT     | per-file inspection (#2590) | `src/line/monitor.ts`                                                                                                                                      |
| 8   | `extensions/line/src/probe.test.ts`          | EXTRACT     | per-file inspection (#2590) | `src/line/probe.test.ts`                                                                                                                                   |
| 9   | `extensions/line/src/probe.ts`               | EXTRACT     | per-file inspection (#2590) | `src/line/probe.ts`                                                                                                                                        |
| 10  | `extensions/line/src/send.ts`                | EXTRACT     | per-file inspection (#2590) | `src/line/send.ts`                                                                                                                                         |
| 11  | `extensions/line/src/webhook.test.ts`        | EXTRACT     | per-file inspection (#2590) | `src/line/webhook.test.ts`                                                                                                                                 |
| 12  | `extensions/line/src/webhook.ts`             | EXTRACT     | per-file inspection (#2590) | `src/line/webhook.ts` (paired with `src/line/webhook-utils.ts` — fork-only)                                                                                |

All 12 entries map to file-level rows in `hq/upstream/disposition.tsv`. The 12 new rows are appended at the end of the registry (lines 4579-4590) alongside the prior Cat C C2/C3 wave additions.

## Disposition class breakdown

The 12 EXTRACT verdicts partition into two classes:

| Divergence class                                        | Files | Member files                                                                                                                                                                      | Fork equivalent location                                                                                               |
| ------------------------------------------------------- | ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Structural restructure (path move src/ → extensions/)   |    11 | `bot-access.ts`, `bot-handlers.ts`, `bot-message-context.ts`, `bot.ts`, `download.test.ts`, `monitor.ts`, `probe.test.ts`, `probe.ts`, `send.ts`, `webhook.test.ts`, `webhook.ts` | `src/line/{file}` — fork's PROTECTED dir for LINE plugin internals                                                     |
| Centralization divergence (per-channel → cross-channel) |     1 | `group-policy.test.ts`                                                                                                                                                            | `resolveLineGroupRequireMention` lives at `src/channels/plugins/group-mentions.ts` (centralized for all chat channels) |

Total: 11 + 1 = 12.

## Why EXTRACT (and not KEEP / EXCLUDE-GUT)

The cluster TSV's heuristic flagged these 12 paths as KEEP because:

1. The `extensions/line/` directory rule is `INCLUDE channel adapter — upstream LINE fixes` (line 4287).
2. None of the 12 paths had specific file-level rules (so they fell through to the dir rule → KEEP/INCLUDE).
3. The registry's many `EXCLUDE-GUT` rows for `extensions/line/src/*` (lines 1513-1541, "outside v0.1.0 scope") date from an earlier gut wave and predate the file-level vs dir-rule classification reasoning.

Per-file inspection clears the heuristic:

1. **The fork already has functional equivalents** of all 12 files. `src/line/bot-access.ts`, `src/line/bot.ts`, etc. exist on fork's `main` branch and have been the canonical LINE implementation since fork inception. Upstream's restructure (moving src/line/ → extensions/line/src/) created a path-collision pattern the heuristic could not detect.

2. **Cherry-picking would create duplicates**, not additions. With both `src/line/bot.ts` and `extensions/line/src/bot.ts` present, two implementations of `createLineBot()` would coexist, register with the LINE plugin, and conflict at runtime. The fork's `extensions/line/index.ts` registers `linePlugin` from `./src/channel.js` and wires `setLineRuntime` from `./src/runtime.js`; cherry-picked `extensions/line/src/bot.ts` would have no caller and would shadow the live implementation in `src/line/`.

3. **Cherry-picking would not even compile**. Upstream's `extensions/line/src/bot.ts` imports from `openclaw/plugin-sdk/config-runtime`, `openclaw/plugin-sdk/reply-history`, `openclaw/plugin-sdk/runtime-env` — submodules that exist in upstream's plugin-sdk but **not in fork's plugin-sdk** (verified: fork's `src/plugin-sdk/` contains `compat.ts`, `line.ts`, `runtime.ts`, `allow-from.ts`, `command-auth.ts`, `group-access.ts`, but **no** `config-runtime.ts`, `reply-history.ts`, `runtime-env.ts`, `infra-runtime.ts`, `text-runtime.ts`, `channel-reply-pipeline.ts`, `channel-pairing.ts`, `channel-inbound.ts`, `routing.ts`, `conversation-runtime.ts`, `webhook-ingress.ts`, `reply-runtime.ts`). Fork's plugin-sdk consolidated these into `index.ts` re-exports plus `compat.ts` (`export * from "./index.js"`). Naive rebrand (`openclaw → remoteclaw`) would produce broken imports.

4. **Cherry-picking would not even resolve sibling imports**. Upstream's `extensions/line/src/bot.ts` imports `./accounts.js`, `./types.js`, `./bot-handlers.js`, `./bot-message-context.js`, `./webhook.js`. Of these, only `./bot-handlers.js`, `./bot-message-context.js`, `./webhook.js` are in C4's scope; `./accounts.js` and `./types.js` are explicitly EXCLUDE-GUT in `disposition.tsv` (lines 1515, 1540) — sibling imports would dangle.

5. **EXCLUDE-GUT is the wrong semantic**. The 12 upstream paths are NOT "deleted from fork, must stay deleted" (the EXCLUDE-GUT contract). They are paths where fork has a divergent variant at a different location with different imports. The EXTRACT semantic — "fork has a divergent variant; future ports must reconcile against the upstream version" — fits exactly. (See the `extensions/discord/src/monitor/listeners.ts`, `extensions/telegram/src/bot-handlers.ts`, `extensions/feishu/src/bot.ts` precedents for EXTRACT on per-channel divergence.)

## Group-policy centralization (the 1 non-restructure case)

`extensions/line/src/group-policy.test.ts` is the only C4 path that does not map 1-to-1 to a `src/line/{file}` equivalent. The function it tests, `resolveLineGroupRequireMention`, lives in fork at `src/channels/plugins/group-mentions.ts:328`:

```ts
// src/channels/plugins/group-mentions.ts
export function resolveLineGroupRequireMention(params: GroupMentionParams): boolean {
  const exactGroupId = resolveExactLineGroupConfigKey({
    cfg: params.cfg,
    accountId: params.accountId,
    groupId: params.groupId,
  });
  if (exactGroupId) {
    return resolveChannelGroupRequireMention({
      cfg: params.cfg,
      channel: "line",
      groupId: exactGroupId,
      accountId: params.accountId,
    });
  }
  return resolveChannelRequireMention(params, "line");
}
```

The fork centralized per-channel group-mention resolvers under `src/channels/plugins/group-mentions.ts` for cross-channel reuse (used by Discord, Telegram, Slack, etc.); upstream keeps per-channel modules. The function name and semantics match upstream's `extensions/line/src/group-policy.ts:resolveLineGroupRequireMention`, but the test file's per-channel layout does not fit the fork's centralized structure. Test coverage for the centralized helper has not been ported (separate work item, not in C4 scope).

## Out of scope

- Other Cat C clusters: C1 (#2587 — closed, see PR #2599), C2 (#2588 — closed, see PR #2600), C3 (#2589 — closed, see PR #2601), C5 (#2591), C6 (#2592), C7 (#2593), C8 (#2594) — separate per-cluster issues.
- Cat A waves (#2582-#2585) — closed, see PRs #2595-#2598.
- Cat B (#2577) — closed, see PR #2586.
- B11 sync batch (`v2026.3.22 → v2026.4.19-beta.2`) — scheduled after Cat A/B/C close.
- **Adopting upstream's restructure** (moving fork's `src/line/*` → `extensions/line/src/*`) — would unblock cherry-picking the 12 paths in a future sync. Requires: (1) decomposing fork's plugin-sdk into upstream's submodule layout (`config-runtime`, `reply-history`, etc.) or providing alias re-exports, (2) reconciling the 11 fork-divergent files with their upstream counterparts (different function names, different import structure), (3) porting test files. **Separate refactor, not in scope here.**
- **Porting per-channel test coverage for `resolveLineGroupRequireMention`** to `src/channels/plugins/group-mentions.test.ts` (currently absent in fork) — separate work item.

## Audit verification

Programmatic verification against `hq/upstream/disposition.tsv` (post-update) using `hq/scripts/classify.py`:

- **Total expected**: 12
- **Found**: 12/12 → EXTRACT (action) / EXTRACT (bucket)
- **Missing**: 0/12
- **New rows added**: 12/12 (registry lines 4579-4590)
- **UNKNOWNS**: 0
- **COLLISIONS** (PROTECTED dir vs file-level overlay): 0

Bulk audit residual for Cat C cluster C4 against `v2026.3.22`: **0**.
