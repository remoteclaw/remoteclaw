---
title: "Sync Cat C cluster C3 — src/browser/ Registry-Sync Disposition (#2589)"
description: "Per-file disposition for 15 upstream src/browser/ files in Cat C cluster C3 — all 15 EXCLUDE-GUT. 8 registry-confirmed (chrome-mcp / Playwright / existing-session subsystems), 7 new EXCLUDE-GUT rows added after per-file inspection of the PROTECTED dir."
read_when:
  - Reviewing or closing #2589 (Cat C cluster C3 sync of v2026.3.22)
  - Looking up why a Pi/Playwright-era src/browser/ file or its tests were not adopted
  - Triaging future upstream src/browser/ additions touching profile capabilities, snapshot plan, runtime lifecycle, or pw-* test mocks
  - Cross-referencing per-cluster registry-sync precedent for the v2026.3.22 backlog
---

# Sync Cat C cluster C3 — `src/browser/` Registry-Sync Disposition (#2589)

**Issue**: #2589 — Process Cat C cluster C3 (src/browser/, 15 files) — registry-sync + per-file inspection (PROTECTED dir)
**Parent**: #2578 (Cat C decomposition)
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-26

## Summary

All 15 upstream files in Cat C cluster C3 (`src/browser/` — fork-only CDP browser-automation server, PROTECTED dir) are dispositioned **EXCLUDE-GUT** — none are cherry-picked into the fork.

- **8 of 15**: registry-confirmed (entries already present in `hq/upstream/disposition.tsv` from earlier waves; this issue verifies wording is current and audit-resolves them).
- **7 of 15**: new EXCLUDE-GUT rows added to `hq/upstream/disposition.tsv` after per-file inspection of upstream content vs fork's existing `src/browser/` surface. Each new row references the gutted subsystem(s) it depends on.

The directory carries the `PROTECTED src/browser/` rule — fork's CDP browser server is divergent from upstream's Playwright-based architecture (Playwright was gutted by `1aae7daa00` (#2304); chrome-mcp existing-session driver was gutted; pw-ai/pw-ai-state were gutted alongside Playwright). New upstream files in `src/browser/` are evaluated per-file against fork divergence; B9/B10 added a small set of file-level `INCLUDE` overrides (request-policy, snapshot-roles, url-pattern, routes/test-helpers) that survive the PROTECTED rule.

## Per-file disposition

| #   | Path                                                    | Disposition | Source                      | Rationale                                                                                                                                                                           |
| --- | ------------------------------------------------------- | ----------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/browser/chrome-mcp.test.ts`                        | EXCLUDE-GUT | registry                    | gutted: chrome-mcp production uses SnapshotAriaNode/errors/pw-role-snapshot not available in fork                                                                                   |
| 2   | `src/browser/chrome-mcp.ts`                             | EXCLUDE-GUT | registry                    | gutted: chrome-mcp production uses SnapshotAriaNode/errors/pw-role-snapshot not available in fork                                                                                   |
| 3   | `src/browser/chrome.launch-args.test.ts`                | EXCLUDE-GUT | registry                    | area-gutted by 1aae7daa00: chrome.ts removed (#2304)                                                                                                                                |
| 4   | `src/browser/errors.ts`                                 | EXCLUDE-GUT | per-file inspection (#2589) | Fork uses divergent inline error pattern (`mapTabError` in server-context.ts) and per-route status codes; upstream `BrowserError` class hierarchy not adopted.                      |
| 5   | `src/browser/profile-capabilities.ts`                   | EXCLUDE-GUT | per-file inspection (#2589) | Depends on Playwright (gutted by 1aae7daa00 #2304) and chrome-mcp existing-session driver (gutted); fork's snapshot logic lives in `src/agents/tools/browser-tool.actions.ts`.      |
| 6   | `src/browser/proxy-files.test.ts`                       | EXCLUDE-GUT | registry                    | area-gutted by 1aae7daa00: proxy-files.ts removed (#2304); b10-cleanup step 5                                                                                                       |
| 7   | `src/browser/pw-session.mock-setup.ts`                  | EXCLUDE-GUT | per-file inspection (#2589) | Vitest mocks for `playwright-core` (Playwright gutted) and `./chrome.js` (removed by 1aae7daa00 #2304).                                                                             |
| 8   | `src/browser/pw-tools-core.interactions.batch.test.ts`  | EXCLUDE-GUT | registry                    | gutted: references upstream pw-tools-core.interactions module                                                                                                                       |
| 9   | `src/browser/routes/agent.existing-session.test.ts`     | EXCLUDE-GUT | registry                    | gutted: existing-session test relies on upstream session-reset-service                                                                                                              |
| 10  | `src/browser/routes/agent.snapshot.plan.test.ts`        | EXCLUDE-GUT | per-file inspection (#2589) | Tests for `routes/agent.snapshot.plan.ts` (EXCLUDE-GUT).                                                                                                                            |
| 11  | `src/browser/routes/agent.snapshot.plan.ts`             | EXCLUDE-GUT | per-file inspection (#2589) | Depends on `profile-capabilities.ts` (EXCLUDE-GUT) and Playwright AI snapshot (gutted); fork has divergent tool-layer snapshot logic in `src/agents/tools/browser-tool.actions.ts`. |
| 12  | `src/browser/routes/basic.existing-session.test.ts`     | EXCLUDE-GUT | registry                    | gutted: existing-session test relies on upstream session-reset-service                                                                                                              |
| 13  | `src/browser/runtime-lifecycle.ts`                      | EXCLUDE-GUT | per-file inspection (#2589) | Imports `./pw-ai-state.js` and `./pw-ai.js` (Playwright gutted by 1aae7daa00 #2304); fork's `server.ts` calls `server-lifecycle` directly.                                          |
| 14  | `src/browser/server-context.existing-session.test.ts`   | EXCLUDE-GUT | registry                    | gutted: existing-session test relies on upstream session-reset-service                                                                                                              |
| 15  | `src/browser/server-context.loopback-direct-ws.test.ts` | EXCLUDE-GUT | per-file inspection (#2589) | Depends on `server-context.remote-tab-ops.harness.ts` (not in fork); fork has divergent CDP server tests.                                                                           |

All 15 entries map to file-level rows in `hq/upstream/disposition.tsv` (sibling-of-repo registry, not in git). The 7 new rows are appended at the end of the registry alongside the prior Cat C C2 wave additions for `src/agents/`.

## Disposition class breakdown

The 15 EXCLUDE-GUT verdicts partition cleanly across five gutted/divergent subsystems — each file assigned to exactly one class:

| Gutted subsystem                                                              | Files | Member files                                                                                                                                                       | Removal / divergence reference                                                                                                                                               |
| ----------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright automation (chrome.ts, pw-ai\*, pw-tools-core, pw-session helpers) |     5 | `chrome.launch-args.test.ts`, `proxy-files.test.ts`, `pw-session.mock-setup.ts`, `pw-tools-core.interactions.batch.test.ts`, `runtime-lifecycle.ts`                | `1aae7daa00 gut(browser): remove Playwright automation framework (#2304)`                                                                                                    |
| chrome-mcp existing-session driver                                            |     5 | `chrome-mcp.test.ts`, `chrome-mcp.ts`, `routes/agent.existing-session.test.ts`, `routes/basic.existing-session.test.ts`, `server-context.existing-session.test.ts` | gutted alongside session-reset-service; existing-session paths fail closed in fork                                                                                           |
| Profile-capabilities / snapshot-plan abstraction                              |     3 | `profile-capabilities.ts`, `routes/agent.snapshot.plan.ts`, `routes/agent.snapshot.plan.test.ts`                                                                   | Fork's snapshot logic lives in `src/agents/tools/browser-tool.actions.ts` (tool layer), not `src/browser/routes/` (route layer)                                              |
| Divergent error pattern                                                       |     1 | `errors.ts`                                                                                                                                                        | Fork uses inline `throw new Error(...)` + `mapTabError` (`server-context.ts:484-502`); upstream's `BrowserError` class hierarchy not adopted                                 |
| Divergent CDP server-context test harness                                     |     1 | `server-context.loopback-direct-ws.test.ts`                                                                                                                        | Imports `server-context.remote-tab-ops.harness.ts` (not in fork); fork's `server-context.ts` is monolithic, no `{availability,reset,selection,remote-tab-ops}` decomposition |

Total: 5 + 5 + 3 + 1 + 1 = 15.

## The 7 new dispositions — per-file inspection notes

Each upstream file at `v2026.3.22` was read in full and cross-referenced against fork's `src/browser/` surface and dependent modules.

### `errors.ts` (82 lines)

Defines `BrowserError`, `BrowserValidationError`, `BrowserConfigurationError`, `BrowserTargetAmbiguousError`, `BrowserTabNotFoundError`, `BrowserProfileNotFoundError`, `BrowserConflictError`, `BrowserResetUnsupportedError`, `BrowserProfileUnavailableError`, `BrowserResourceExhaustedError`, plus `toBrowserErrorResponse(err)` for HTTP mapping.

Imports (`../infra/net/ssrf.js`, `./navigation-guard.js`) exist in fork. But no fork file imports any of the `BrowserError` symbols, and the upstream consumers that exist in fork (`server-context.ts`, `profiles-service.ts`, `routes/basic.ts`, `routes/tabs.ts`) all use a different error pattern: inline `throw new Error("message")` plus a local `mapTabError(err)` function in `server-context.ts:484-502` that maps `SsrFBlockedError`, `InvalidBrowserNavigationUrlError`, and string-matched messages (`"ambiguous target id prefix"`, `"tab not found"`, `"not found"`) to status codes.

Cherry-picking `errors.ts` would introduce a parallel error abstraction with no consumers — dead code unless we also migrate the routes. The fork's pattern is internally consistent and has been live since the Playwright gut; switching it is a separate refactor outside the C3 sync scope. **Disposition: EXCLUDE-GUT.**

### `profile-capabilities.ts` (93 lines)

Defines `BrowserProfileMode` (`"local-managed" | "local-existing-session" | "remote-cdp"`), `BrowserProfileCapabilities`, `getBrowserProfileCapabilities`, `resolveDefaultSnapshotFormat`, `shouldUsePlaywrightForScreenshot`, `shouldUsePlaywrightForAriaSnapshot`.

Three of the three modes (`local-existing-session` chrome-mcp driver, Playwright managed mode, Playwright remote CDP) reference subsystems gutted in fork. The snapshot-format resolution returns `"ai"` only when a Playwright path or chrome-mcp existing-session is wired up — neither exists in fork.

Fork's snapshot path lives in `src/agents/tools/browser-tool.actions.ts` (tool-layer), where it makes its own `"ai" | "aria"` decision based on the agent context, not the browser profile. The upstream profile-capabilities module is the wrong layer for fork's architecture. **Disposition: EXCLUDE-GUT.**

### `pw-session.mock-setup.ts` (15 lines)

Vitest mock setup that mocks `playwright-core` (`chromium.connectOverCDP`) and `./chrome.js` (`getChromeWebSocketUrl`). Both targets are gutted in fork — Playwright was removed by `1aae7daa00` (#2304) and `chrome.ts` was removed in the same commit. No fork test imports this mock-setup file. **Disposition: EXCLUDE-GUT.**

### `runtime-lifecycle.ts` (60 lines)

Wraps `server-lifecycle.ts` with two extra steps: it imports `isPwAiLoaded` from `./pw-ai-state.js` and dynamically imports `./pw-ai.js` to call `closePlaywrightBrowserConnection()` during shutdown. Both `pw-ai-state.ts` and `pw-ai.ts` are gutted in fork (Playwright gone). The wrapper functions `createBrowserRuntimeState` and `stopBrowserRuntime` have no fork callers; fork's `server.ts:9-10, 83, 99` imports `ensureExtensionRelayForProfiles` and `stopKnownBrowserProfiles` from `server-lifecycle.ts` directly, skipping the Playwright-aware indirection entirely. **Disposition: EXCLUDE-GUT.**

### `routes/agent.snapshot.plan.ts` + `routes/agent.snapshot.plan.test.ts`

`agent.snapshot.plan.ts` (97 lines) is a route-layer snapshot plan resolver. Imports `profile-capabilities.ts` (EXCLUDE-GUT, see above), `../config.js` (in fork), `../constants.js` (in fork — fork retains `DEFAULT_AI_SNAPSHOT_*` constants used by `src/agents/tools/browser-tool.actions.ts`), and `./utils.js` (in fork). The returned plan's `format: "ai" | "aria"` distinction depends on Playwright availability, which doesn't exist in fork.

Fork has a different snapshot architecture: the snapshot plan is computed in the **tool layer** (`src/agents/tools/browser-tool.actions.ts`), not the **route layer** (`src/browser/routes/`). Cherry-picking would create a parallel abstraction at the wrong layer. The test file (38 lines) tests `resolveSnapshotPlan` and is dead without its target. **Both disposition: EXCLUDE-GUT.**

### `server-context.loopback-direct-ws.test.ts` (142 lines)

Tests "loopback direct WebSocket" CDP profiles by stubbing `cdpModule.createTargetViaCdp` and a `fetch` mock that responds to `/json/list`, `/json/activate`, `/json/close` endpoints. Imports `./server-context.remote-tab-ops.harness.js` — a test harness that does NOT exist in fork. The harness is part of upstream's broader `server-context.{availability,reset,selection,remote-tab-ops}.ts` decomposition, none of which exists in fork (fork's `server-context.ts` is monolithic).

Fork has its own server-context test surface (`server-context.ensure-tab-available.prefers-last-target.test.ts`, `server-context.cdp-test-harness.ts`, `server-context.hot-reload-profiles.test.ts`, `server.auth-fail-closed.test.ts`, `server.post-tabs-open-profile-unknown-returns-404.test.ts`, etc.) covering the loopback CDP behaviors it cares about. **Disposition: EXCLUDE-GUT.**

## Why no KEEP / EXTRACT in this cluster

The PROTECTED rule on `src/browser/` exists because fork and upstream architectures diverged sharply when Playwright was gutted (#2304). Cherry-picking from upstream into fork-owned territory has to clear two bars:

1. **Dependency bar**: All transitive dependencies must be live in fork or pickable.
2. **Architectural fit bar**: The cherry-pick must not create a parallel abstraction or a layering inversion.

The 7 new files all fail at least one of these bars:

- `errors.ts`: passes (1) but fails (2) — parallel error abstraction with no consumers.
- `profile-capabilities.ts`: fails (1) — Playwright + chrome-mcp existing-session deps gutted.
- `pw-session.mock-setup.ts`: fails (1) — mocks gutted modules.
- `runtime-lifecycle.ts`: fails (1) — pw-ai\* deps gutted.
- `routes/agent.snapshot.plan.{ts,test.ts}`: fails both (1) (Playwright) and (2) (route-layer vs fork's tool-layer snapshot).
- `server-context.loopback-direct-ws.test.ts`: fails (1) — `server-context.remote-tab-ops.harness.ts` not in fork.

EXTRACT (write a divergence record) is the right disposition only when fork has a closely-paired divergent variant of the same file (e.g., `apps/macos/Sources/OpenClaw/SessionsSettings.swift` per Cat A C2 #2583). Here, fork has no `errors.ts`, no `profile-capabilities.ts`, no `runtime-lifecycle.ts`, no `routes/agent.snapshot.plan.ts`, and no equivalent test files — there is nothing to "extract" against. EXCLUDE-GUT (with rationale tying back to gutted upstream subsystems and divergent fork architecture) is the precise classification.

## Audit verification

Programmatic verification against `hq/upstream/disposition.tsv` (post-update) using `hq/scripts/classify.py`:

- **Total expected**: 15
- **Found**: 15/15 → EXCLUDE-GUT (action) / EXCLUDE (bucket)
- **Missing**: 0/15
- **DIFFER** (rationale mismatch vs cluster TSV, registry-confirmed set): 0/8
- **New rows added**: 7/7 (registry lines 4572-4578)
- **UNKNOWNS**: 0
- **COLLISIONS** (PROTECTED dir vs file-level overlay): 0

Bulk audit residual for Cat C cluster C3 against `v2026.3.22`: **0**.

## Out of scope

- Other Cat C clusters: C1 (#2587 — closed, see PR #2599), C2 (#2588 — closed, see PR #2600), C4 (#2590), C5 (#2591), C6 (#2592), C7 (#2593), C8 (#2594) — separate per-cluster issues.
- Cat A waves (#2582-#2585) — closed, see PRs #2595-#2598.
- Cat B (#2577) — closed, see PR #2586.
- B11 sync batch (`v2026.3.22 → v2026.4.19-beta.2`) — scheduled after Cat A/B/C close.
- Migrating fork's inline error pattern to a class hierarchy (would unblock cherry-picking `errors.ts` later) — separate refactor, not in scope here.
- Migrating fork's snapshot-plan logic from tool layer to route layer (would unblock cherry-picking `routes/agent.snapshot.plan.ts`) — separate refactor, not in scope here.
