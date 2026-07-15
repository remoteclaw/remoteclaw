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
  "extensions/acpx/src/manifest.test.ts",
  "extensions/bluebubbles/src/account-resolve.test.ts",
  "extensions/bluebubbles/src/attachments.test.ts",
  "extensions/bluebubbles/src/monitor-normalize.test.ts",
  "extensions/diagnostics-otel/src/service.test.ts",
  "extensions/discord/src/accounts.test.ts",
  "extensions/discord/src/gateway-logging.test.ts",
  "extensions/discord/src/monitor.test.ts",
  "extensions/discord/src/monitor.tool-result.sends-status-replies-responseprefix.test.ts",
  "extensions/discord/src/monitor/auto-presence.test.ts",
  "extensions/discord/src/monitor/listeners.test.ts",
  "extensions/discord/src/monitor/message-handler.preflight.test.ts",
  "extensions/discord/src/monitor/message-handler.process.test.ts",
  "extensions/discord/src/monitor/message-handler.queue.test.ts",
  "extensions/discord/src/monitor/message-utils.test.ts",
  "extensions/discord/src/monitor/native-command.commands-allowfrom.test.ts",
  "extensions/discord/src/monitor/provider.proxy.test.ts",
  "extensions/discord/src/monitor/provider.rest-proxy.test.ts",
  "extensions/discord/src/monitor/thread-bindings.lifecycle.test.ts",
  "extensions/discord/src/monitor/threading.starter.test.ts",
  "extensions/discord/src/voice-message.test.ts",
  // #2782 (feishu): media/monitor.reaction/send.reply-fallback remain — each needs a
  // separate SOURCE change (see PR for un-quarantine of the other 6, which were stale
  // tests fixed test-side). media.ts dropped content-type→file_type routing + download
  // header metadata; monitor.account.ts lacks receive-layer early-event dedup; send.ts
  // lost the thread-reply-fallback safety guard + Feishu error-diagnostics wrap.
  "extensions/feishu/src/media.test.ts",
  "extensions/feishu/src/monitor.reaction.test.ts",
  "extensions/feishu/src/send.reply-fallback.test.ts",
  "extensions/googlechat/src/monitor.webhook-routing.test.ts",
  "extensions/imessage/src/accounts.test.ts",
  "extensions/imessage/src/monitor/deliver.test.ts",
  "extensions/imessage/src/monitor/inbound-processing.test.ts",
  "extensions/imessage/src/monitor/parse-notification.test.ts",
  "extensions/irc/src/send.test.ts",
  "extensions/line/src/channel.sendPayload.test.ts",
  "extensions/matrix/src/channel.directory.test.ts",
  "extensions/matrix/src/manifest.test.ts",
  "extensions/matrix/src/matrix/format.test.ts",
  "extensions/matrix/src/matrix/monitor/allowlist.test.ts",
  "extensions/matrix/src/matrix/monitor/handler.body-for-agent.test.ts",
  "extensions/matrix/src/matrix/monitor/index.test.ts",
  "extensions/mattermost/channel-plugin-api.test.ts",
  "extensions/mattermost/src/mattermost/interactions.test.ts",
  "extensions/mattermost/src/mattermost/monitor-auth.test.ts",
  "extensions/mattermost/src/mattermost/reply-delivery.test.ts",
  "extensions/msteams/src/attachments.test.ts",
  "extensions/msteams/src/attachments/shared.test.ts",
  "extensions/msteams/src/channel.directory.test.ts",
  "extensions/msteams/src/file-consent.test.ts",
  "extensions/msteams/src/monitor-handler.file-consent.test.ts",
  "extensions/msteams/src/monitor-handler/message-handler.authz.test.ts",
  "extensions/msteams/src/monitor-handler/message-handler.thread-session.test.ts",
  "extensions/msteams/src/probe.test.ts",
  "extensions/nextcloud-talk/src/channel.core.test.ts",
  "extensions/nextcloud-talk/src/monitor.replay.test.ts",
  "extensions/nextcloud-talk/src/room-info.test.ts",
  "extensions/nextcloud-talk/src/send.cfg-threading.test.ts",
  "extensions/nostr/src/channel.outbound.test.ts",
  "extensions/signal/src/accounts.test.ts",
  "extensions/signal/src/client.test.ts",
  "extensions/slack/src/client.test.ts",
  "extensions/slack/src/monitor.tool-result.test.ts",
  "extensions/slack/src/monitor/message-handler/dispatch.preview-fallback.test.ts",
  "extensions/slack/src/monitor/slash.test.ts",
  "extensions/slack/src/send.identity-fallback.test.ts",
  "extensions/synology-chat/src/channel.test.ts",
  "extensions/telegram/src/bot-message-context.audio-transcript.test.ts",
  "extensions/telegram/src/bot-message-context.body.test.ts",
  "extensions/telegram/src/bot-message-context.dm-threads.test.ts",
  "extensions/telegram/src/bot-message-context.group-body.test.ts",
  "extensions/telegram/src/bot-message-context.named-account-dm.test.ts",
  "extensions/telegram/src/bot-message-context.silent-ingest.test.ts",
  "extensions/telegram/src/bot-message-context.thread-binding.test.ts",
  "extensions/telegram/src/bot-message-context.topic-agentid.test.ts",
  "extensions/telegram/src/bot-message-dispatch.test.ts",
  "extensions/telegram/src/format.wrap-md.test.ts",
  "extensions/telegram/src/sequential-key.test.ts",
  "extensions/twitch/src/config.test.ts",
  "extensions/twitch/src/token.test.ts",
  "extensions/voice-call/src/manager.inbound-allowlist.test.ts",
  "extensions/voice-call/src/manager/events.test.ts",
  "extensions/voice-call/src/providers/plivo.test.ts",
  "extensions/voice-call/src/providers/telnyx.test.ts",
  "extensions/voice-call/src/providers/twilio.test.ts",
  "extensions/voice-call/src/runtime.test.ts",
  "extensions/voice-call/src/webhook-security.test.ts",
  "extensions/voice-call/src/webhook.test.ts",
  "extensions/whatsapp/src/auto-reply.broadcast-groups.combined.test.ts",
  "extensions/whatsapp/src/auto-reply/monitor/on-message.audio-preflight.test.ts",
  "extensions/zalo/runtime-api.test.ts",
  "extensions/zalo/src/monitor.webhook.test.ts",
  "extensions/zalo/src/token.test.ts",
  // #2782 (zalouser): channel.directory + security-audit un-quarantined (they passed once the
  // `temp-path` + `dangerous-name-runtime` plugin-sdk subpaths — imported by zalouser source via
  // the bare `remoteclaw/plugin-sdk/*` specifier — were added to the vitest.config.ts resolve-alias
  // mirror; a test-harness resolution gap, not a product-source change). The 3 below stay: each
  // needs a SOURCE change to the outbound / DM-routing / authz paths (see PR for details).
  "extensions/zalouser/src/channel.sendpayload.test.ts", // #2782: SOURCE regression — channel.ts outbound (sendText/sendPayload) never passes textMode:"markdown" + resolved textChunkMode/textChunkLimit, and double-chunks long text at the sendPayload layer instead of passing through once (send.ts already implements passthrough markdown chunking; the caller wiring was lost)
  "extensions/zalouser/src/channel.test.ts", // #2782: SOURCE regression — same root as channel.sendpayload: channel.ts sendText omits textMode/textChunkMode/textChunkLimit
  "extensions/zalouser/src/monitor.group-gating.test.ts", // #2782: 3 SOURCE regressions — (a) deliverZalouserReply outer-chunks + omits textMode/chunk opts (same passthrough root); (b) open-policy non-command DMs are dropped before dispatch (resolveAgentRoute never reached); (c) SECURITY: monitor.ts processMessage group-match (~L321) omits allowNameMatching, so a mutable group NAME always matches config entries → group-allowlist bypass by name impersonation even without dangerouslyAllowNameMatching — needs a security-reviewed fix
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
  "src/auto-reply/reply/session.test.ts", // #2782: SOURCE bug — session.ts resolveConversationIdFromTargets gutted to ()=>undefined → /new silently suppressed for all ACP-shaped session keys
];
