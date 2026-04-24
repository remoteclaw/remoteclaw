---
summary: "Spike audit of ui/ browser-local persisted state, classifying each field safe/fragile. Conclusion: zero fragility — `openclaw.*` keys are out of scope per the fork user-state boundary."
owner: "remoteclaw"
status: "final"
last_updated: "2026-04-24"
title: "UI Stored-Settings Audit"
---

# UI Stored-Settings Audit

## Context

Spike output for #2531. The control-UI persists state in browser `localStorage` and `sessionStorage`. This audit enumerates every persistence surface in `ui/src/**` and classifies each against the current type system.

**Scope boundary.** Per CLAUDE.md § Fork Context "User state boundary," `openclaw.*` persisted artifacts (from upstream OpenClaw or pre-rebrand RemoteClaw state) are NOT RemoteClaw legacy. No migration path is owed from them — the rebrand was a clean break. This audit therefore only considers `remoteclaw.*`-prefixed state written by shipped, post-rebrand RemoteClaw code.

Per-field methodology: for each storage key, (1) locate its reader/writer, (2) identify the validator or default-applier, (3) reason about what happens when a malformed value is present.

## Inventory

Eight distinct storage keys are read by the control UI. All use the `remoteclaw.*` prefix.

| #   | Key                                                                                       | Storage          | Reader                                                                                                 | Validation                                                                                                     | Classification                                                     |
| --- | ----------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1   | `remoteclaw.control.settings.v1`                                                          | `localStorage`   | [`ui/src/ui/storage.ts`](../../../ui/src/ui/storage.ts) `loadSettings()`                               | Field-by-field type check + default fallback                                                                   | **Safe** (self-cleaning)                                           |
| 2   | `remoteclaw.control.token.v1` and `remoteclaw.control.token.v1:{scope}`                   | `sessionStorage` | `ui/src/ui/storage.ts` `loadSessionToken()`                                                            | Trimmed string; legacy unscoped key explicitly removed on each read                                            | **Safe**                                                           |
| 3   | `remoteclaw.device.auth.v1`                                                               | `localStorage`   | [`ui/src/ui/device-auth.ts`](../../../ui/src/ui/device-auth.ts) `readStore()`                          | `parsed.version === 1`, `deviceId` is string, `tokens` is object — else `null`                                 | **Safe**                                                           |
| 4   | `remoteclaw-device-identity-v1`                                                           | `localStorage`   | [`ui/src/ui/device-identity.ts`](../../../ui/src/ui/device-identity.ts) `loadOrCreateDeviceIdentity()` | `parsed.version === 1`, `deviceId`/`publicKey`/`privateKey` are strings, fingerprint matches — else regenerate | **Safe**                                                           |
| 5   | `remoteclaw.i18n.locale`                                                                  | `localStorage`   | [`ui/src/i18n/lib/translate.ts`](../../../ui/src/i18n/lib/translate.ts) `readStoredLocale()`           | `isSupportedLocale()`; unsupported values ignored, navigator fallback                                          | **Safe**                                                           |
| 6   | `remoteclaw:pinned:{sessionKey}`                                                          | `localStorage`   | [`ui/src/ui/chat/pinned-messages.ts`](../../../ui/src/ui/chat/pinned-messages.ts) `load()`             | Array, filtered to numeric values                                                                              | **Safe**                                                           |
| 7   | `remoteclaw:deleted:{sessionKey}`                                                         | `localStorage`   | [`ui/src/ui/chat/deleted-messages.ts`](../../../ui/src/ui/chat/deleted-messages.ts) `load()`           | Array, filtered to string values                                                                               | **Safe**                                                           |
| 8   | Pre-boot theme read (no dedicated key; scans for `remoteclaw.control.settings.v1` prefix) | `localStorage`   | [`ui/public/theme-boot.js`](../../../ui/public/theme-boot.js) IIFE                                     | `s.theme` ∈ `{claw, knot, dash}`, `s.themeMode` ∈ `{system, light, dark}`, plus LEGACY mapping                 | **Code hygiene — dead OpenClaw multi-theme logic** (see Finding 2) |

Every `remoteclaw.*` key has defensive validation on read and silently degrades on malformed input. None of these keys produce an unrecoverable runtime state when fed an unexpected value.

**No fragility exists within scope.** The `openclaw.*`-prefixed artifacts that earlier spike drafts flagged as a "migration gap" are out of scope per the fork user-state boundary (see CLAUDE.md § Fork Context and Finding 1 below).

## Findings

### Finding 1 — `openclaw.*` localStorage artifacts are out of scope (non-finding).

**Severity: None** — misframed in the initial spike draft; corrected here.

**The premise is invalid.** Earlier drafts of this audit flagged the rebrand commit [`c7c81fe8ce`](https://github.com/remoteclaw/remoteclaw/commit/c7c81fe8ce73bb9e99dad0d3c8397b90cea8a52f) renaming every `openclaw.*` localStorage key to `remoteclaw.*` as a "missing migration shim," with Finding 1 proposing a bootstrap-time copy-and-delete. That framing assumed `openclaw.*` artifacts are RemoteClaw's legacy state. They are not.

Per CLAUDE.md § Fork Context "User state boundary":

> Users of upstream OpenClaw or pre-rebrand RemoteClaw are not RemoteClaw users — their persisted state (`openclaw.*` localStorage keys, config files, stored preferences, URL schemes, any artifact touched by the rebrand) is NOT RemoteClaw legacy. No migration path is owed; do not open issues proposing one. […] The rebrand was a clean break, not a backward-compat lapse.

Under that boundary, the five `openclaw.*` prefixes named in earlier drafts — `openclaw.control.settings.v1`, `openclaw.device.auth.v1`, `openclaw-device-identity-v1`, `openclaw.i18n.locale`, `openclaw.control.token.v1` (+ scoped variant) — are out of scope for this spike. No follow-up migration issue. No bootstrap shim.

**Historical note**: a follow-up issue (#2546) was opened under the flawed premise and subsequently closed as invalid. This correction is recorded in PR #2553 and accompanies the addition of the explicit boundary rule to CLAUDE.md.

**Status within audit scope**: with `openclaw.*` out of scope, the classified `remoteclaw.*` inventory above has zero fragile entries. Seven keys are safe (field-level validators with default fallbacks); key #8 — the pre-boot theme script — is code hygiene only, captured in Finding 2.

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

Conclusion: three of the four items flagged by the original spike brief do not interact with stored settings, and the fourth (`openclaw.*` prefix migration, Finding 1) is out of scope per the fork user-state boundary.

## Proposal

**No follow-up migration issue needed.** Finding 1 is a non-finding per the fork user-state boundary. No `remoteclaw.*` key in the inventory is fragile.

Finding 2 (theme-boot.js simplification) is an optional low-priority code hygiene cleanup — no dedicated issue is required; it can be rolled into any broader post-sync boot-sequence cleanup whenever convenient.

Finding 3 is intended behavior (no action).

## AC (this spike)

- [x] Classified stored-settings inventory produced — see § Inventory (eight keys, seven safe, one dead-code).
- [x] Migration strategy documented per fragile field — zero fragile fields within the fork user-state boundary (see Finding 1 non-finding). Finding 2 is code hygiene, not data fragility.
- [x] Follow-up implementation issue — none needed; closed as invalid (#2546).

## Related

- Parent audit scope: #2336 (post-gut UI remnants sweep)
- Fork user-state boundary rule (primary authority): CLAUDE.md § Fork Context, added in PR #2553
- Closed-invalid follow-up under the flawed premise: #2546
- Rebrand commit that renamed the prefixes cleanly: [`c7c81fe8ce`](https://github.com/remoteclaw/remoteclaw/commit/c7c81fe8ce73bb9e99dad0d3c8397b90cea8a52f)
- Theme-boot externalization (context for Finding 2): [`7c1c59e24d`](https://github.com/remoteclaw/remoteclaw/commit/7c1c59e24d)
- Sibling spike pattern (comment-delivered audit): #2526
