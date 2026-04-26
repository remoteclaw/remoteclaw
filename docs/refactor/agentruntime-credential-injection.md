---
title: "AgentRuntime credential injection: gut decorative auth-profile SecretRef typing"
summary: "ADR: auth-profile keyRef/tokenRef typing was decorative residue from incomplete src/agents/auth-profiles/ → src/auth/ relocation. Path A (gut) chosen over Path B (wire spawn-time SecretRef resolution)."
read_when:
  - Auditing auth-profile credential resolution semantics
  - Debugging why a keyRef-only auth-profile entry is silently dropped
  - Considering whether to add SecretRef resolution to the AgentRuntime spawn path
  - Reconciling docs that mention auth-profile keyRef/tokenRef
---

# AgentRuntime credential injection: gut decorative auth-profile SecretRef typing

**Tracking issue**: [#2574](https://github.com/remoteclaw/remoteclaw/issues/2574) — SPIKE: SecretRef → AgentRuntime credential injection.

**Decision**: **Path A — gut the decorative `keyRef` / `tokenRef` SecretRef typing** in `src/agents/auth-profiles/`. AgentRuntime credential injection continues to use inline `key` / `token` values resolved by `src/auth/env-injection.ts:resolveAuthEnv` and rotated by `src/middleware/auth-key-retry.ts:withAuthKeyRetry`. SecretRef indirection is **not** part of the AgentRuntime spawn path and is **not** added by this decision.

**Status**: ACCEPTED.

## Problem statement

Investigation surfaced an inconsistency:

- `src/agents/auth-profiles/types.ts` types `ApiKeyCredential.keyRef?: SecretRef` and `TokenCredential.tokenRef?: SecretRef`.
- `docs/reference/secretref-credential-surface.md` claims auth-profile `keyRef` / `tokenRef` are "supported" SecretRef targets and "included in runtime resolution and audit coverage".
- `docs/auth-credential-semantics.md` claims `tokenRef` material is resolved at runtime.
- **But the AgentRuntime spawn path never reads either ref.** `src/auth/env-injection.ts:resolveAuthEnv` reads `cred.key` / `cred.token` only; `src/auth/oauth.ts:resolveApiKeyForProfile` reads `cred.key` / `cred.token` only; `src/auth/order.ts:resolveAuthProfileOrder` filters out profiles whose inline `key` / `token` is empty.

The decision is whether to **align reality to docs** (wire spawn-time SecretRef resolution — Path B) or **align docs to reality** (gut the decorative typing — Path A).

## Architectural reality

### Two parallel auth-profile modules

The fork hosts two parallel auth-profile modules:

| Module                      | Status                  | SecretRef typing                                                             | Runtime use                                                                                          |
| --------------------------- | ----------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/auth/`                 | LIVE                    | None — `ApiKeyCredential` has only `key`; `TokenCredential` has only `token` | YES — `resolveAuthEnv` (env-injection.ts) and `resolveApiKeyForProfile` (oauth.ts) consume from here |
| `src/agents/auth-profiles/` | LEGACY upstream residue | `keyRef?: SecretRef`, `tokenRef?: SecretRef`                                 | NO — typing exists but no production reader of those fields                                          |

Provenance: commit [`c08a83429a refactor(auth): relocate auth-profiles from src/agents/ to src/auth/ (#419)`](https://github.com/remoteclaw/remoteclaw/commit/c08a83429a) relocated the canonical module to `src/auth/`. The relocation was incomplete — the old module retained ref typing because it served as the public type surface for the plugin SDK (`src/plugin-sdk/`) and a few extension consumers, while the runtime path was switched to the new module.

The decorative typing is **fork residue** from that incomplete migration.

### Live AgentRuntime spawn path

CLI agents (Claude, Gemini, Codex, OpenCode) receive credentials via this chain:

```
agent dispatch site (commands/agent.ts | auto-reply | cron/isolated-agent)
  → resolveAgentRuntimeEnv(cfg, agentId)        ← per-agent env from cfg.agents.*.runtimeEnv (plain Record<string,string>)
  → withAuthKeyRetry({ cfg, agentId, baseEnv })  ← src/middleware/auth-key-retry.ts
      → resolveAuthEnv({ cfg, agentId, store })  ← src/auth/env-injection.ts
          → pickNextProfile(store, profiles)     ← cooldown-aware round-robin (uses src/auth/store.ts)
          → resolveApiKeyForProfile(...)         ← src/auth/oauth.ts; reads cred.key | cred.token ONLY
          → resolveProviderEnvVarName(provider)  ← maps anthropic→ANTHROPIC_API_KEY, etc.
      → execute({ env: { ...baseEnv, ...authEnv } })
  → ChannelBridge.handle({ env })
      → CLI runtime spawn with merged env
```

Concretely: `src/auth/oauth.ts:48`:

```ts
const key = (cred.type === "token" ? cred.token : cred.key)?.trim();
if (!key) {
  return null;
}
```

A profile with `keyRef` set but `key` unset returns `null` — the profile is silently treated as ineligible. There is no SecretRef resolution at this boundary.

### Producer side: who writes `keyRef` / `tokenRef`?

A repository-wide grep for `keyRef:` and `tokenRef:` literal field assignments in production source returns **zero hits** for auth-profile credentials. The matches that do exist:

- `src/pairing/setup-code.ts`, `src/browser/extension-relay-auth.ts`, `src/gateway/auth.ts` — these are **local variable names** for unrelated `SecretRef` objects in gateway pairing, browser extension auth, and gateway auth flows. They do not produce auth-profile credentials.
- `src/agents/auth-profiles/store.ts:96-97` — `normalizeSecretBackedField` would coerce a non-string `key` / `token` raw value into the corresponding ref field on read. Net effect: if some external producer wrote a SecretRef into the `key` field of `auth-profiles.json`, the store would relocate it to `keyRef`. There is no such external producer.
- Test fixtures in `src/agents/auth-profiles/credential-state.test.ts` and `src/commands/daemon-install-helpers.test.ts` — exercise the eligibility logic with synthetic ref-bearing credentials. Not production behavior.

`secrets configure` / `secrets apply` / `secrets audit` — described in `docs/reference/secretref-credential-surface.md` as writing auth-profile refs — **do not have implementing code in this fork**. Those docs describe upstream OpenClaw behavior that has been gutted.

### Consumer side: who reads `keyRef` / `tokenRef`?

- `src/agents/auth-profiles/credential-state.ts:43, 52` — `evaluateStoredCredentialEligibility` calls `hasConfiguredSecretRef(credential.keyRef|tokenRef)`.
- `src/agents/auth-profiles/order.ts:60` — `resolveAuthProfileEligibility` calls `evaluateStoredCredentialEligibility`.
- The barrel `src/agents/auth-profiles.ts:10` re-exports `resolveAuthProfileEligibility`.

A grep for `resolveAuthProfileEligibility` outside the legacy module's own test files returns **zero non-test consumers**. The decorative typing's eligibility branch is **dead code**: no production caller invokes the function that consumes the typing.

### Plugin SDK and extensions

The legacy module retains real consumers, but **none touch the decorative ref typing**:

| Consumer                                          | What it imports                                                           | Touches `keyRef`/`tokenRef`?                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/plugins/types.ts`                            | `AuthProfileCredential`, `OAuthCredential` (types)                        | No — uses union for plugin auth result; plugins build OAuth credentials only |
| `src/plugin-sdk/provider-auth-result.ts`          | `AuthProfileCredential` (type)                                            | No — `buildOauthProviderAuthResult` constructs `OAuthCredential` only        |
| `src/commands/doctor-auth.ts`                     | `CLAUDE_CLI_PROFILE_ID`, `CODEX_CLI_PROFILE_ID` (constants)               | No                                                                           |
| `extensions/discord/src/monitor/auto-presence.ts` | Cooldown helpers + `AuthProfileFailureReason`, `AuthProfileStore` (types) | No                                                                           |

A grep across `extensions/` for `keyRef:` / `tokenRef:` returns **zero hits**.

## Path comparison

### Path A: gut the decorative typing

Remove `keyRef?: SecretRef` and `tokenRef?: SecretRef` from `src/agents/auth-profiles/types.ts`. Simplify `evaluateStoredCredentialEligibility` and `normalizeRawCredentialEntry` to drop ref handling. Update tests. Align docs.

| Dimension          | Assessment                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator UX impact | None — current spawn path uses inline `key` / `token`; operators set provider env vars (`ANTHROPIC_API_KEY` etc.) at gateway start; no operator surface uses `keyRef`/`tokenRef` |
| Plugin SDK impact  | None — no plugin produces refs; types remain compatible                                                                                                                          |
| Doc impact         | Positive — removes long-standing inaccuracy                                                                                                                                      |
| Risk of regression | Minimal — no production caller exercises the gutted code                                                                                                                         |
| Code reduction     | ~30 LOC across types.ts, credential-state.ts, store.ts, tests                                                                                                                    |
| Reversibility      | High — re-introducing the typing would be straightforward; the gut is recorded in this ADR                                                                                       |

### Path B: wire spawn-time SecretRef resolution into AgentRuntime

Make `src/auth/oauth.ts:resolveApiKeyForProfile` (and/or `src/auth/env-injection.ts:resolveAuthEnv`) consult `keyRef` / `tokenRef` after falling back from inline `key` / `token`. Reconcile the two parallel modules' types so the runtime sees the ref typing.

| Dimension          | Assessment                                                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator UX impact | Small positive — operators could store SecretRef indirection in `auth-profiles.json` instead of inline keys (security hygiene). But operators do not currently ask for this      |
| Plugin SDK impact  | Plugins would need to know whether to populate `key` or `keyRef`; ambiguous semantics                                                                                            |
| Doc impact         | Positive — would make the existing docs accurate                                                                                                                                 |
| Risk of regression | Moderate — adds a new resolution branch in the hot path; failure modes (unresolved ref, partial result) need handling                                                            |
| Code addition      | ~60-100 LOC across env-injection.ts, oauth.ts; tests for ref resolution; reconciliation of two AuthProfileCredential types; documentation of the env-var-per-provider convention |
| Reversibility      | Medium — once shipped, operators may start using the ref form, then removing it becomes a breaking change                                                                        |
| Necessity          | None — the existing inline-key + env-var injection path covers all current use cases                                                                                             |

### Why Path A wins

1. **No producer demand**. Zero source-code lines write `keyRef:` / `tokenRef:` to auth-profile credentials. There is no operator UX (CLI, wizard, doctor) currently producing them. Wiring resolution for non-existent inputs is speculative engineering.

2. **Existing path is sufficient**. `withAuthKeyRetry` → `resolveAuthEnv` already handles per-agent multi-profile rotation, cooldowns, env-var-per-provider mapping, and OAuth special-casing. Operators secure their gateway env vars via OS-level mechanisms (systemd environment files, launchd plists, secrets managers feeding the gateway process). SecretRef indirection inside `auth-profiles.json` adds a layer without security gain in this deployment model.

3. **Fork trajectory aligns**. The fork has been systematically gutting upstream subsystems (recent waves: #2150, #2306, #2377, #2538, #2557-#2575). Decorative typing residue from an incomplete relocation is exactly the class of artifact those waves target. Keeping it perpetuates the same drift the fork is actively eliminating.

4. **Doc drift is a tax**. Every release where the docs claim auth-profile refs are resolved while the code does not is a release where new contributors waste investigation time on the discrepancy. The decorative typing externalizes that cost onto every reader.

5. **Reversibility**. If a future operator demand for SecretRef-mediated auth profiles emerges, this ADR documents the architectural state and the cost-benefit so re-introduction can be deliberate. The future case for adding ref resolution would also bring a producer (CLI surface to write refs), which the current state lacks.

## Consequences

### Code

- `src/agents/auth-profiles/types.ts` — remove `keyRef?: SecretRef` from `ApiKeyCredential`, `tokenRef?: SecretRef` from `TokenCredential`, and the `SecretRef` import.
- `src/agents/auth-profiles/credential-state.ts` — simplify `evaluateStoredCredentialEligibility` to consult inline `key` / `token` only. Drop the `hasConfiguredSecretRef` / `hasConfiguredSecretString` local helpers (replaced by a single `hasNonEmptyString`) and the `coerceSecretRef` / `normalizeSecretInputString` imports.
- `src/agents/auth-profiles/store.ts` — replace `normalizeSecretBackedField` with `dropNonStringField`: drop the ref-coercion logic and reduce the helper to "delete non-string `key` / `token` raw fields". The `coerceSecretRef` import is no longer needed in this file.
- `src/agents/auth-profiles/credential-state.test.ts` — remove the two ref-eligibility test cases. Inline-credential coverage remains.

### Docs

- `docs/reference/secretref-credential-surface.md` — drop the `auth-profiles.json` targets section. The remaining `remoteclaw.json` SecretRef surface is unchanged and accurate.
- `docs/auth-credential-semantics.md` — drop `tokenRef` resolution claims; note that auth-profile credentials are inline `key` / `token` only.
- `docs/cli/onboard.md` — clarify that `keyRef` references describe `models.providers.<id>.apiKey` env-ref onboarding, not auth-profile fields.
- `docs/start/wizard-cli-reference.md` — same clarification.

### What stays the same

- `SecretRef` type and resolvers (`src/secrets/resolve.ts`, `src/secrets/resolve-secret-input-string.ts`, `src/config/types.secrets.ts`) — alive and unchanged.
- All non-AgentRuntime SecretRef consumers (gateway pairing, LINE channel auth, browser extension relay auth, wizard onboarding for gateway/admin secrets, ACP CLI, doctor) — alive and unchanged.
- The `remoteclaw.json` SecretRef target surface (provider API keys, channel adapter secrets, plugin web-search keys, gateway auth, cron webhook tokens, etc.) — alive and unchanged.
- Plugin SDK `AuthProfileCredential` union (the `OAuthCredential` member is the only one used by plugins) — alive and unchanged.
- Auth-profile cooldown / rotation / round-robin logic — alive and unchanged.
- The two parallel auth-profile modules continue to coexist; reconciling them is a separate follow-up not in scope here.

### What this ADR does NOT do

- Does not add SecretRef resolution to the AgentRuntime spawn path.
- Does not change how operators provide provider credentials (they continue to set `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / etc. on the gateway process).
- Does not delete the `evaluateStoredCredentialEligibility` function or its test file (function remains for the inline-credential path; the orphan-caller status of `resolveAuthProfileEligibility` is noted but not addressed here — see Future considerations).
- Does not delete `src/agents/auth-profiles/` or merge it with `src/auth/`. Module reconciliation is a separate refactor.

## Future considerations

These are observations from this investigation, not commitments:

- **`resolveAuthProfileEligibility` orphan-caller status**: A grep returns zero non-test consumers for this function. After this gut lands, the dead-code class is even cleaner. A follow-up could remove `resolveAuthProfileEligibility` and `AuthProfileEligibilityReasonCode`. Not in scope here to keep this PR's blast radius minimal.
- **Module reconciliation (`src/auth/` vs `src/agents/auth-profiles/`)**: Two parallel modules with overlapping APIs is a maintenance tax. A future refactor could fold the legacy module's residual exports (constants, `OAuthCredential` type, cooldown helpers) into `src/auth/` and delete the directory. Not in scope here.
- **If operator demand for SecretRef-mediated auth profiles surfaces**: Path B becomes worth revisiting. The producer side (CLI / wizard surface to write refs) and the consumer side (resolution in `resolveApiKeyForProfile`) would need to be designed together. This ADR's evidence trail is the starting context for that design.

## References

- Issue [#2574](https://github.com/remoteclaw/remoteclaw/issues/2574) — this spike.
- Commit `c08a83429a` — `refactor(auth): relocate auth-profiles from src/agents/ to src/auth/ (#419)` — incomplete relocation that produced the decorative residue.
- `src/middleware/auth-key-retry.ts` — auth-rotation entry point.
- `src/auth/env-injection.ts` — env-var injection for CLI subprocess spawn.
- `src/auth/oauth.ts:resolveApiKeyForProfile` — credential read path; reads inline `key`/`token` only.
- [`docs/install/breaking-changes-from-openclaw.md`](/install/breaking-changes-from-openclaw) — fork removal contract context.
- [`docs/reference/secretref-credential-surface.md`](/reference/secretref-credential-surface) — canonical SecretRef target list (updated by this PR).
