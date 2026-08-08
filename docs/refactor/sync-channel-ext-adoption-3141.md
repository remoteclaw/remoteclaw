---
title: "Sync — 13 Un-Adopted Channel-Extension Sources (#3141)"
description: "Per-file disposition for the 13 channel-extension sources left un-adopted by the v2026.7.1-2 sync: 6 adopted, 4 deferred with a named missing dependency, 3 not reached."
read_when:
  - Reviewing or closing #3141
  - Re-syncing any of these 13 paths from upstream
  - Deciding whether a deferred file has become adoptable
  - Looking up precedent for partial per-commit adoption of a large upstream delta
---

# Sync — 13 Un-Adopted Channel-Extension Sources (#3141)

**Issue**: #3141 — 13 channel-extension sources left un-adopted by the v2026.7.1-2 sync
**Upstream range**: `v2026.6.11` → `v2026.7.1-2`
**Upstream reference**: the genuine `openclaw/openclaw` clone, **not** the `openclaw` remote inside
this fork (that ref is frozen at the fork point and yields a much larger, wrong delta)
**Date**: 2026-08-08

## Summary

Of the 13 files, **6 were adopted** (one of them partially), **4 are deferred** with a specific
named missing dependency, and **3 were not reached** in this pass.

The issue's framing — that each file was reclassified because it "depends on upstream
infrastructure this fork does not carry" — **did not survive re-checking**. Nine of the thirteen
deltas introduce **no new imports at all**; several were dropped by the sync machinery rather than
by a decision. Two of the apparent dependencies (`plugin-sdk/provider-http`,
`plugin-sdk/error-runtime`) turned out to be **repaths, not gaps**: the fork ships the same helpers
under different module paths.

This is not a security backlog. An independent security review of the batch found no declined
security fixes here; the content is feature work, message chunking, and refactors.

## Disposition legend

- **Adopted** — ported and merged, with upstream's corresponding test restored and passing.
- **Deferred** — genuinely not adoptable today; the row names the specific missing module/symbol.
- **Not reached** — _not_ blocked. Dependencies verified present; this pass simply ran out of
  budget before porting it. These are the cheapest follow-ups and should be taken first.

## Per-file disposition

| #   | File                        | Disposition     | Detail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | --------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `slack/send.ts`             | **Partial**     | Adopted `c2fc7aa28a4` (KeyedAsyncQueue consolidation): the fork already ships `plugin-sdk/keyed-async-queue`, and its `runQueuedSlackSend` pre-image was byte-identical to upstream's. The remaining ~+560 is **deferred** — see row 1b.                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1b  | `slack/send.ts` (remainder) | **Deferred**    | Missing module **`src/plugin-sdk/channel-outbound.ts`** and its `./plugin-sdk/channel-outbound` export subpath. The dominant commit `7e0d530e07d` (+480 of the +584) is `reconcileSlackUnknownSend`, built entirely on six symbols that have **0 occurrences** fork-wide: `createMessageReceiptFromOutboundResults`, `ChannelMessageUnknownSendContext`, `ChannelMessageUnknownSendReconciliationResult`, `MessageReceipt`, `MessageReceiptPartKind`, `MessageReceiptSourceResult`. Adopting requires porting the message-receipt / unknown-send-reconciliation subsystem first.                                                            |
| 2   | `slack/actions.ts`          | **Not reached** | No new imports. The change is a self-contained emoji-glyph→shortcode map plus skin-tone/variation-selector handling in `normalizeEmoji`, which **exists** in the fork at `actions.ts:62`. Nothing blocks this — it is the single cheapest remaining adoption.                                                                                                                                                                                                                                                                                                                                                                               |
| 3   | `slack/client.ts`           | **Deferred**    | Missing symbols **`getSlackWriteClient`** and the **`slackWriteClientCache`** LRU (0 occurrences fork-wide). Upstream's delta re-keys that cache by `slackApiUrl` to support alternate Web API roots, but the cache it modifies was never ported here — the fork's `client.ts` stops at `createSlackWriteClient`. There is also no fork consumer, so adding it would land an unwired export, the exact class deleted by #3140.                                                                                                                                                                                                              |
| 4   | `discord/send.guild.ts`     | **Deferred**    | Missing symbols **`getGuildVoiceState`** and **`isUnknownDiscordVoiceStateError`** (both 0 occurrences fork-wide). The delta wraps `getGuildVoiceState` in an unknown-voice-state fallback; the fork's `send.guild.ts` never routes through that helper, so the change has no landing site.                                                                                                                                                                                                                                                                                                                                                 |
| 5   | `discord/send.messages.ts`  | **Adopted**     | `8f31b3218f9` (assert Discord response shape, guarding raw-gzip bodies). Ported onto the fork's direct `rest.get` calls, since the fork has not adopted upstream's `listChannelMessages` / `searchGuildMessages` extraction. Upstream's two test cases added to `send.messages.test.ts`.                                                                                                                                                                                                                                                                                                                                                    |
| 6   | `clickclack/outbound.ts`    | **Deferred**    | Missing **third `options` parameter on `extensions/clickclack/src/http-client.ts`**. Upstream calls `createChannelMessage(channelId, text, { provenance, quotedMessageId })`, `createThreadReply(rootId, text, { provenance })` and `createDirectMessage(dm.id, text, { quotedMessageId })`; all three fork methods are 2-arity and accept neither field. `ClickClackMessageProvenance` _does_ exist (`types.ts:118`), but the client cannot carry it. Adopting requires porting `http-client.ts` first — which is outside this issue's 13-file set.                                                                                        |
| 7   | `clickclack/gateway.ts`     | **Adopted**     | Gateway hunk of `f3e3b6985b0`: a non-Error thrown in ws dispatch reached `reject()` bare. `formatErrorMessage` exists as `src/infra/errors.ts` — upstream's `plugin-sdk/error-runtime` is a repath, not a gap.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | `irc/client.ts`             | **Adopted**     | All four IRC fixes: 512-byte line limit (`takeIrcPrivmsgChunk`), UTF-16 surrogate-safe chunking, sequenced nick-collision fallback, and disconnect + connect-timeout cleanup. No new imports. Restores `client.surrogate.test.ts`. The fork's `"remoteclaw"` fallback-nick base is preserved.                                                                                                                                                                                                                                                                                                                                               |
| 9   | `imessage/client.ts`        | **Adopted**     | `6522dbf66b2` — route every stdio error through a single `finish()`. Restores `client.test.ts`, adapted for the fork's `readline`-based stdout reader (upstream buffers stdout by hand, so its bare-EventEmitter mock needed real streams here). **The port surfaced a live fork gap**: the readline `Interface` re-emits its input's `error`, and that re-emit was unguarded — so the gateway crash this upstream fix prevents was still reachable in the fork by a second path. Guarded.                                                                                                                                                  |
| 10  | `tlon/urbit/channel-ops.ts` | **Adopted**     | `8abd5d40712` + `19f5a4a0bb0` — bound the poke error body (16 KiB) and the scry JSON read. Upstream's `plugin-sdk/provider-http` is a **repath, not a gap**: `readProviderJsonResponse` lives at `src/agents/provider-http-errors.ts` and `readResponseTextLimited` at `src/plugin-sdk/response-text-limit.ts`, both with matching signatures and the same 16 MiB JSON ceiling. Restores `error-body-boundary.test.ts`; `channel-ops.test.ts` follows its source onto upstream's new error text.                                                                                                                                            |
| 11  | `whatsapp/inbound/media.ts` | **Deferred**    | Missing **`saveMediaStream`** (`plugin-sdk/media-store`), **`resolveInboundMediaMimetype`**, and the typed **`WhatsAppInboundMediaLimitExceededError`** — all 0 occurrences fork-wide. The delta stops swallowing download failures, but its error contract _is_ that typed limit error, which callers distinguish. The fork's file is a different implementation: it imports `@whiskeysockets/baileys` directly, resolves MIME locally via its own `resolveMediaMimetype`, and never streams through the media store. Removing the fork's `catch` without the typed-error contract would change caller behaviour rather than port the fix. |
| 12  | `line/channel.ts`           | **Not reached** | No blocking dependency: **`buildChannelOutboundSessionRoute` exists** (4 occurrences) and **`messaging-target.ts` exists** with both `normalizeLineMessagingTarget` and `inferLineTargetChatType`. Deferred only for size — this file carries the largest fork divergence of the set (~857 changed lines vs upstream base), so the `resolveOutboundSessionRoute` port needs its own pass.                                                                                                                                                                                                                                                   |
| 13  | `policy/cli.ts`             | **Not reached** | No blocking dependency: **`extensions/policy/src/doctor/fix-metadata.ts` exists** and exports `POLICY_FIX_METADATA_BY_CHECK_ID` (line 449), which is the only new import in the delta. Not yet wired into `cli.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Suggested order for the follow-up pass

Cheapest first, by verified-present dependencies:

1. `slack/actions.ts` — pure data + regex, `normalizeEmoji` already present.
2. `policy/cli.ts` — single import, target symbol already exported.
3. `line/channel.ts` — dependencies present, but large divergence; budget a full pass.

The four **deferred** rows each need a prerequisite port first
(`channel-outbound`, the Slack write-client cache, the Discord voice-state helpers, and the
ClickClack `http-client` options parameter). None should be re-litigated from scratch — re-check
only whether its named prerequisite has since landed.

## Method note

Two habits paid off and are worth repeating on the next sync of these paths:

- **Re-check the reclassification instead of inheriting it.** Nine of thirteen deltas introduce no
  new imports; two more resolved to repaths. Treating "was reclassified" as evidence of
  "is unadoptable" would have skipped every adoption in this table.
- **Split a large delta by commit, not by file.** `slack/send.ts` looked like a single
  +584/−50 blocker. Per-commit it is one genuinely blocked commit (+480) and five small ones, one
  of which was a clean, fully self-contained adoption.
