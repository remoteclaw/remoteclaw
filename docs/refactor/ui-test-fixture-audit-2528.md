---
description: "Audit: UI test-layer for gutted-feature fixtures and mock shields (zero findings)"
read_when:
  - Extending the UI test suite with new fixtures referencing legacy subsystems
  - Reviewing whether #2336 Area 7/8 cleanup reached the UI test layer
  - Confirming the skills marketplace and thinking-level-state tokens are absent from UI tests
title: "UI test-layer fixture audit (#2528)"
---

# UI test-layer fixture audit (#2528)

**Type**: SPIKE — audit-only deliverable, no test modifications in this PR.
**Context**: Post-#2336 UI remnants audit, Area 8 extension into the UI test suite.
**Verdict**: **Zero findings.** No DEAD FIXTURE, no MOCK SHIELD, no LEGITIMATE hits — the target tokens are absent from every `ui/src/**/*.test.ts` file.

## Scope

Grep target tokens (narrowed by #2528 comment after #2544):

| Token                                              | Gutted subsystem                            |
| -------------------------------------------------- | ------------------------------------------- |
| `skills`, `Skills`, `agentSkills`                  | Skills marketplace                          |
| `autoAllowSkills`                                  | Skills-related exec-approvals toggle        |
| `thinkingLevel`, `chatThinkingLevel`, `thinkLevel` | Thinking-level state drivers (#2336 Area 7) |

Scope boundary: `plugin`, `Plugin`, `pluginId` were explicitly removed from the grep list after #2544 clarified that the plugin system is **kept**, not gutted (29 bundled plugins in `extensions/*`). Plugin-related fixtures are LEGITIMATE by default.

## Method

```bash
# Case-sensitive token grep
rg -n 'skills|Skills|agentSkills|autoAllowSkills|thinkingLevel|chatThinkingLevel|thinkLevel' \
   'ui/src' --glob '*.test.ts' --glob '*.test.tsx'

# Case-insensitive broader sweep (verifies casing variants)
rg -in 'skill|agentSkill|autoAllowSkills' 'ui/src'
rg -in 'thinkingLevel|chatThinkingLevel|thinkLevel' 'ui/src'
```

The audit ran against 48 test files under `ui/src/`. Both greps returned **zero matches**. As cross-verification, the case-insensitive sweep across the full `ui/src/` tree (production and tests) likewise returned zero matches for the exact target tokens, confirming prior gut sweeps removed the patterns at the source, not just in tests.

## Inventory

| #   | File      | Line | Token | Classification |
| --- | --------- | ---- | ----- | -------------- |
| —   | _(empty)_ | —    | —     | —              |

No hits. No rows.

## Cross-verification: recent gut sweeps

The clean result is consistent with the following merged sweeps, each of which explicitly purged the target tokens from the UI stack:

| PR                                            | Scope                                                        |
| --------------------------------------------- | ------------------------------------------------------------ |
| #2524 / #2535                                 | Removed `autoAllowSkills` from exec-approvals config         |
| #2536                                         | Stripped residual skills state + types + i18n                |
| #2539 / #2542                                 | Stripped residual `skills*` handlers/state/CSS               |
| #2480 (via `src/config/legacy.migrations.ts`) | `strip-thinking-level-fields` migration for persisted config |

The migration entry `strip-thinking-level-fields` (`src/config/legacy.migrations.ts:45`) confirms that even historical `thinkingDefault` / `subagents.thinking` / `hooks.mappings[].thinking` fields are actively scrubbed from user configs on load — no stale token surface remains in-stream either.

## Adjacent non-target references (LEGITIMATE, out of scope)

During the audit, the following UI-test references to the `thinking` root morpheme surfaced. **None match the target token list**; they are included here only to preempt "did you check these?" review questions.

| Reference                                                               | Location (example)                                                                               | Classification                                                                                                                                                                                      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<think>` / `<thinking>` tag stripping (`stripThinkingTags`)            | `ui/src/ui/format.test.ts:35-99`                                                                 | LEGITIMATE — pass-through display feature explicitly called out as KEEP in the issue body                                                                                                           |
| `extractThinking`, `extractThinkingCached` on Anthropic message blocks  | `ui/src/ui/chat/message-extract.test.ts:5-62`                                                    | LEGITIMATE — renders assistant `thinking` content from API response (pass-through display)                                                                                                          |
| `chatShowThinking` user-preference flag                                 | `ui/src/ui/app-settings.test.ts:13`, `storage.node.test.ts` (×8), `app-gateway.node.test.ts:105` | LEGITIMATE — UI toggle whether to render thinking blocks; does not drive thinking-level state, it drives display visibility                                                                         |
| `showThinking` view prop                                                | `ui/src/ui/views/chat.test.ts:20`                                                                | LEGITIMATE — propagates the above flag to the chat view                                                                                                                                             |
| `thinkingSuggestions` / `CRON_THINKING_SUGGESTIONS` / `payloadThinking` | `ui/src/ui/views/cron.test.ts` (×5), `ui/src/ui/controllers/cron.test.ts` (×6)                   | LEGITIMATE — live cron form feature; cron jobs can attach a `thinking` hint to agent-turn payloads, which the CLI runtime may honor. UI owns the form field + suggestion list; CLI owns resolution. |

All UI `vi.mock` call sites were inspected (15 files, enumerated via `rg 'vi\.mock' ui/src`). **None** target gutted modules — mocks replace live modules only: `device-identity.ts`, `gateway.ts`, `controllers/chat.ts`, `app-gateway.ts`, `app-settings.ts`, `app-polling.ts`, `app-scroll.ts`, `controllers/control-ui-bootstrap.ts`. There is no analog in UI to the `src/auto-reply/reply/get-reply.test-mocks.ts:39-40` `runPreparedReply` shield that motivated this spike.

## Production-code spot check (#2336 Area 7 follow-through)

Area 7 of #2336 called out four UI production files for per-file `thinkingLevel` classification:

| File                            | Current state                                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/ui/types.ts`            | Only match is `thinking?: string` at line 467 — Anthropic `thinking` message block type (pass-through display). No `thinkingLevel`. |
| `ui/src/ui/app-render.ts`       | Only match is `thinkingSuggestions: CRON_THINKING_SUGGESTIONS` at line 477 — live cron form suggestion list. No `thinkingLevel`.    |
| `ui/src/ui/views/chat.ts`       | No matches.                                                                                                                         |
| `ui/src/ui/controllers/chat.ts` | No matches.                                                                                                                         |

Area 7's UI portion is already complete.

## Acceptance criteria

- [x] Classified inventory — zero hits, zero rows; empty inventory is the finding
- [x] Follow-up issues opened per category — **none needed** (zero DEAD FIXTURE, zero MOCK SHIELD)

## No follow-up issues

Per the issue's deliverable clause:

> For MOCK SHIELD items, open a high-priority follow-up issue with specific integration tests to add (per #2336 Area 8 pattern). For DEAD FIXTURE items, open a cleanup issue or consolidate into one test-cleanup PR.

Zero MOCK SHIELD items ⇒ no integration-test follow-ups. Zero DEAD FIXTURE items ⇒ no cleanup PR. The prior gut sweeps (#2524, #2536, #2539, #2480) already completed both kinds of cleanup in the UI; this spike confirms there is no residual debt in the test layer.
