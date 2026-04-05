# Changelog

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
