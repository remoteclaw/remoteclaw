# Gut "Default Agent" Concept

## Roadmap

- [x] Phase 0: Intent
- [ ] Phase 1: Decomposition
- [ ] Phase 2: Enrichment
- [ ] Phase 3: Quality Gate
- [ ] Phase 4: Structuring
- [ ] Phase 5: Tracking
- [ ] Phase 6: Verification

## Problem Statement

The "default agent" concept (`default: true` on `AgentConfig`, `resolveDefaultAgentId()`, `DEFAULT_AGENT_ID = "main"`) silently routes messages to an arbitrary agent when routing fails. This **hides configuration errors** that are hard to trace: a misconfigured binding, a missing agent ID, or a typo in a session key all produce the same invisible outcome -- traffic lands on some "default" agent with no warning.

The concept conflates four unrelated concerns under one mechanism:

1. **Routing fallback**: No binding match -> silently route to default (the bug-hiding behavior)
2. **Workspace convenience**: Non-agent operations (plugin loading, config validation) grab a workspace dir via the default agent
3. **Session key migration**: Legacy session keys without `agent:` prefix fall back to default
4. **Display ordering**: Health checks and summaries use default agent as sort anchor

This is an inherited OpenClaw pattern. RemoteClaw's direction is explicit configuration over implicit defaults (see: three-tier workspace cascade already removed in #278/#298).

## Success Criteria

1. No silent routing fallback exists -- unroutable messages produce an explicit error
2. `AgentConfig.default` field is removed from the type system, schema, and validation
3. `resolveDefaultAgentId()` function is eliminated
4. All ~50 call sites are migrated to explicit alternatives appropriate for their category
5. Single-agent configurations still work without specifying agent IDs everywhere (convenience preserved via different mechanism)
6. Existing tests updated; no regression in CI (`build`, `test`, `lint`, `docs`)

## Boundaries

### In Scope

- Remove `default: true` field from `AgentConfig` type, zod schema, help text, labels
- Remove `resolveDefaultAgentId()` and all callers
- Replace routing fallback with explicit error/null returns
- Replace workspace-convenience callers with a non-agent-specific mechanism
- Handle legacy session keys that lack agent prefix
- Update all affected tests
- Config migration for existing `default: true` entries (strip the field)

### Out of Scope

- Changing `DEFAULT_AGENT_ID = "main"` as a normalization constant (separate from default-agent routing)
- Reworking the binding system itself
- Changing session key format
- Multi-agent UX improvements beyond removing the default fallback

### Constraints

- Must not break single-agent setups (the common case)
- CI must pass: `build`, `test`, `lint`, `docs`
- Backward-compatible config loading (existing configs with `default: true` should degrade gracefully)

### Stakeholders

- Operators configuring multi-agent setups (primary beneficiary -- config errors now surface)
- Single-agent operators (must not regress)
