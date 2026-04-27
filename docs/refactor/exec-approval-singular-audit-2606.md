---
title: "Audit: exec.approval.* (singular) wire-path is broken (#2606)"
description: "Audit finding: gateway handlers for exec.approval.{request,waitDecision,resolve} were deleted by PR #2375; protocol declarations and live callers survive, leaving an unreachable RPC surface."
read_when:
  - Investigating why exec.approval.request returns 'unknown method' from the gateway
  - Reviewing whether the macOS or web-UI approval prompts ever fire end-to-end
  - Reconciling docs/concepts/exec-approvals-architecture.md with current code
  - Sizing the cleanup or restoration follow-up for the singular exec-approvals subsystem
  - Auditing other declared-but-unhandled gateway methods after a fork-gut
---

# Audit: `exec.approval.*` (singular) wire-path is broken (#2606)

**Issue**: [#2606](https://github.com/remoteclaw/remoteclaw/issues/2606) — Audit: exec-approvals request/decision/resolve subsystem registration survives a gut — wire-path or unregister.
**Type**: SPIKE — audit-only deliverable. No code, schema, or behavior changes.
**Verdict**: **Wire-path is fully gutted on the server side; protocol surface and client callers survive. The architecture doc's "End-to-end functional" claim is currently false.**

This audit is a discovery action; the cleanup-or-restoration follow-up is sized after this lands, per the issue body.

## Summary

| Layer                                                                                 | State                                                     | Last Touched                                                                                                                                                       |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Singular method **handlers** (`exec.approval.{request,waitDecision,resolve}`)         | **DELETED**                                               | PR #70/#71 (commit `45d67349af`, 2026-02-27) replaced real impl with empty stubs; PR #2375 (commit `4e846400b0`, 2026-04-16) deleted the empty stub files entirely |
| Singular method **declarations** (scopes, methods-list, schemas)                      | **SURVIVE**                                               | unchanged                                                                                                                                                          |
| Singular method **live callers** (TS + Swift + web UI)                                | **SURVIVE**                                               | unchanged; would receive `INVALID_REQUEST: unknown method: exec.approval.{...}` from the gateway today                                                             |
| `exec.approval.{requested,resolved}` **broadcast events**                             | **DECLARED + SCOPE-GUARDED, NO PRODUCER**                 | scope guards in `server-broadcast.ts:13-14`; no `broadcast("exec.approval.requested", …)` call in production code (only in `gateway-misc.test.ts:200`)             |
| Plural `exec.approvals.*` (POLICY/STORAGE: `.get`, `.set`, `.node.get`, `.node.set`)  | **WORKING — out of scope of this audit**                  | unchanged                                                                                                                                                          |
| Architecture doc `docs/concepts/exec-approvals-architecture.md` (decision 2026-04-26) | **MISALIGNED** with code (claims "End-to-end functional") | written 10 days AFTER the singular handlers were physically deleted by PR #2375                                                                                    |

## Acceptance criteria — per-AC evidence

> Note on terminology: this audit uses **singular** `exec.approval.*` (verb-form: `request`, `waitDecision`, `resolve`) versus **plural** `exec.approvals.*` (policy: `get`, `set`, `node.get`, `node.set`). The plural subsystem is in active use and explicitly out of scope per the issue's "Non-goals". The singular subsystem is the audit target.

### AC #1 — Confirm whether `exec.approval.*` (singular) handlers exist anywhere in the codebase

**Verdict: NO.** No handler exists in the gateway dispatch, plugin registry, or anywhere else.

Evidence:

- `src/gateway/server-methods.ts:63-88` (`coreGatewayHandlers`) registers 24 handler maps; none is for `exec.approval.*` (singular):
  ```ts
  export const coreGatewayHandlers: GatewayRequestHandlers = {
    ...connectHandlers,
    ...logsHandlers,
    ...voicewakeHandlers,
    ...healthHandlers,
    ...channelsHandlers,
    ...chatHandlers,
    ...cronHandlers,
    ...deviceHandlers,
    ...webHandlers,
    ...configHandlers,
    ...wizardHandlers,
    ...talkHandlers,
    ...toolsCatalogHandlers,
    ...ttsHandlers,
    ...sessionsHandlers,
    ...systemHandlers,
    ...updateHandlers,
    ...nodeHandlers,
    ...nodePendingHandlers,
    ...pushHandlers,
    ...sendHandlers,
    ...agentHandlers,
    ...agentsHandlers,
    ...browserHandlers,
  };
  ```
- `src/gateway/server-methods.ts:125` is the dispatch fallback path:
  ```ts
  const handler = opts.extraHandlers?.[req.method] ?? coreGatewayHandlers[req.method];
  if (!handler) {
    respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `unknown method: ${req.method}`));
  ```
- `src/gateway/server.impl.ts:649-659` references `hasExecApprovalClients` — but this is a _scope-routing helper_ (boolean existence check: returns `true` if any connected client carries `operator.admin` or `operator.approvals` scope), not a method handler.
- Plugin registry `extraHandlers` (`src/gateway/server.impl.ts:701-703`) draws solely from `pluginRegistry.gatewayHandlers`. A grep across `src/plugins/**` and `extensions/**` finds **zero** plugin that registers `exec.approval.*` (singular) handlers (only `extensions/telegram/src/approval-buttons.ts` exists, and it is a UI button-builder utility, not a gateway-handler registrar).
- The real handler implementation lived in `src/gateway/server-methods/exec-approval.ts` (242 lines) and was deleted by commit `45d67349af` ("feat: gut bash/exec tools, PTY, and exec-approval infrastructure (#70) (#71)", 2026-02-27). Quote from that commit's diff header (deletion):
  ```
  diff --git a/src/gateway/server-methods/exec-approval.ts b/src/gateway/server-methods/exec-approval.ts
  deleted file mode 100644
  ```
- The empty replacement stubs were deleted by commit `4e846400b0` ("gut: delete 8 zero-caller EXCLUDE-STUB files in src/gateway/ (#2375)", 2026-04-16). The PR's commit log explicitly enumerates `server-methods/exec-approval.ts` and `server-methods/exec-approvals.ts` as deleted EXCLUDE-STUB files.
- `src/gateway/server-methods/nodes.invoke-wake.test.ts:214` still passes `execApprovalManager: undefined` into the test context, confirming the `ExecApprovalManager` concept is gone but the field type lingers in the request-context shape.

### AC #2 — Identify the original consumers of the gutted subsystem and confirm they were also removed

**Verdict: PARTIALLY removed.** Server-side handlers and the `ExecApprovalManager` are gone, but client-side callers — both TS (agent + CLI) and platform-app (macOS, web UI) — survive. Each issues an RPC the gateway will reject as `unknown method`.

#### Live callers of `exec.approval.request` (would receive `unknown method` today)

- `src/agents/tools/nodes-tool.ts:550` — invoked when `node.invoke` for `system.run` returns `SYSTEM_RUN_DENIED: approval required`:
  ```ts
  // src/agents/tools/nodes-tool.ts:548-563
  const approvalId = crypto.randomUUID();
  const approvalResult = await callGatewayTool(
    "exec.approval.request",
    { ...gatewayOpts, timeoutMs: APPROVAL_TIMEOUT_MS + 5_000 },
    {
      id: approvalId,
      command: cmdText,
      commandArgv: command,
      cwd,
      nodeId,
      host: "node",
      agentId,
      sessionKey,
      timeoutMs: APPROVAL_TIMEOUT_MS,
    },
  );
  ```
  Reachability: This branch fires only when the node host returns the `SYSTEM_RUN_DENIED: approval required` error (`src/agents/tools/nodes-tool.ts:539-541`). The macOS app's `system.run` flow handles approvals locally and does not return this error in normal operation, but a headless node host or a node host reachable through the docs path could.
- `src/cli/nodes-cli/register.invoke.ts:247` — invoked from `remoteclaw nodes run` when ask mode is `always` or `on-miss`:
  ```ts
  // src/cli/nodes-cli/register.invoke.ts:246-264
  const decisionResult = (await callGatewayCli(
    "exec.approval.request",
    params.opts,
    {
      id: approvalId,
      command: params.preparedCmdText,
      commandArgv: params.approvalPlan.argv,
      systemRunPlan: params.approvalPlan,
      cwd: params.approvalPlan.cwd,
      nodeId: params.nodeId,
      host: "node",
      security: params.hostSecurity,
      ask: params.hostAsk,
      agentId: params.approvalPlan.agentId ?? params.agentId,
      resolvedPath: undefined,
      sessionKey: params.approvalPlan.sessionKey ?? undefined,
      timeoutMs: approvalTimeoutMs,
    },
    { transportTimeoutMs },
  )) as { decision?: string } | null;
  ```
  Reachability: `maybeRequestNodesRunApproval` (lines 221-288) returns early when `requiresAsk` is false. With default node-side defaults (`ask: "on-miss"`, `askFallback: "deny"`) this fires by default on any unknown command via the CLI flow. The test `src/cli/nodes-cli.coverage.test.ts:75-78` mocks the gateway response to `{ decision: "allow-once" }` — passing in test, broken in production.
- The comment immediately above the inlined helpers at `src/cli/nodes-cli/register.invoke.ts:15` (`// Exec-approvals subsystem was gutted — inline minimal types and helpers.`) refers to inlining of LOCAL types from the deleted `src/infra/exec-approvals.ts` (PR #2374). It does NOT mean the gateway flow that line 247 invokes was retired. The comment is consistent with the `register.invoke.ts:247` caller still expecting the gateway method to work.

#### Live callers of `exec.approval.resolve` (would receive `unknown method` today)

- `ui/src/ui/app.ts:467` — Web Control UI:
  ```ts
  await this.client.request("exec.approval.resolve", { id: active.id, decision /* ... */ });
  ```
  Triggered when an operator clicks an approve/deny button in the queue UI. Currently unreachable, because the queue is populated by `exec.approval.requested` broadcasts (`ui/src/ui/app-gateway.ts:363-373`) and no production code path ever emits that broadcast (see "Broadcast event sourcing" below).
- `apps/macos/Sources/RemoteClaw/GatewayConnection.swift:91` — declares `execApprovalResolve = "exec.approval.resolve"` as a Method enum case. The macOS app's `ExecApprovalsGatewayPrompter.swift` is the producer (it calls `resolve` after the operator answers a system prompt) — same end-state: would hit a non-existent gateway method.

#### Zero callers of `exec.approval.waitDecision`

A grep across `src/`, `extensions/`, `apps/`, and `ui/` finds **no caller** of `exec.approval.waitDecision` outside its declaration (`src/gateway/method-scopes.ts:34`, `src/gateway/server-methods-list.ts:30`). It is an orphan.

#### Broadcast event sourcing — no producer

- `src/gateway/server-broadcast.ts:13-14` registers scope guards:
  ```ts
  const EVENT_SCOPE_GUARDS: Record<string, string[]> = {
    "exec.approval.requested": [APPROVALS_SCOPE],
    "exec.approval.resolved": [APPROVALS_SCOPE],
    /* ... */
  };
  ```
  But a search for `broadcast("exec.approval.requested", …)` and `broadcast("exec.approval.resolved", …)` finds **zero** production call sites — the only match is in the unit test `src/gateway/gateway-misc.test.ts:200`, which exercises the scope-guard fan-out logic with a synthetic event.
- The Web UI subscriber `ui/src/ui/app-gateway.ts:363-373` and macOS subscriber `apps/macos/Sources/RemoteClaw/ExecApprovalsGatewayPrompter.swift:43-67` are listening for events that no one fires.

### AC #3 — Verify there is no end-to-end request → wait → resolve flow with at least one client implementation

**Verdict: NO.** The end-to-end flow is broken. Even though clients are present at every layer (request originator, broadcast subscriber, resolve sender), there is no server-side mediator to bridge them.

Walked end-to-end:

| Stage                | Code Path                                                                         | Status                                                                           |
| -------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Request entry     | `nodes-tool.ts:550` or `register.invoke.ts:247` calls `exec.approval.request`     | ✅ live                                                                          |
| 2. Gateway routing   | `server-methods.ts:125` looks up handler in `coreGatewayHandlers ∪ extraHandlers` | ❌ no handler — returns `INVALID_REQUEST: unknown method: exec.approval.request` |
| 3. Manager state     | (deleted) `ExecApprovalManager` would have created a pending entry                | ❌ class deleted by `45d67349af`                                                 |
| 4. Broadcast fan-out | `server-broadcast.ts` would broadcast `exec.approval.requested` to scoped clients | ❌ no producer (the deleted manager was the producer)                            |
| 5. Subscriber prompt | `ExecApprovalsGatewayPrompter.swift:43` / `app-gateway.ts:363` show UI            | ❌ never receives the broadcast                                                  |
| 6. Resolution send   | `app.ts:467` / macOS resolve flow calls `exec.approval.resolve`                   | ❌ gateway returns `INVALID_REQUEST: unknown method: exec.approval.resolve`      |
| 7. Decision relay    | (deleted) `ExecApprovalManager` would relay decision back to caller               | ❌ class deleted                                                                 |

The chain breaks at stage 2 and again at stage 4 (no producer), and any branch that reaches stage 6 also fails at the gateway. There is no path from stage 1 to a useful answer in current code.

The `nodes-cli.coverage.test.ts` test passing is not evidence of working end-to-end behavior — it stubs the gateway response (`src/cli/nodes-cli.coverage.test.ts:75-78`) and asserts the CLI's request shape, not the gateway's handling.

### AC #4 — Determine whether `ExecApprovalRequestParamsSchema` / `ExecApprovalResolveParamsSchema` carry fields used elsewhere as a shared `ApprovalCorrelationFields` shape

**Verdict: NO.** The schemas serve only the deleted handler pair. No code outside this subsystem reads the correlation fields (`id`, `agentId`, `sessionKey`, `turnSource{Channel,To,AccountId,ThreadId}`, `twoPhase`, `timeoutMs`) as a shared shape. There is no extraction value before deletion.

Evidence:

- TS schema declaration: `src/gateway/protocol/schema/exec-approvals.ts:87-143` — `ExecApprovalRequestParamsSchema` (47 lines) + `ExecApprovalResolveParamsSchema` (6 lines).
- TS schema registration: `src/gateway/protocol/schema/protocol-schemas.ts:265-266`.
- TS type declaration: `src/gateway/protocol/schema/types.ts:110-111` (`ExecApprovalRequestParams`, `ExecApprovalResolveParams`) — derived via `SchemaType<…>`.
- TS validators: `src/gateway/protocol/index.ts:384-389` — `validateExecApprovalRequestParams` + `validateExecApprovalResolveParams` Ajv-compiled but referenced by **no callers** outside this audit's deleted handlers (search `validateExecApprovalRequestParams` / `validateExecApprovalResolveParams` returns hits only inside `protocol/index.ts` itself).
- Swift mirrors: `apps/macos/Sources/RemoteClawProtocol/GatewayModels.swift:2885,2943` and `apps/shared/RemoteClawKit/Sources/RemoteClawProtocol/GatewayModels.swift:2885,2943` — duplicate the shape into Swift `Codable` structs. These are reachable from the macOS app's `ExecApprovalsGatewayPrompter.swift` flow.
- Caller-side: the live TS callers (`nodes-tool.ts:550`, `register.invoke.ts:247`) construct the param object inline. Neither imports `ExecApprovalRequestParams` as a type — they pass an object literal.
- Cross-consumption check for individual fields:
  - `id` (correlation prefix): no other RPC method accepts an opaque approval ID; not a shared correlation key.
  - `agentId`: appears in many RPC params, but each RPC defines it inline; there is no canonical "agent correlation fields" type the codebase reads from.
  - `sessionKey`: same — inline in each consumer.
  - `turnSource{Channel,To,AccountId,ThreadId}`: appear in approval-request params alone (search `turnSourceChannel` returns only the schema definition + macOS Swift mirror).
  - `twoPhase` / `timeoutMs`: per-method-local.

**Conclusion**: extracting an `ApprovalCorrelationFields` shape is unwarranted. If the singular subsystem is later restored, the schemas can be reinstated as-is. If it is removed, the schemas + validators + types delete cleanly.

## Documentation alignment

The architecture decision in `docs/concepts/exec-approvals-architecture.md` (2026-04-26, issue [#2573](https://github.com/remoteclaw/remoteclaw/issues/2573), Path A) states:

> **Working** (`exec.approval.*` via gateway broadcast). When a node-host command needs approval, `src/agents/tools/nodes-tool.ts` calls `callGatewayTool("exec.approval.request", ...)`. The gateway broadcasts `exec.approval.requested` to clients with the `operator.approvals` scope […]. The macOS companion app subscribes […], prompts the operator, and resolves via `exec.approval.resolve`. Default timeout 120s. **End-to-end functional**.

This text was written **after** PR #2375 (2026-04-16) deleted the gateway handlers. The doc reflects design intent, not the current code state. The decision document's mechanical scope (`docs/concepts/exec-approvals-architecture.md:69-104`) lists the deletion targets for the **decorative** `approvals.exec.*` chain — a different subsystem (channel-forwarding), explicitly distinct from the singular `exec.approval.*` gateway path the doc names "Working". The decision document does not authorize deletion of the singular handlers and was likely unaware they had already been deleted by PR #2375.

This is an audit finding, not a critique of the decision: the gut and the architecture decision were two parallel actions whose state diverged.

Similarly aligned-with-intent-but-misaligned-with-code:

- `docs/tools/exec-approvals.md:243-247` — claims gateway broadcasts `exec.approval.requested` and operators resolve via `exec.approval.resolve`.
- `docs/gateway/protocol.md:180-184` — same claim in the protocol section.
- `docs/cli/nodes.md:60` — references `exec.approval.request` as the CLI's approval mechanism.

## Recommendations (out-of-scope for this PR)

This audit is a discovery action. The action items below are scoped for follow-up issues, per the issue body's "sized after the audit lands" mandate.

1. **Decision: restore or fully gut the singular subsystem.** This is the load-bearing follow-up. Two viable paths:
   - **Restore (Outcome 1 of issue #2606)**: re-introduce `src/gateway/server-methods/exec-approval.ts` and `src/gateway/exec-approval-manager.ts` using the shape from before PR #2375 (recoverable via `git show 4e846400b0~1:src/gateway/server-methods/exec-approval.ts` and the manager file's history). Add an end-to-end integration test (TS-side request → broadcast → mock subscriber → resolve). Update the architecture doc to reference the test as the source-of-truth for the "working" claim.
   - **Full gut (Outcome 3 of issue #2606)**: delete the singular method declarations (`method-scopes.ts:32-36`, `server-methods-list.ts:29-31`), schemas (`protocol/schema/exec-approvals.ts:87-143`, `protocol-schemas.ts:265-266`, `types.ts:110-111`), validators (`protocol/index.ts:384-389`), broadcast event scope guards (`server-broadcast.ts:13-14`, `server-methods-list.ts:136-137`), and migrate the four live callers (`nodes-tool.ts:550`, `register.invoke.ts:247`, `app.ts:467`, macOS `GatewayConnection.swift:91` + `ExecApprovalsGatewayPrompter.swift`) to either (a) defer approvals to the node host's local UX (current macOS app behavior) or (b) drop the request paths entirely. Coordinated change across TS gateway + Swift apps + web UI; not a single-PR refactor.

2. **Update misaligned documentation regardless of the decision above.** While the audit is fresh, replace the "End-to-end functional" claim in `docs/concepts/exec-approvals-architecture.md`, `docs/tools/exec-approvals.md`, `docs/gateway/protocol.md`, and `docs/cli/nodes.md` with a status pointer to this audit and to the follow-up tracking issue (whichever path is chosen). This unblocks operators auditing the path without forcing the larger restore-vs-gut decision.

3. **Optional: add a test asserting `exec.approval.request` is registered as a method handler.** A two-line test (`expect(coreGatewayHandlers["exec.approval.request"]).toBeDefined()`) would fail today and flip green when the path is restored — useful as an executable claim in the architecture doc.

## Non-goals (re-affirmed)

- Restoring the singular handlers (Outcome 1 follow-up, not this PR).
- Removing the singular declarations and migrating callers (Outcome 3 follow-up, not this PR).
- Touching the **plural** `exec.approvals.*` policy/storage subsystem (`get`, `set`, `node.get`, `node.set`) — explicitly out of scope per issue body, in active use, untouched.
- Re-litigating the `approvals.exec.*` decorative-forwarding decision in #2573 — different subsystem, settled separately, untouched.

## Related

- Issue [#2606](https://github.com/remoteclaw/remoteclaw/issues/2606) — this audit.
- PR [#2375](https://github.com/remoteclaw/remoteclaw/pull/2375) (commit `4e846400b0`) — deleted the empty stub handler files in 2026-04-16.
- PR #70 / #71 (commit `45d67349af`) — deleted the original handler implementation in 2026-02-27 ("feat: gut bash/exec tools, PTY, and exec-approval infrastructure").
- Issue [#2573](https://github.com/remoteclaw/remoteclaw/issues/2573) — the architecture decision that listed the singular path as "End-to-end functional" while the implementation was already deleted.
- [`docs/concepts/exec-approvals-architecture.md`](../concepts/exec-approvals-architecture.md) — architecture decision contradicted by current code.
- [`docs/tools/exec-approvals.md`](../tools/exec-approvals.md) — user-facing docs assuming the working path.
