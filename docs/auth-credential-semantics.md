---
title: "Auth Credential Semantics"
summary: "Canonical credential eligibility and resolution semantics for auth profiles"
read_when:
  - Working on auth profile resolution or credential routing
  - Debugging model auth failures or profile order
---

# Auth Credential Semantics

This document defines the canonical credential eligibility and resolution semantics used across:

- `resolveAuthProfileOrder`
- `resolveApiKeyForProfile`
- `models status --probe`
- `doctor-auth`

The goal is to keep selection-time and runtime behavior aligned.

## Stable Reason Codes

- `ok`
- `missing_credential`
- `invalid_expires`
- `expired`

## Token Credentials

Token credentials (`type: "token"`) carry an inline `token` string.

### Eligibility rules

1. A token profile is ineligible when `token` is absent or empty.
2. `expires` is optional.
3. If `expires` is present, it must be a finite number greater than `0`.
4. If `expires` is invalid (`NaN`, `0`, negative, non-finite, or wrong type), the profile is ineligible with `invalid_expires`.
5. If `expires` is in the past, the profile is ineligible with `expired`.

### Resolution rules

1. Resolver semantics match eligibility semantics for `expires`.
2. Token material is read inline from `cred.token`. SecretRef indirection is not part of the
   AgentRuntime credential injection path — see
   [`docs/refactor/agentruntime-credential-injection.md`](/refactor/agentruntime-credential-injection) (#2574).

## OAuth SecretRef Policy Guard

- SecretRef input is for static credentials only.
- If a profile credential is `type: "oauth"`, SecretRef objects are not supported for that profile credential material.
- If `auth.profiles.<id>.mode` is `"oauth"`, SecretRef-backed `keyRef`/`tokenRef` input for that profile is rejected.
- Violations are hard failures in startup/reload auth resolution paths.

## Legacy-Compatible Messaging

For script compatibility, probe errors keep this first line unchanged:

`Auth profile credentials are missing or expired.`

Human-friendly detail and stable reason codes may be added on subsequent lines.
