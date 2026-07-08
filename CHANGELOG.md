# Changelog

## Unreleased

### Breaking

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
