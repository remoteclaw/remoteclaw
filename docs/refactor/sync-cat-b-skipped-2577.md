---
title: "Sync Cat B — Skipped Test Disposition (#2577)"
description: "Per-test disposition for 12 upstream Cat B tests skipped — source modules and plugin-SDK subpaths missing on fork. Cat B is structurally Cat C."
read_when:
  - Reviewing or closing #2577 (Cat B sync of v2026.3.22)
  - Planning companion source-module ports for channel extensions
  - Triaging plugin-SDK subpath gaps surfaced by the v2026.3.22 sync
  - Looking up precedent for skipping tests-only cherry-picks when source modules are absent
---

# Sync Cat B — Skipped Test Disposition (#2577)

**Issue**: #2577 — Process pending-sync-review Cat B
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-26

## Summary

Per the issue body's skip-clause ("document an explicit reason for skip if upstream's test depends on something the fork doesn't have"), all 12 upstream test files originally categorized as Cat B are **skipped** with the dispositions below.

Investigation revealed a category misclassification: Cat B was originally framed as a mechanical cherry-pick on the assumption that the channel-move PRs (#2565-#2570) would have brought in matching source modules. They did not. PR #2570 (whatsapp rectify) had already explicitly dropped 11 of 12 candidate whatsapp tests for the same root cause: source modules and SDK subpaths missing from the fork.

**Cat B is structurally Cat C** (genuine upstream files outside extension-test scope, requiring source ports first). The 12 paths cannot be cherry-picked as tests-only; they require companion source-module ports that depend on `openclaw/plugin-sdk/*` subpath modules the fork has not adopted.

## Per-test disposition

Each row records: the upstream test, the source module(s) it imports, whether those exist on fork, and the explicit skip reason.

| #   | Upstream Test                                       | Imports From                                                                                                             | Skip Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `extensions/discord/src/group-policy.test.ts`       | `./group-policy.js` (`resolveDiscordGroupRequireMention`, `resolveDiscordGroupToolPolicy`)                               | Source module `extensions/discord/src/group-policy.ts` does not exist on fork. Functions live inline in `extensions/discord/src/channel.ts`. Upstream's source also depends on `openclaw/plugin-sdk/{channel-contract,channel-policy,core}` — `channel-contract` and `channel-policy` subpath modules do not exist in the fork's `src/plugin-sdk/`.                                                                                                                                                                                                                                                                       |
| 2   | `extensions/imessage/src/group-policy.test.ts`      | `./group-policy.js`                                                                                                      | Source module `extensions/imessage/src/group-policy.ts` does not exist on fork. Same SDK subpath gap as #1 likely applies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3   | `extensions/imessage/src/setup-allow-from.test.ts`  | `./setup-surface.js` (`parseIMessageAllowFromEntries`)                                                                   | Source module `extensions/imessage/src/setup-surface.ts` does not exist on fork. Symbol `parseIMessageAllowFromEntries` not found anywhere in fork.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 4   | `extensions/signal/src/setup-allow-from.test.ts`    | `./setup-core.js` (`normalizeSignalAccountInput`, `parseSignalAllowFromEntries`)                                         | Source module `extensions/signal/src/setup-core.ts` does not exist on fork. Symbols not found anywhere in fork.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5   | `extensions/telegram/src/button-types.test.ts`      | `./button-types.js` (`buildTelegramInteractiveButtons`, `resolveTelegramInlineButtons`)                                  | Fork's `extensions/telegram/src/button-types.ts` exposes only TYPE declarations (no functions). Upstream's source defines the functions and depends on `openclaw/plugin-sdk/interactive-runtime` — that subpath module does not exist in the fork.                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | `extensions/telegram/src/group-policy.test.ts`      | `./group-policy.js`                                                                                                      | Source module `extensions/telegram/src/group-policy.ts` does not exist on fork. Same SDK subpath gap as #1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 7   | `extensions/telegram/src/normalize.test.ts`         | `./normalize.js` (`looksLikeTelegramTargetId`, `normalizeTelegramMessagingTarget`)                                       | Source module `extensions/telegram/src/normalize.ts` does not exist on fork. Functions live inline in `extensions/telegram/src/channel.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 8   | `extensions/telegram/src/setup-core.test.ts`        | `./setup-core.js` (`resolveTelegramAllowFromEntries`)                                                                    | Source module `extensions/telegram/src/setup-core.ts` does not exist on fork. Function lives inline in `extensions/telegram/src/channel.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 9   | `extensions/telegram/src/status-issues.test.ts`     | `./status-issues.js` (`collectTelegramStatusIssues`) + `openclaw/plugin-sdk/channel-contract` (`ChannelAccountSnapshot`) | Source module `extensions/telegram/src/status-issues.ts` does not exist on fork. Function lives inline in `channel.ts`. Plus the SDK subpath `channel-contract` is also missing.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 10  | `extensions/whatsapp/src/channel.directory.test.ts` | `./runtime-api.js` (`OpenClawConfig`) + `test/helpers/extensions/directory.ts` + `./channel.js`                          | Source module `extensions/whatsapp/src/runtime-api.ts` does not exist on fork. Already explicitly dropped in PR #2570 with this exact reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 11  | `extensions/whatsapp/src/group-policy.test.ts`      | `./group-policy.js`                                                                                                      | Source module `extensions/whatsapp/src/group-policy.ts` does not exist on fork. Same SDK subpath gap as #1.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 12  | `extensions/whatsapp/src/setup-surface.test.ts`     | `./channel.js` + `./login.js` + `./accounts.js` + `src/utils.js` + `test/helpers/extensions/setup-wizard.js`             | All direct source modules exist on fork, BUT the helper `test/helpers/extensions/setup-wizard.ts` has a pre-existing broken import: it imports `buildChannelSetupWizardAdapterFromSetupWizard` from `src/channels/plugins/setup-wizard.js`, which does not exist on fork. The helper is currently unused by any other test, so the broken state was latent. Pulling this test surfaces TS18046 errors (`'result' is of type 'unknown'`) downstream of TS2307 in the helper. Fixing the helper requires either porting the upstream source module or rewriting the helper without it — out of scope for a tests-only sync. |

## Plugin-SDK subpath gap

Upstream uses subpath imports from `openclaw/plugin-sdk/*`. The fork's `tsconfig.json` paths map the wildcard:

```jsonc
"paths": {
  "remoteclaw/plugin-sdk": ["./src/plugin-sdk/index.ts"],
  "remoteclaw/plugin-sdk/*": ["./src/plugin-sdk/*.ts"],
  "remoteclaw/plugin-sdk/account-id": ["./src/plugin-sdk/account-id.ts"]
}
```

The wildcard target files don't exist for the subpaths upstream uses:

| Upstream subpath                          | Fork file expected                      | Exists? |
| ----------------------------------------- | --------------------------------------- | ------- |
| `openclaw/plugin-sdk/channel-contract`    | `src/plugin-sdk/channel-contract.ts`    | ❌ No   |
| `openclaw/plugin-sdk/channel-policy`      | `src/plugin-sdk/channel-policy.ts`      | ❌ No   |
| `openclaw/plugin-sdk/core`                | `src/plugin-sdk/core.ts`                | ✅ Yes  |
| `openclaw/plugin-sdk/interactive-runtime` | `src/plugin-sdk/interactive-runtime.ts` | ❌ No   |

## Recommended follow-up

Cat B as defined in #2577 cannot close as a tests-only cherry-pick. Closing this issue requires one of:

1. **Re-classify and close**: Treat these 12 paths as part of Cat C (companion source-module ports). Close #2577 as superseded.
2. **Companion source ports**: Open a follow-up issue per channel (discord, imessage, signal, telegram, whatsapp) to port the upstream source-module extractions (`group-policy.ts`, `setup-core.ts`, `normalize.ts`, `status-issues.ts`, `runtime-api.ts`) AND the missing plugin-SDK subpath modules. Each would be its own scope.
3. **Latent helper repair**: Independently of test sync, repair `test/helpers/extensions/setup-wizard.ts` (pre-existing broken import since sync commit `0667aa5596`). This unblocks test #12 if its companion source ports are subsequently pulled.

The recommended path is **(1) + (2)** — record the misclassification finding in this document, close #2577, and let companion source-port work proceed under the Cat C umbrella with its own scoping.

## References

- Issue: #2577
- Channel-move PRs: #2565 (discord), #2566 (telegram), #2567 (slack), #2568 (signal), #2569 (imessage), #2570 (whatsapp)
- Upstream sync commit: `0667aa5596` (sync to v2026.3.22)
- PR #2570 commit message contains the prior precedent for the dropping reason "source files don't exist in fork"
