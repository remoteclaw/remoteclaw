---
summary: "Decision record on the exec-approvals authority surface — gateway-mediated only; channel-forwarding declared a non-goal"
read_when:
  - Adding a CLI runtime adapter (claude/gemini/codex/opencode)
  - Considering routing CLI permission prompts through chat channels
  - Auditing the exec-approvals subsystem for dead surface
  - Reviewing config schema additions under `approvals.*` or `channels.*.execApprovals`
title: "Exec-approvals architecture (decision record)"
---

# Exec-approvals architecture

Decision: 2026-04-26 (issue [#2573](https://github.com/remoteclaw/remoteclaw/issues/2573)).
Status: **Accepted** — Path A.

## Context

Two exec-approvals surfaces lived side-by-side in the codebase:

1. **Working** (`exec.approval.*` via gateway broadcast). When a node-host
   command needs approval, `src/agents/tools/nodes-tool.ts` calls
   `callGatewayTool("exec.approval.request", ...)`. The gateway broadcasts
   `exec.approval.requested` to clients with the `operator.approvals` scope
   ([`src/gateway/server-broadcast.ts`](../../src/gateway/server-broadcast.ts)).
   The macOS companion app subscribes
   ([`apps/macos/.../ExecApprovalsGatewayPrompter.swift`](../../apps/macos/Sources/RemoteClaw/ExecApprovalsGatewayPrompter.swift)),
   prompts the operator, and resolves via `exec.approval.resolve`. Default
   timeout 120s. End-to-end functional.

2. **Decorative** (`approvals.exec.*` global forwarding + per-channel
   `channels.{discord,telegram}.execApprovals` clients). The schema declared
   a forwarding configuration that promised: forward exec-approval prompts to
   discord/telegram chat threads, accept inline-button or `/approve` replies,
   route the resolution back. The schema, types, help text, and label
   metadata existed. **Zero runtime consumers existed** — no code read these
   fields and translated a `exec.approval.requested` broadcast into a chat
   message, and no inbound chat-message handler interpreted approval replies
   to call `exec.approval.resolve`.

Behind those two surfaces sits a separate question: **does RemoteClaw own
the authority bridge between user-facing channels and a CLI agent's own
permission prompts?** The four supported CLI runtimes (Claude Code, Gemini,
Codex, OpenCode) each ship with their own permission UX (approve/deny
prompts on tool invocation). RemoteClaw can opt out via `runtimeArgs:
["--dangerously-skip-permissions"]` (Claude Code) or analogous flags for
other runtimes — at which point the CLI's prompts are silenced and only the
gateway-mediated `exec.approval.*` path remains as user-facing approval UX.

The decorative `forwardExecApprovals` / `approvals.exec.*` chain was the
(undelivered) bridge that would have closed this gap for channel-based UX.
The choice this record settles: build the bridge, or remove the dead surface.

## Considered paths

### Path A — Gut decorative fields (chosen)

Accept the **Middleware Boundary Principle** as the architectural
commitment.

- CLI agents own their permission UX internally. Operators who want
  per-tool approvals operate the CLI directly, see CLI prompts in their
  terminal, and answer them there.
- Operators who run RemoteClaw headless (channel-only) accept the trade:
  CLI permission UX is opt-out via `runtimeArgs`; only the
  gateway-mediated `exec.approval.*` path applies (covers node-host
  exec, not in-CLI tool calls).
- Channel-based exec-approval forwarding is a non-goal.

Mechanical scope of the gut (this PR):

- Delete `approvals.exec.*` global forwarding config:
  [`src/config/types.approvals.ts`](../../src/config/types.approvals.ts) (entire file),
  [`src/config/zod-schema.approvals.ts`](../../src/config/zod-schema.approvals.ts) (entire file),
  field on `RemoteClawConfig` in
  [`src/config/types.remoteclaw.ts`](../../src/config/types.remoteclaw.ts),
  hook in [`src/config/zod-schema.ts`](../../src/config/zod-schema.ts).
- Delete per-channel decorative clients: `DiscordExecApprovalConfig` and
  `TelegramExecApprovalConfig` types and their `execApprovals?` fields in
  [`src/config/types.discord.ts`](../../src/config/types.discord.ts) and
  [`src/config/types.telegram.ts`](../../src/config/types.telegram.ts);
  matching Zod entries in
  [`src/config/zod-schema.providers-core.ts`](../../src/config/zod-schema.providers-core.ts).
- Delete the dormant Discord lifecycle hook: `ExecApprovalsHandler`
  interface and start/stop calls in
  [`extensions/discord/src/monitor/provider.lifecycle.ts`](../../extensions/discord/src/monitor/provider.lifecycle.ts)
  (the only call site already passes `execApprovalsHandler: null`).
- Remove the stale `doctor` reader in
  [`src/commands/doctor-security.ts`](../../src/commands/doctor-security.ts)
  and the per-channel field collection in
  [`src/commands/doctor-config-flow.ts`](../../src/commands/doctor-config-flow.ts).
- Remove help/label/quality-test entries for the deleted paths
  ([`src/config/schema.help.ts`](../../src/config/schema.help.ts),
  [`src/config/schema.labels.ts`](../../src/config/schema.labels.ts),
  [`src/config/schema.help.quality.test.ts`](../../src/config/schema.help.quality.test.ts)).
- Regenerate
  [`src/config/schema.base.generated.ts`](../../src/config/schema.base.generated.ts)
  and
  [`docs/.generated/config-baseline.json`](../.generated/config-baseline.json).
- Trim documentation:
  [`docs/tools/exec-approvals.md`](../tools/exec-approvals.md) — remove
  "Approval forwarding to chat channels" + "Built-in chat approval clients"
  sections; keep the macOS-app-mediated path documentation.
  [`docs/channels/discord.mdx`](../channels/discord.mdx) — remove the
  `<details>` block describing channel-side approvals.

The working `exec.approval.*` gateway broadcast path, the
`system.execApprovals.{get,set}` node-side capability advertised by the
macOS app and headless node host, and `~/.remoteclaw/exec-approvals.json`
host-side allowlist gating are **untouched**.

### Path B — Wire the AgentRuntime authority bridge (rejected)

Commit to RemoteClaw owning a CLI-prompt → channel/macOS-app routing
layer. The minimum viable shape would be:

- Per-runtime prompt-capture integration: identify each CLI's
  permission-prompt API (Claude Code hooks, Gemini equivalent, Codex /
  OpenCode equivalents — each currently a separate research item), wire a
  capture path that observes prompts without breaking the CLI's own UX
  when the operator does want it.
- Outbound routing: re-use `exec.approval.request` RPC to broadcast captured
  prompts; or add an `agent.approval.request` parallel surface for the
  semantically-different "CLI tool approval" case.
- Inbound routing: each channel adapter (discord-bot, telegram-bot, etc.)
  needs a button/reply handler that calls back to a resolve method.
- UX decisions: button-based vs `/approve`-reply-parsing per channel,
  failure modes when an operator doesn't respond, scope of what gets
  forwarded (every prompt? only `bash`? configurable?).

Cost estimate: probably 2-4 PRs per CLI runtime + one shared infrastructure
PR + per-channel adapter wiring + tests + docs. Each runtime integration
would also be subject to upstream CLI churn (when Claude Code, Gemini etc.
change their prompt APIs).

## Decision and rationale

**Path A.** The decision rests on three points, in order of weight:

1. **Documented architectural stance.** The
   [Middleware Architecture](middleware-architecture.md) concept doc, in
   "The Middleware Boundary Principle" table, explicitly assigns "tool
   execution" and "model selection and inference" to the **agent's**
   responsibility — not RemoteClaw's. Owning the per-tool authority bridge
   directly contradicts that boundary.
2. **Cost-to-value imbalance.** Path B is 5+ PRs with ongoing per-CLI
   maintenance burden. The value (channel-based per-tool approval UX
   instead of macOS-app-only) is real but narrow: most operators either
   run CLIs with prompts (terminal mode) or accept skip-permissions for
   headless mode. The macOS companion app already covers
   gateway-mediated node-host exec approvals — the most common
   approval-required surface in practice.
3. **Dead-surface tax.** The decorative chain has been live in the schema
   long enough to appear in user-facing help, labels, and a doctor warning
   that itself acknowledges the field is meaningless ("approvals.exec.enabled=false
   disables approval forwarding only. Host exec gating still comes from
   ~/.remoteclaw/exec-approvals.json"). Every config audit and every new
   doctor check has to step around it. Path A reclaims that space.

## Consequences

- **For operators.** No behavior change. Operators who had set
  `approvals.exec.*` or `channels.{discord,telegram}.execApprovals` saw
  no functional effect from those settings; removing them is silent at
  runtime. Schema validation tightens — configs containing the deleted
  paths will fail Zod validation. Per the "User state boundary" policy
  in [CLAUDE.md § Fork Context](../../CLAUDE.md), no migration is
  owed: pre-rebrand and upstream-OpenClaw configs are not RemoteClaw
  legacy.
- **For node operators.** The working approval path remains intact:
  `exec.approval.request` broadcast → macOS app prompt → resolve.
  Local allowlist editing via `remoteclaw approvals` is unchanged.
- **For CLI runtime adapters.** No change. Adapters remain thin
  spawn-wrappers; CLI runtimes own their own permission UX.
- **For future approval requirements.** If a future requirement to
  bridge CLI prompts emerges (e.g., a single high-value operator
  workflow), the right move is a fresh design — not reviving this
  schema. Whatever surface emerges should be minimal, runtime-specific,
  and probably not lifted to channel-config.

## Non-goals (re-affirmed)

- Forwarding CLI agent permission prompts (Claude Code `bash`/`edit`
  approvals, Gemini equivalents, etc.) to chat channels.
- Acting as a permission-policy authority that overrides each CLI's
  built-in UX.
- Translating `exec.approval.requested` broadcasts into Discord/Telegram
  inline-button approval flows.

## Related

- [Middleware Architecture](middleware-architecture.md) — the
  Middleware Boundary Principle this decision rests on.
- [docs/tools/exec-approvals.md](../tools/exec-approvals.md) —
  user-facing documentation of the working approval path.
- Issue [#2573](https://github.com/remoteclaw/remoteclaw/issues/2573) —
  spike that produced this record.
