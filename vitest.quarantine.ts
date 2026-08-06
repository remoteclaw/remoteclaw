// CI test quarantine ledger — a DEBT LEDGER, not an escape hatch.
//
// Context (#2779): the `extensions/**` and `src/auto-reply/**` test suites exist
// but were run by NO CI job, so regressions in any channel adapter or the
// auto-reply path shipped green (this gap let #2775 ship broken). The fix wires
// two required lanes — `test-extensions` (vitest.extensions.config.ts) and
// `test-auto-reply` (vitest.auto-reply.config.ts) — into the `CI` rollup.
//
// Enabling those lanes surfaces a large volume of PRE-EXISTING failures that
// were previously masked. Fixing all of them is a separate, unbounded effort;
// blocking this coverage gate on that effort would leave the gate permanently
// red and un-mergeable. Instead, the currently-failing test FILES are listed
// here and excluded from their lane, so each lane is a REQUIRED, GREEN gate that
// still fails CI on any NEW breakage in every non-quarantined file (and on any
// newly-added test file).
//
// Semantics:
//   - Entries are exact repo-relative test-file paths, passed to the lane's
//     vitest `exclude`. A quarantined file does NOT run in CI.
//   - This is FILE-level quarantine: a passing test inside a quarantined file is
//     also skipped. That lost coverage is the debt tracked below.
//   - A quarantined file is already red, so excluding it loses no regression
//     signal; a broken test in any OTHER (non-quarantined or new) file still
//     fails CI. That is exactly the #2779 acceptance criteria.
//
// This list is the UPPER bound observed locally (Node 26 + dev env); the CI
// runner (Node 22, clean ubuntu, no creds/native deps) has a different failure
// set. The list is reconciled against actual CI output until the lanes are green.
//
// TO REMOVE AN ENTRY (the goal — shrink this list to zero over time):
//   1. Run the file: `pnpm exec vitest run --config vitest.extensions.config.ts <path>`
//      (or vitest.auto-reply.config.ts). Fix the underlying failure, OR, if it is
//      environment-dependent (creds/network/native deps), make it self-skip in CI
//      via the test's own guard rather than living here.
//   2. Delete the line. CI will run it on the next PR.
//
// Un-quarantining / per-file triage (real-regression vs env-dependent vs flaky)
// is tracked in: #2782
//
// DO NOT add entries without that tracking issue — this is a ledger, not a dumping ground.
// New product breakage must be FIXED, never quarantined to make a red PR go green.

/** Currently-failing test files under `extensions/**` (run by the `test-extensions` lane). */
export const EXTENSIONS_QUARANTINE: string[] = [
  // #2782 (groupB): 3 bluebubbles files stay, each out of this ledger-shrink's scope:
  // - account-resolve: asserts an `allowPrivateNetworkConfig` field that the fork-authored
  //   resolveBlueBubblesServerAccount (no parity at 27ae826f65) never emits and nothing consumes;
  //   whether that SSRF/private-network flag should exist is a product decision, not a test fix.
  // - attachments: fails to load — `Cannot find package 'remoteclaw/plugin-sdk/request-url'`. It IS a
  //   real product subpath (src/plugin-sdk/request-url.ts exists) merely missing from the
  //   vitest.config.ts resolve-alias mirror (needs `"request-url"` in pluginSdkSubpaths, like the
  //   zalouser temp-path precedent); a harness fix outside this PR's allowed file set.
  // - monitor-normalize: 2 fails want participant extraction from message-level `handles` /
  //   `participantHandles`; extractChatContext only reads `participants`, and `participantHandles`
  //   was never in the fork's history (feature-add, no parity) — separate source PR.
  "extensions/bluebubbles/src/account-resolve.test.ts",
  "extensions/bluebubbles/src/attachments.test.ts",
  "extensions/bluebubbles/src/monitor-normalize.test.ts",
  "extensions/discord/src/monitor.test.ts",
  "extensions/discord/src/monitor.tool-result.sends-status-replies-responseprefix.test.ts",
  "extensions/discord/src/monitor/auto-presence.test.ts",
  "extensions/discord/src/monitor/message-handler.preflight.test.ts",
  // #2998 (discord): message-handler.queue.test.ts is UN-quarantined; only the three
  // timeout-fallback-reply cases re-homed here stay out of CI.
  //
  // This entry previously claimed the queue file failed on exactly 3 cases. That was wrong:
  // it failed on 5, because message-handler.test-helpers.ts had a botched find-replace
  // (`// workerRunTimeoutMs: overrides?.// workerRunTimeoutMs,`) that never threaded
  // workerRunTimeoutMs into the handler params, so the worker timeout never fired and
  // runtime.error was called 0 times. Two cases failed on that harness bug alone —
  // "does not send the timeout fallback when a final reply already went out" and "does not
  // send the timeout fallback when final reply delivery is already in flight", both of which
  // assert runtime.error fires and the fallback is NOT sent. Repairing the helper dropped the
  // queue file from 5 failures to 3, and those two now pass and gate CI in place.
  //
  // The 3 that remain are re-homed into message-handler.timeout-fallback-reply.test.ts (the
  // #2953/#2970 focused-spec precedent, as with the #2968 dedup re-home to
  // message-handler.dedupe.test.ts):
  //   - "applies explicit inbound worker timeout to queued runs so stalled runs do not block
  //     the queue"
  //   - "waits for the timeout fallback reply before starting the next queued run"
  //   - "routes the timeout fallback to the created auto-thread target"
  // All three assert a user-facing "Discord inbound worker timed out." channel reply. The
  // timeout now fires and is observable (runtime.error), but onTimeout in inbound-worker.ts is
  // deliberately still log-only, pending a separate, ratification-pending maintainer decision
  // on whether that fallback reply should exist at all (#2998 — still open). Un-quarantine
  // when that decision lands.
  "extensions/discord/src/monitor/message-handler.timeout-fallback-reply.test.ts",
  "extensions/discord/src/monitor/native-command.commands-allowfrom.test.ts",
  "extensions/discord/src/voice-message.test.ts",
  // #2782 (feishu): monitor.reaction remains — needs a separate SOURCE change
  // (monitor.account.ts lacks receive-layer early-event dedup). send.reply-fallback.test.ts
  // un-quarantined in #2957 (thread-reply-fallback safety guard + Feishu error-diagnostics
  // wrap restored in send.ts). media.test.ts un-quarantined in #2969 (content-type→file_type
  // routing + download header metadata restored in media.ts).
  "extensions/feishu/src/monitor.reaction.test.ts",
  // #2782 (imessage): accounts + parse-notification un-quarantined via SOURCE fixes — accounts.ts
  // restores the createAccountListHelpers `implicitDefaultAccount` options + `defaultAccount`
  // resolution; parse-notification.ts restores stripImessageLengthPrefixedUtf8Text.
  // #2971 (imessage): deliver un-quarantined via SOURCE fix — send.ts now returns the post-
  // transform `sentText` alongside `messageId`, and deliver.ts remembers THAT (not the caller's
  // pre-transform text) post-send only, restoring the media-echo placeholder + the #47830
  // no-pre-send-full-text-remember contract.
  // The 1 below stays, needing out-of-scope work:
  // - inbound-processing: SECURITY-sensitive — the dmPolicy access-control + echo/self-chat
  //   detection ORDER diverged from upstream (fork does access-before-echo; tests expect
  //   echo/self-chat-before-access) AND `dmPolicy:"open"` with an empty allowlist blocks where the
  //   tests expect allow; reconciling touches shared src/security/dm-policy-shared authz — separate
  //   security-reviewed PR.
  "extensions/imessage/src/monitor/inbound-processing.test.ts",
  // #2782 (line): channel.sendPayload.test.ts — 8/12 pass; the 4 failures are a
  // SOURCE gap (not a test fix). channel.ts `sendPayload` has no LINE video-media
  // handling: `sendMediaMessages()` drops mediaKind/previewImageUrl/trackingId/
  // durationMs, and the quick-reply inline media loop always emits `type:"image"`
  // (never `type:"video"`) and never rejects video without previewImageUrl. That
  // is a media-path feature to implement + verify, not reverse-engineer from the
  // tests — separate PR.
  "extensions/line/src/channel.sendPayload.test.ts",
  // #2782 (matrix): 4 of 6 un-quarantined (channel.directory/allowlist/handler.body-for-agent
  // pass as-is on clean CI; format fixed test-side after restoring a dropped source guard — see
  // PR). The 2 below stay, each needing out-of-scope work:
  // - manifest: asserts matrix stages `fake-indexeddb` + opts into `bundle.stageRuntimeDependencies`.
  //   The fork re-architected matrix onto @vector-im/matrix-bot-sdk with filesystem crypto storage
  //   (no `indexedDB` usage anywhere; the idb-persistence files are orphaned), so the fake-indexeddb
  //   dep is stale upstream baggage. Whether matrix should opt into runtime-dep STAGING is a separate
  //   release-surface call complicated by its NATIVE dep (@matrix-org/matrix-sdk-crypto-nodejs) —
  //   unlike the pure-JS googlechat/policy precedents — so it needs a release-gated PR.
  // - matrix/monitor/index: asserts the full Pi-era monitor orchestration (thread-binding manager,
  //   inbound-event deduper, graceful stop-sync/drain-decryptions/wait-for-handlers shutdown,
  //   cold-start `dropPreStartupMessages` guard, account-aware text limit). The fork gutted all of
  //   it (index.ts references none of those symbols; 7 mocked modules no longer exist). Reconciling
  //   is a wholesale test rewrite over correctness-sensitive shutdown paths — separate PR.
  "extensions/matrix/src/manifest.test.ts",
  "extensions/matrix/src/matrix/monitor/index.test.ts",
  // #2782 (mattermost): channel-plugin-api + reply-delivery un-quarantined (test-side — retarget
  // the bundled-seam smoke test to channel-plugin-runtime.ts since the fork consolidated away
  // channel-plugin-api.ts/mattermostSetupPlugin; rebrand OPENCLAW_STATE_DIR→REMOTECLAW_STATE_DIR).
  // #2959 (mattermost): monitor-auth un-quarantined — the `accessGroup:Ops` lowercasing regression
  // is fixed at source (normalizeMattermostAllowEntry now carves access-group entries out of the
  // lowercasing branch, case-preserved), and the file's other two tests were retargeted from the
  // stale `./runtime-api.js` mock to the plugin-sdk barrel seam and de-drifted from `await`/async
  // to the sync `authorizeMattermostCommandInvocation` signature.
  // The 1 below stays, needing out-of-scope work:
  // - interactions: 2/47 assert an un-ported post-threading feature — forwarding the fetched `post`
  //   (with root_id) to resolveSessionKey (positional→object signature change), handleInteraction,
  //   and dispatchButtonClick for thread-scoped session keys; spans interactions.ts + monitor.ts
  //   session-key resolution — multi-file, separate PR.
  "extensions/mattermost/src/mattermost/interactions.test.ts",
  // #2782 (slack): monitor.tool-result un-quarantined (test-side: the ack-reaction test
  // needs statusReactions disabled to exercise the direct one-shot react path — status
  // reactions now supersede it when enabled; pairing assertion updated to the shared
  // fenced buildPairingReply format).
  // #2958 (slack): slash un-quarantined — its ctx-payload GroupSpace SOURCE regression is fixed
  // and the createReplyPrefixOptions mock gap closed, so 11 of its 32 tests now run in CI
  // (including the GroupSpace regression guard). The remaining arg-menu divergence is skipped
  // in-file via `describe.skip` with rationale (slash.test.ts) rather than darkening the whole
  // file here — narrower debt, still tracked by #2782.
  // #2962 (slack): send.identity-fallback un-quarantined — both SOURCE regressions are fixed in
  // send.ts (unfurl_links:false payload default + Slack Web API error enrichment at every throw
  // site). The feared blast radius did not materialize: the other send tests asserting postMessage
  // payloads (send.blocks, send.upload) use expect.objectContaining, which tolerates the added key.
  // #2954 (slack): client un-quarantined — the proxy-agent SOURCE regression is fixed in client.ts
  // (resolveSlackProxyAgent). The earlier note here claimed the required helpers "don't exist in
  // the fork"; that was wrong — resolveEnvHttpProxyUrl (src/infra/net/proxy-env.ts) and
  // resolveActiveManagedProxyTlsOptions (src/infra/net/proxy/managed-proxy-undici.ts) both exist,
  // and extensions already import that first module directly (discord rest-fetch, telegram fetch).
  // No plugin-sdk fetch-runtime subpath was needed. The file's whole proxy suite now runs in CI.
  // The 1 below stays, out of scope for a test-side un-quarantine (see PR for details):
  // - dispatch.preview-fallback: obsolete premise — dispatch.ts finalizes previews via inline
  //   chat.update now, not finalizeSlackPreviewEdit (which is dead code); the test needs a rewrite.
  "extensions/slack/src/monitor/message-handler/dispatch.preview-fallback.test.ts",
  // #2961 (telegram): 4 bot-message-context files un-quarantined via a SOURCE fix
  // (named-account-dm, silent-ingest, thread-binding, topic-agentid), plus 1 net-new
  // routing-policy test (bot-message-context.routing-policy.test.ts) added in the same PR —
  // never quarantined, so not one of the 4 "un-quarantined". The fix:
  // the inbound path now routes through resolveTelegramConversationRoute (the same full
  // resolver the native-command path uses) instead of the bare, policy-bypassing
  // resolveAgentRoute, so topic-agent override (A), session bindings (B), the
  // routing.unmatched drop policy (D) and the named-account group gate (C) apply to
  // ordinary inbound messages, and the mention-skip branch fires the ingest hook (E).
  // Each of those 4 ALSO needed its upstream mock paths repaired: they predate the
  // src/telegram/ -> extensions/telegram/src/ move, so `vi.mock("../config/config.js")`
  // & co. silently targeted non-existent modules and the mocks never applied.
  // The 5 below stay, each out of #2961's scope. dm-threads specifically: its 2 remaining
  // fails are session-key/route-echo SHAPE divergences, not routing-resolution bugs, and
  // each needs its own source change — (a) `uses thread session key for dm topics` wants the
  // DM thread key to embed the chat id (`agent:main:main:thread:1234:42`) but the fork
  // derives it from the thread id alone (`:thread:42`, resolveThreadSessionKeys); (b) `uses
  // topic session for forum groups` wants OriginatingTo to carry the topic suffix
  // (`telegram:<chat>:topic:99`) but bot-message-context.ts emits a bare `telegram:<chat>`.
  // Both have live outbound consumers, so they are a separate, reply-routing-reviewed PR.
  "extensions/telegram/src/bot-message-context.dm-threads.test.ts",
  "extensions/telegram/src/bot-message-context.group-body.test.ts",
  "extensions/telegram/src/bot-message-dispatch.test.ts",
  "extensions/telegram/src/format.wrap-md.test.ts",
  "extensions/telegram/src/sequential-key.test.ts",
  "extensions/whatsapp/src/auto-reply.broadcast-groups.combined.test.ts",
  "extensions/whatsapp/src/auto-reply/monitor/on-message.audio-preflight.test.ts",
  // #2782 (groupB): 2 zalo files stay, each out of this ledger-shrink's scope:
  // - monitor.webhook: test expects registerZaloWebhookTarget to auto-register a plugin HTTP route
  //   into registry.httpRoutes, but the fork only registers a route when opts.route is passed (API
  //   changed); the resulting un-cleaned target also flips the "400 for non-object payloads" test to
  //   401 (ambiguous-secret state leak). Webhook-ingress test rewrite — separate PR.
  // - token: `uses configured defaultAccount token` is a real fork regression (token.ts dropped
  //   `normalizeAccountId(accountId ?? config?.defaultAccount)`), but the file ALSO asserts that a
  //   symlinked token file is REJECTED by throw; the shared tryReadSecretFileSync swallows that
  //   rejection (returns undefined, never throws), so the file can't go green without a
  //   src/infra/secret-file.ts change outside this PR's file set.
  "extensions/zalo/src/monitor.webhook.test.ts",
  "extensions/zalo/src/token.test.ts",
  // #2782 (zalouser): channel.directory + security-audit un-quarantined (they passed once the
  // `temp-path` + `dangerous-name-runtime` plugin-sdk subpaths — imported by zalouser source via
  // the bare `remoteclaw/plugin-sdk/*` specifier — were added to the vitest.config.ts resolve-alias
  // mirror; a test-harness resolution gap, not a product-source change). The 3 below stay: each
  // needs a SOURCE change to the outbound / DM-routing / authz paths (see PR for details).
  // #2970 un-quarantined channel.sendpayload + channel.test: the outbound passthrough root they
  // pinned is FIXED — channel.ts now resolves textMode/textChunkMode/textChunkLimit and hands the
  // full text to send.ts once (outbound.chunker: null), so markdown is parsed before chunking.
  "extensions/zalouser/src/monitor.group-gating.test.ts", // #2782: (c) SECURITY FIXED in #2953 — processMessage now threads allowNameMatching into both enforcement-path buildZalouserGroupCandidates calls, so a mutable group NAME is only an allowlist candidate under dangerouslyAllowNameMatching; the paired asserts here pass, and the focused regression spec lives in monitor.group-name-matching.test.ts (un-quarantined, so it gates CI). (a) deliverZalouserReply outer-chunk + omitted textMode/chunk opts is FIXED in #2970 — the focused regression spec lives in monitor.deliver-reply.test.ts (un-quarantined, so it gates CI). File stays quarantined on 1 UNRELATED SOURCE regression — (b) open-policy non-command DMs are dropped before dispatch (resolveAgentRoute never reached), which also blocks this file's own long-markdown DM assert; out of #2953's and #2970's scope
];

/** Currently-failing test files under `src/auto-reply/**` (run by the `test-auto-reply` lane). */
export const AUTO_REPLY_QUARANTINE: string[] = [
  // #2782 (auto-reply batch): 10 of the original 19 are now un-quarantined (8 stale tests
  // fixed test-side; strip-inbound-meta + commands-core after fixing #2928/#2931). The 9
  // below remain — most reveal genuine SOURCE bugs (test synced ahead of source, or feature
  // gutted) that need a separate security-gated source PR, not a test-side change. Reasons
  // per line. inbound + commands-session-lifecycle had their named SOURCE bug fixed in the
  // #2927/#2930/#2932 PR but stay here on UNRELATED pre-existing fails (see per-line notes).
  "src/auto-reply/command-control.test.ts", // #2782: auth-UNIT tests vs fork-diverged command-auth.ts (#2824/#2828) — security-sensitive per-assertion reconciliation deferred to a focused PR
  "src/auto-reply/inbound.test.ts", // #2782: #2927+#2930 SOURCE bugs FIXED (paired asserts pass; focused specs live in mentions.test.ts + inbound-context.test.ts); file stays quarantined on UNRELATED pre-existing fails — normalizeMentionText rebrand-expectation test, provider-dock mention strip, resolveGroupRequireMention (groups.js) — out of the fix PR's 5-file scope
  "src/auto-reply/reply/commands-session-lifecycle.test.ts", // #2782: #2932 duration-label FIXED (Discord label asserts pass; focused spec in extensions/discord/src/monitor/thread-bindings.messages.test.ts); file stays quarantined on UNRELATED pre-existing fails — Telegram binding path + "unavailable outside discord/telegram" (commands-session.ts) — out of the fix PR's 5-file scope
  "src/auto-reply/reply/commands-subagents-focus.test.ts", // #2782: SOURCE gap — action-focus.ts/action-unfocus.ts lack the Matrix branch (un-ported D.4 EXTRACT; sibling action-agents.ts already has it)
  "src/auto-reply/reply/dispatch-from-config.test.ts", // #2782: 12 ACP-dispatch tests obsolete (ACP dispatch gutted in 4fd565bf89f) — belongs in a dedicated stale-test-deletion PR, not this ledger-shrink
  "src/auto-reply/reply/followup-runner.channel-bridge.test.ts", // #2782: premise gutted in #2377 (followup-runner is a no-op; ChannelBridge wiring moved to agent-runner-execution.ts) — port the assertions there
  "src/auto-reply/reply/reply-media-paths.test.ts", // #2782: not triaged (delegated agent aborted mid-run) — left quarantined pending investigation
  "src/auto-reply/reply/reply-plumbing.test.ts", // #2782: SOURCE bug — subagents-utils.ts formatRunLabel missing stripInternalRuntimeContext → internal runtime-context info leak into user-facing subagent labels
  // #2929: the named ACP SOURCE bug is FIXED — session.ts no longer stubs
  // resolveConversationIdFromTargets to ()=>undefined, so /new and /reset are suppressed only
  // for genuinely-bound ACP sessions. Its 6 ACP-reset specs were re-homed verbatim to
  // session.acp-reset.test.ts (un-quarantined, so that behavior gates CI) — the #2953/#2970
  // focused-spec re-homing precedent. This file stays quarantined on an UNRELATED cluster: 3
  // "internal channel routing preservation" cases ("lets direct webchat turns override persisted
  // external routes for per-channel-peer sessions", "does not reuse stale external lastTo for
  // webchat/main turns without destination", "prefers webchat route over persisted external route
  // for main session turns") assert that a webchat turn OVERRIDES a persisted external route,
  // which session-delivery.ts resolveLastChannelRaw/resolveLastToRaw deliberately refuse to do
  // per #47745 (overwriting the route delivers subagent completion events to the dashboard
  // instead of the originating channel). Which semantic wins is a delivery-routing product
  // decision, not a test fix — un-quarantine once it is settled.
  "src/auto-reply/reply/session.test.ts",
];
