---
summary: "Spike audit of ui/ browser-local persisted state, classifying each field safe/fragile and proposing migration strategy for legacy openclaw.* keys"
owner: "remoteclaw"
status: "draft"
last_updated: "2026-04-24"
title: "UI Stored-Settings Legacy Migration Audit"
---

# UI Stored-Settings Legacy Migration Audit

## Context

Spike output for #2531. The control-UI persists state in browser `localStorage` and `sessionStorage`. Legacy users — anyone who ran upstream OpenClaw or a pre-rebrand RemoteClaw build — may have stored values keyed by `openclaw.*` prefixes or carry field shapes that predate the current type system. On load, code must either migrate, validate-and-reset, or silently drop.

This audit enumerates every persistence surface in `ui/src/**`, classifies each, and proposes a migration strategy for the one real fragility found.

Per-field methodology: for each storage key, (1) locate its reader/writer, (2) identify the validator or default-applier, (3) reason about what happens when a legacy or malformed value is present.

## Inventory

Eight distinct storage keys are read by the control UI. The fork owns the schemas; upstream OpenClaw owned an earlier `openclaw.*`-prefixed variant of the same schemas.

| #   | Key                                                                                       | Storage          | Reader                                                                                                 | Validation                                                                                                     | Classification                          |
| --- | ----------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | `remoteclaw.control.settings.v1`                                                          | `localStorage`   | [`ui/src/ui/storage.ts`](../../../ui/src/ui/storage.ts) `loadSettings()`                               | Field-by-field type check + default fallback                                                                   | **Safe** (self-cleaning)                |
| 2   | `remoteclaw.control.token.v1` and `remoteclaw.control.token.v1:{scope}`                   | `sessionStorage` | `ui/src/ui/storage.ts` `loadSessionToken()`                                                            | Trimmed string; legacy unscoped key explicitly removed on each read                                            | **Safe**                                |
| 3   | `remoteclaw.device.auth.v1`                                                               | `localStorage`   | [`ui/src/ui/device-auth.ts`](../../../ui/src/ui/device-auth.ts) `readStore()`                          | `parsed.version === 1`, `deviceId` is string, `tokens` is object — else `null`                                 | **Safe**                                |
| 4   | `remoteclaw-device-identity-v1`                                                           | `localStorage`   | [`ui/src/ui/device-identity.ts`](../../../ui/src/ui/device-identity.ts) `loadOrCreateDeviceIdentity()` | `parsed.version === 1`, `deviceId`/`publicKey`/`privateKey` are strings, fingerprint matches — else regenerate | **Safe**                                |
| 5   | `remoteclaw.i18n.locale`                                                                  | `localStorage`   | [`ui/src/i18n/lib/translate.ts`](../../../ui/src/i18n/lib/translate.ts) `readStoredLocale()`           | `isSupportedLocale()`; unsupported values ignored, navigator fallback                                          | **Safe**                                |
| 6   | `remoteclaw:pinned:{sessionKey}`                                                          | `localStorage`   | [`ui/src/ui/chat/pinned-messages.ts`](../../../ui/src/ui/chat/pinned-messages.ts) `load()`             | Array, filtered to numeric values                                                                              | **Safe**                                |
| 7   | `remoteclaw:deleted:{sessionKey}`                                                         | `localStorage`   | [`ui/src/ui/chat/deleted-messages.ts`](../../../ui/src/ui/chat/deleted-messages.ts) `load()`           | Array, filtered to string values                                                                               | **Safe**                                |
| 8   | Pre-boot theme read (no dedicated key; scans for `remoteclaw.control.settings.v1` prefix) | `localStorage`   | [`ui/public/theme-boot.js`](../../../ui/public/theme-boot.js) IIFE                                     | `s.theme` ∈ `{claw, knot, dash}`, `s.themeMode` ∈ `{system, light, dark}`, plus LEGACY mapping                 | **Fragile — dead code** (see Finding 2) |

Every `remoteclaw.*` key has defensive validation on read and silently degrades on malformed input. None of these keys produce an unrecoverable runtime state when fed a legacy value.

The one real fragility is NOT a broken validator — it is the absence of a migration from the pre-rebrand `openclaw.*` key prefix to the current `remoteclaw.*` prefix.

## Findings

### Finding 1 — No `openclaw.*` → `remoteclaw.*` migration. Silent reset on upgrade.

**Severity: High** for device-auth tokens; **Medium** for UI settings; **Low** for locale and device identity.

**Evidence.**

Commit [`c7c81fe8ce`](https://github.com/remoteclaw/remoteclaw/commit/c7c81fe8ce73bb9e99dad0d3c8397b90cea8a52f) ("rebrand: update UI layer from OpenClaw to RemoteClaw", merged 2026-03-03) renamed every `localStorage` key prefix across the UI layer without a migration shim:

- `openclaw.control.settings.v1` → `remoteclaw.control.settings.v1` ([`ui/src/ui/storage.ts`](../../../ui/src/ui/storage.ts):1)
- `openclaw.device.auth.v1` → `remoteclaw.device.auth.v1` ([`ui/src/ui/device-auth.ts`](../../../ui/src/ui/device-auth.ts):10)
- `openclaw-device-identity-v1` → `remoteclaw-device-identity-v1` ([`ui/src/ui/device-identity.ts`](../../../ui/src/ui/device-identity.ts):18)
- `openclaw.i18n.locale` → `remoteclaw.i18n.locale` ([`ui/src/i18n/lib/translate.ts`](../../../ui/src/i18n/lib/translate.ts):31)
- `openclaw.control.token.v1` and scoped variant — same pattern in `sessionStorage`

The commit message documents the rename; no code was added to copy old values under the new prefix, and no code was added to delete the old keys.

**Verification:**

```bash
grep -rn "openclaw" ui/src/ ui/public/
```

returns zero matches on `main` as of this audit. Nothing reads `openclaw.*` anywhere in the fork.

**Impact per key.**

| Key                            | Loss on upgrade                                                                            | User-visible effect                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `openclaw.control.settings.v1` | Gateway URL, theme, split ratio, nav collapse state, nav groups collapse map, session keys | User lands on defaults; must re-enter gateway URL and re-collapse/expand nav. Cosmetic-to-moderate friction.            |
| `openclaw.device.auth.v1`      | Per-device role-scoped auth tokens                                                         | **User must re-pair every previously paired device.** Highest-friction loss.                                            |
| `openclaw-device-identity-v1`  | Device's ed25519 keypair + deviceId                                                        | New identity generated; this device no longer matches any server-side pairing record, compounding the device-auth loss. |
| `openclaw.i18n.locale`         | Selected locale                                                                            | Reverts to navigator locale or default. Minor.                                                                          |
| `openclaw.control.token.v1`    | Gateway session token                                                                      | `sessionStorage` — already cleared on tab close, so impact is bounded to an open session straddling the upgrade. Minor. |

For device auth + identity combined, the user experience is indistinguishable from a fresh install: the paired-devices list appears empty on the server too (different device fingerprint), and every device pairing must be redone.

**Adversarial check.**

Could the `openclaw.*` keys have been cleaned up at a different layer — cookie-style expiry, service-worker cache purge, gateway-side key rewrite? No.

- `localStorage` has no expiry. Entries persist until explicitly removed.
- No service worker is registered for the control UI ([`ui/src/ui/app.ts`](../../../ui/src/ui/app.ts) has no `navigator.serviceWorker` registration).
- The gateway never touches client `localStorage`.

So any user who ran OpenClaw or pre-2026-03-03 RemoteClaw still carries the `openclaw.*` payload in their browser. That payload is inert (nothing reads it) but recoverable.

**Recommended strategy: explicit migration on first boot.**

Trade-offs considered:

| Strategy                                                                                                | Pros                                                   | Cons                                                                                                                                           | Verdict                         |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **Default-fallback** (current behavior)                                                                 | Zero code                                              | Silent data loss; users re-configure. High friction for device auth.                                                                           | Not acceptable for device auth. |
| **Explicit migration** (read `openclaw.*`, copy to `remoteclaw.*` if target empty, delete `openclaw.*`) | One-time recovery, zero recurring cost after migration | Bounded one-time code. Safe: each storage reader already validates defensively, so a corrupted old payload falls through to existing defaults. | **Recommended.**                |
| **Warn-and-reset**                                                                                      | User notified of loss                                  | Doesn't recover anything; strictly worse than migration for keys where shapes match.                                                           | Inferior.                       |
| **Dual-read** (read both keys forever, prefer new)                                                      | No delete step                                         | Permanent code debt; `openclaw.*` never cleaned; every reader gains a branch.                                                                  | Rejected (permanent tax).       |

The shapes match exactly — the rebrand was a prefix-only change, not a schema migration. Each `openclaw.*` payload, if it passes the existing `remoteclaw.*` validator, is byte-compatible. So explicit migration is a string-level rename with the existing validators as the safety net.

**Implementation sketch.**

A single migration module `ui/src/ui/legacy-migration.ts`, invoked once from the app bootstrap before any other `localStorage`/`sessionStorage` reader runs:

```text
const MIGRATIONS: Array<{ from: string; to: string; storage: "local" | "session" }> = [
  { from: "openclaw.control.settings.v1",    to: "remoteclaw.control.settings.v1",    storage: "local" },
  { from: "openclaw.device.auth.v1",          to: "remoteclaw.device.auth.v1",          storage: "local" },
  { from: "openclaw-device-identity-v1",      to: "remoteclaw-device-identity-v1",      storage: "local" },
  { from: "openclaw.i18n.locale",             to: "remoteclaw.i18n.locale",             storage: "local" },
  { from: "openclaw.control.token.v1",        to: "remoteclaw.control.token.v1",        storage: "session" },
  // token.v1:{scope} — iterate all keys with that prefix
];

export function runLegacyKeyMigration(): { migrated: number; skipped: number } { … }
```

Semantics per entry:

1. If target (`remoteclaw.*`) already has a value, leave target alone; delete source (`openclaw.*`). User already upgraded-and-reconfigured since upgrade; don't clobber their new state.
2. If target is empty and source has a value, copy source → target; delete source. One-time recovery.
3. If neither has a value, no-op.

Scoped-token keys (`openclaw.control.token.v1:{gateway-url}`) need a prefix scan — enumerate `sessionStorage` keys, rewrite the prefix.

Idempotent by construction — a second invocation finds no `openclaw.*` keys and is a no-op. Safe to run unconditionally at every boot.

**Where it should be invoked.** Earliest possible point in the UI boot sequence, before `storage.ts` / `translate.ts` / `device-auth.ts` / `device-identity.ts` initialize. The Lit element's constructor is too late because it runs after module top-level side effects. The natural home is either:

- In the pre-hydration IIFE ([`ui/public/theme-boot.js`](../../../ui/public/theme-boot.js)) — plain JS, already runs before module load. Keeps the migration synchronous-pre-paint, but mixes theme code with storage migration.
- In a new top-level bootstrap module imported first from the entry point. Cleaner separation; runs after theme-boot.js but before any other storage reader.

Recommended: new bootstrap module. Theme-boot.js already has one subtle job and doesn't need another (see Finding 2).

**Test plan.**

Two integration tests in `ui/src/ui/` using the existing `@vitest/browser-playwright` harness:

1. Seed `localStorage` with `openclaw.control.settings.v1 = {…}` + `openclaw.device.auth.v1 = {…}`. Mount the app. Assert migration: `remoteclaw.*` keys contain the same payloads, `openclaw.*` keys are gone.
2. Seed both `openclaw.*` AND `remoteclaw.*` for the same logical key, with different payloads. Mount. Assert: `remoteclaw.*` is preserved as-is, `openclaw.*` is deleted. (User already upgraded-and-reconfigured case.)

A third test should verify the migration is idempotent — run twice, both invocations succeed.

### Finding 2 — Pre-boot theme script carries dead OpenClaw multi-theme logic.

**Severity: Low** (code hygiene, not data fragility).

**Evidence.**

[`ui/public/theme-boot.js`](../../../ui/public/theme-boot.js) — the synchronous IIFE that sets `<html data-theme>` before the ESM bundle loads — contains:

- A `THEMES` allowlist of `{claw, knot, dash}` theme families.
- A `MODES` allowlist of `{system, light, dark}`.
- A `LEGACY` mapping for old theme identifiers `{dark, light, openknot, fieldmanual, clawdash, system}` → `{claw:dark, claw:light, knot:dark, dash:dark, dash:light, claw:system}`.
- Resolution that emits `data-theme` values like `"openknot"`, `"openknot-light"`, `"dash"`, `"dash-light"`, `"light"`, `"dark"`.

This is upstream OpenClaw's multi-theme system, externalized verbatim from the inline `<script>` in `ui/index.html` by commit [`7c1c59e24d`](https://github.com/remoteclaw/remoteclaw/commit/7c1c59e24d) ("externalize theme-flash IIFE — resolve CSP script-src 'self' block", 2026-04-23). The externalization deliberately preserved logic.

**Why it's dead in the fork:**

1. [`ui/src/ui/theme.ts`](../../../ui/src/ui/theme.ts):1 declares `type ThemeMode = "system" | "light" | "dark"`. The fork has one theme, three modes.
2. [`ui/src/ui/storage.ts`](../../../ui/src/ui/storage.ts):143–146 strictly validates `parsed.theme` against `"light" | "dark" | "system"` and defaults any other value to `"system"`. The fork never writes `claw`, `knot`, `dash`, or any legacy identifier.
3. [`ui/src/ui/app-settings.ts`](../../../ui/src/ui/app-settings.ts):272–280 (`applyResolvedTheme`) sets `root.dataset.theme = resolved` where `resolved ∈ {"light", "dark"}`. This is the post-hydration authority.
4. CSS: only `[data-theme="light"]` exists (`ui/src/styles/base.css:114`). No rule matches `[data-theme="openknot"]`, `[data-theme="dash"]`, `[data-theme="claw"]`, etc. — if the boot script emitted those values, the browser would fall back to the default (implicit `:root`) styling anyway.

The boot script IS correct for `remoteclaw.*` payloads containing `theme ∈ {light, dark, system}` — the `LEGACY` table happens to cover `"light" | "dark" | "system"` as aliases for `claw:light`/`claw:dark`/`claw:system`, so the IIFE resolves to `data-theme="light"` / `"dark"` by coincidence, which IS what the fork's CSS expects.

So the IIFE works by accident of the LEGACY table. If Finding 1's migration lands, payloads inherit the same three values as today, and the accident continues.

**Recommended strategy: simplify.**

The boot script should handle only `{light, dark, system}` directly. Full simplification would reduce `theme-boot.js` from 62 lines to ~20 lines by removing the `THEMES`, `MODES`, `LEGACY` tables and multi-theme resolution.

Not a migration risk — current payloads resolve identically under simplified logic. Pure code cleanup. Could be bundled with the #2536 / #2539 sweep series or filed as its own lightweight `gut(ui):` issue.

### Finding 3 — Silent drop of removed fields is working as intended (no action).

**Severity: None.** Documented for completeness.

The current `UiSettings` type has 10 fields (plus optional `locale`). Git history shows the following fields were present in `UiSettings` at some point and later removed:

- `useNewChatLayout` (Slack-style grouped messages, removed by upstream)
- `navWidth` (sidebar width slider, removed by upstream)
- `borderRadius` (appearance slider, removed by upstream)
- `chatShowToolCalls` (visibility toggle, removed)
- `token` (moved from `UiSettings` to `sessionStorage` via commit `01e9286589` "keep gateway tokens out of URL storage" and associated changes)

`loadSettings()` ([`ui/src/ui/storage.ts`](../../../ui/src/ui/storage.ts):117–166) constructs the return value field-by-field, reading only known keys. Any legacy field remains in the parsed JSON but is dropped from the `UiSettings` object. On the next `persistSettings()` call, the legacy field is not re-emitted to `localStorage` (the `PersistedUiSettings` type enumerates only current fields), and is effectively purged.

Upside: no migration code required for schema shrinkage.
Downside: legacy fields linger in `localStorage` until any setting change triggers re-persist. In practice this is the first `applySettings()` call, which happens on first mutation — the first theme toggle, the first nav collapse, the first gateway URL change. Many sessions.

**Verdict: leave alone.** The behavior is safe; forcing a write at boot to purge would be wasteful, and users with stable settings don't care about a few KB of dead keys in localStorage.

### Finding 4 — Non-findings: `agentsPanel`, plugin discriminator, session/agent state.

The issue flagged `settings.agentsPanel: "skills"` or `"tools"` as a suspected fragile field. Investigation found no such persistence:

- `agentsPanel` is declared on the `RemoteClawApp` class as `@state() agentsPanel: "overview" | "files" | "channels" | "cron" = "overview"` ([`ui/src/ui/app.ts`](../../../ui/src/ui/app.ts):222). Lit `@state()` is an in-memory reactive property, not a persisted field. It never reaches `localStorage`.
- The `UiSettings` type ([`ui/src/ui/storage.ts`](../../../ui/src/ui/storage.ts):11–23) does not include `agentsPanel`. `persistSettings()` does not write it.
- The `SettingsHost` interface ([`ui/src/ui/app-settings.ts`](../../../ui/src/ui/app-settings.ts):41–58) includes `agentsPanel` as an optional host property, but `applySettings()` does not read or persist it.
- Git history (`d65576be8a`, "remove dead Tools tab from Agents view", merged 2026-04-22) narrowed the `@state` literal type from five members (`"overview" | "files" | "tools" | "channels" | "cron"`) to four. The narrowing is sound because the field was never persisted; there is no stored value to break on type narrowing.

Similarly, the plugin discriminator (issue #2522/#2534) and session/agent state referencing removed providers were inspected and found to be non-persisted. These live in ephemeral app state and server-originated data, not in browser storage.

Conclusion: three of the four items flagged by the original spike brief do not interact with stored settings. The one real item — the `openclaw.*` prefix migration — is captured under Finding 1.

## Proposal

Open **one** follow-up issue implementing Finding 1:

- `fix(ui): migrate legacy openclaw.* localStorage keys to remoteclaw.* on boot`
- AC: each of the five known `openclaw.*` prefixes (including scoped token variants) is migrated; existing `remoteclaw.*` values are not overwritten; old keys are deleted; migration is idempotent; tests seeded with `openclaw.*` payloads produce identical `remoteclaw.*` outcomes; tests seeded with both prefer `remoteclaw.*`.
- Affects the same five files named in this audit, plus a new `ui/src/ui/legacy-migration.ts` module and its browser-mode tests.

Finding 2 (theme-boot.js simplification) and Finding 3 (no-op) do not require follow-up issues. Finding 2 can be rolled into any broader post-sync boot-sequence cleanup; Finding 3 is intended behavior.

## AC (this spike)

- [x] Classified stored-settings inventory produced — see § Inventory (eight keys, seven safe, one dead-code, migration fragility captured as Finding 1).
- [x] Migration strategy documented per fragile field — see Finding 1 (explicit migration with adversarial check and test plan) and Finding 2 (simplify dead code).
- [x] Follow-up implementation issue opened for Finding 1 — tracked separately, linked in the closing comment on #2531.

## Related

- Parent audit scope: #2336 (post-gut UI remnants sweep)
- Rebrand commit (root cause of Finding 1): [`c7c81fe8ce`](https://github.com/remoteclaw/remoteclaw/commit/c7c81fe8ce73bb9e99dad0d3c8397b90cea8a52f)
- Theme-boot externalization (externalized but did not modify Finding 2 logic): [`7c1c59e24d`](https://github.com/remoteclaw/remoteclaw/commit/7c1c59e24d)
- Sibling spike pattern (comment-delivered audit): #2526
