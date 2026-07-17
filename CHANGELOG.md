# Changelog

## Unreleased

### Breaking

- **Bot-loop protection now wired end-to-end and enabled by default
  ([remoteclaw#2868](https://github.com/remoteclaw/remoteclaw/issues/2868)):**
  The `botLoopProtection` channel setting was previously advertised but inert —
  the strict config schema rejected it and no adapter consumed it. It is now
  accepted (additive, all-optional fields) and enforced on the inbound path of
  the Discord, Google Chat, and Slack adapters, suppressing runaway bot-to-bot
  message loops. It defaults **on** (`maxEventsPerWindow: 20`, `windowSeconds:
60`, `cooldownSeconds: 60`), so an existing `allowBots: true` setup with no
  `botLoopProtection` block now suppresses a bot pair after 20 messages in 60
  seconds where it previously dispatched unconditionally. To keep the prior
  behavior, set `botLoopProtection.enabled: false` or raise `maxEventsPerWindow`.
  Matrix is not yet wired (its inbound path lacks the required configured-bot-sender
  machinery).

- **Security — fail closed on `dmPolicy: open` without an allowlist
  ([remoteclaw#2870](https://github.com/remoteclaw/remoteclaw/pull/2870)):**
  Direct-message access under `dmPolicy: open` now routes through the adopted
  upstream channel-SDK ingress gate. A wildcard `allowFrom: ["*"]` or an
  allowlisted sender is allowed, but a bare `dmPolicy: open` with an empty or
  unset `allowFrom` now **denies** all senders instead of allowing them. This
  flips silently-permissive open-mode setups from accepted to rejected. To keep
  the prior allow-all behavior, set `allowFrom: ["*"]` explicitly. Adopts
  upstream OpenClaw's consolidated message-access gate
  (`src/channels/message-access/`), replacing this fork's frozen inline
  `dm-policy-shared` copy which carried the weaker pre-fork semantics.

- **Security — honor owner enforcement for commands
  ([remoteclaw#2821](https://github.com/remoteclaw/remoteclaw/issues/2821)):**
  When owner enforcement is on (the WhatsApp default) but no owner is resolvable,
  command authorization now **denies** non-owner senders instead of authorizing
  them. Previously, silently-insecure configurations — `channels.whatsapp.allowFrom:
["*"]`, an empty/unset allowFrom, or `commands.allowFrom` opened to `"*"` — let any
  sender run privileged commands (session reset, subagent spawn, TTS, status,
  directives). This flips those setups from accepted to rejected. To keep public
  command access, configure `commands.ownerAllowFrom: ["*"]` (or an explicit owner
  list); an internal `operator.admin` session is still authorized. Restores upstream
  OpenClaw #78864, dropped by a content-only sync when this fork's resolver had
  structurally diverged.

### Fixed

- **iMessage — stop leaking the `[[rc:reply:<id>]]` reply tag into delivered text
  ([remoteclaw#2990](https://github.com/remoteclaw/remoteclaw/issues/2990)):**
  The legacy `imsg` outbound path re-encoded reply threading as an inline
  `[[rc:reply:<id>]]` tag prepended to the message body. Because `imsg`
  (`steipete/tap/imsg`) delivers text verbatim and has no knowledge of this
  RemoteClaw-internal directive, reply-to sends shipped the literal tag to the
  human recipient (for example `[[rc:reply:123]] Sure, that works`). Reply
  threading now travels via a structured `reply_to` RPC field, and any inline
  directive tags (`[[rc:reply:...]]`, `[[audio_as_voice]]`) are stripped from the
  user-visible body before delivery. Ports upstream OpenClaw #39512 (thanks
  @mvanhorn), which had not reached this fork. BlueBubbles was unaffected — it
  already threads via a structured `selectedMessageGuid`.

## 0.1.0

First RemoteClaw release. Forked from [OpenClaw v2026.2.25](https://github.com/openclaw/openclaw/releases/tag/v2026.2.25)
with significant changes — RemoteClaw is middleware, not a platform.

### What changed from OpenClaw

**Removed** (26 gut operations):

- Skills marketplace and plugin system
- Model provider ecosystem (replaced by CLI-native auth)
- Consumer onboarding UX
- Elevated mode infrastructure
- Legacy migrations and bootstrap system

**Replaced**:

- Execution engine: Pi-based orchestrator → AgentRuntime supporting
  CLI-only agents (Claude, Gemini, Codex, OpenCode)

**Added** (highlights):

- Multimodal I/O for Claude, Gemini, and Codex runtimes
- Thinking/reasoning output propagation (middleware → gateway → UI)
- Per-agent `runtimeArgs` and `runtimeEnv` configuration
- Auth rate-limit retry with key rotation
- Plugin SDK: custom STT/TTS provider registration
- Slack setup wizard with manifest customization
- Automated rebrand gate in CI
- `next` npm channel (auto-publishes on every push to main)

For the upstream changelog at the fork point, see
[OpenClaw v2026.2.25](https://github.com/openclaw/openclaw/releases/tag/v2026.2.25).
