---
title: "Sync Cat C cluster C2 — src/agents/ Registry-Sync Disposition (#2588)"
description: "Per-file disposition for 17 upstream src/agents/ files in Cat C cluster C2 — all 17 EXCLUDE-GUT (Pi-era execution engine + model-provider catalog, both gutted). 5 registry-confirmed, 12 new EXCLUDE-GUT rows added."
read_when:
  - Reviewing or closing #2588 (Cat C cluster C2 sync of v2026.3.22)
  - Looking up why a Pi-era src/agents/ file or a provider-catalog file was not adopted
  - Triaging future upstream src/agents/ additions touching Pi-era subsystems or provider catalog
  - Cross-referencing per-cluster registry-sync precedent for the v2026.3.22 backlog
---

# Sync Cat C cluster C2 — `src/agents/` Registry-Sync Disposition (#2588)

**Issue**: #2588 — Process Cat C cluster C2 (src/agents/, 17 files) — registry-sync (Pi-era + provider catalog)
**Parent**: #2578 (Cat C decomposition)
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-26

## Summary

All 17 upstream files in Cat C cluster C2 (`src/agents/` — Pi-era execution engine + model-provider catalog) are dispositioned **EXCLUDE-GUT** — none are cherry-picked into the fork.

- **5 of 17**: registry-confirmed (entries already present in `hq/upstream/disposition.tsv` from earlier waves; this issue verifies wording is current and audit-resolves them).
- **12 of 17**: new EXCLUDE-GUT rows added to `hq/upstream/disposition.tsv` with per-file rationale referencing the gutted subsystems (Pi-era execution engine per `engineering/decisions/0001-agent-runtime-interface.md`; model-provider catalog per Middleware Boundary).

No file content matches the fork's `src/agents/` surface — fork replaced the Pi-based orchestrator with **AgentRuntime** (`AgentRuntime.execute(params): AsyncIterable<AgentEvent>`), and CLI agents (Claude, Gemini, Codex, OpenCode) self-manage providers, model selection, context pruning, memory, and tool bundling. None of the 17 upstream files have a fork analog.

## Per-file disposition

| #   | Path                                                           | Disposition | Source      | Rationale                                                                                                                                 |
| --- | -------------------------------------------------------------- | ----------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/agents/bedrock-discovery.ts`                              | EXCLUDE-GUT | new (#2588) | AWS Bedrock model discovery — model-provider catalog gutted                                                                               |
| 2   | `src/agents/cloudflare-ai-gateway.ts`                          | EXCLUDE-GUT | new (#2588) | Cloudflare AI Gateway provider — model-provider catalog gutted                                                                            |
| 3   | `src/agents/huggingface-models.ts`                             | EXCLUDE-GUT | registry    | stub: HuggingFace model catalog (empty arrays) — no live callers, candidate for GUT                                                       |
| 4   | `src/agents/model-compat.ts`                                   | EXCLUDE-GUT | registry    | gutted: model compat layer — CLI agents self-manage                                                                                       |
| 5   | `src/agents/pi-bundle-mcp-tools.test.ts`                       | EXCLUDE-GUT | new (#2588) | test for Pi MCP tool bundling — Pi-era execution engine gutted                                                                            |
| 6   | `src/agents/pi-embedded-helpers/turns.ts`                      | EXCLUDE-GUT | new (#2588) | Pi embedded turn helpers — Pi-era execution engine gutted; fork uses `src/agents/agent-helpers/` (existing EXTRACT rule on the directory) |
| 7   | `src/agents/pi-embedded-messaging.ts`                          | EXCLUDE-GUT | registry    | gutted: Pi embedded messaging — replaced by ChannelBridge                                                                                 |
| 8   | `src/agents/pi-extensions/compaction-safeguard.test.ts`        | EXCLUDE-GUT | registry    | gutted: test for Pi compaction safeguard                                                                                                  |
| 9   | `src/agents/pi-extensions/context-pruning.test.ts`             | EXCLUDE-GUT | registry    | gutted: test for Pi context pruning                                                                                                       |
| 10  | `src/agents/pi-extensions/context-pruning.ts`                  | EXCLUDE-GUT | new (#2588) | Pi context-pruning extension barrel — Pi-era engine gutted                                                                                |
| 11  | `src/agents/pi-extensions/context-pruning/extension.ts`        | EXCLUDE-GUT | new (#2588) | Pi context-pruning extension definition — Pi-era engine gutted                                                                            |
| 12  | `src/agents/pi-extensions/context-pruning/pruner.ts`           | EXCLUDE-GUT | new (#2588) | Pi context-pruning core — Pi-era engine gutted                                                                                            |
| 13  | `src/agents/pi-extensions/context-pruning/runtime.ts`          | EXCLUDE-GUT | new (#2588) | Pi context-pruning runtime state — Pi-era engine gutted                                                                                   |
| 14  | `src/agents/pi-extensions/context-pruning/settings.ts`         | EXCLUDE-GUT | new (#2588) | Pi context-pruning settings schema — Pi-era engine gutted                                                                                 |
| 15  | `src/agents/pi-extensions/context-pruning/tools.ts`            | EXCLUDE-GUT | new (#2588) | Pi context-pruning tool wiring — Pi-era engine gutted                                                                                     |
| 16  | `src/agents/pi-extensions/session-manager-runtime-registry.ts` | EXCLUDE-GUT | new (#2588) | Pi session-manager runtime registry — Pi-era engine gutted                                                                                |
| 17  | `src/agents/tools/memory-tool.runtime.ts`                      | EXCLUDE-GUT | new (#2588) | memory tool runtime — memory subsystem gutted per Middleware Boundary                                                                     |

All 17 entries map to file-level rows in `hq/upstream/disposition.tsv` (sibling-of-repo registry, not in git). The 12 new rows are appended at the end of the registry alongside the prior Cat A wave additions for `apps/macos/Sources/OpenClaw/*.swift` (#2583).

## Disposition class breakdown

The 17 EXCLUDE-GUT verdicts fall into three subsystem classes — all gutted in fork:

| Subsystem               | Files | Why gutted in fork                                                                                    |
| ----------------------- | ----: | ----------------------------------------------------------------------------------------------------- |
| Pi-era execution engine |    13 | Replaced by AgentRuntime (CLI subprocess model). Per ADR `0001-agent-runtime-interface.md`.           |
| Model-provider catalog  |     4 | Removed per Middleware Boundary — CLI agents self-manage providers, model selection, gateway routing. |
| Memory subsystem        |     1 | Removed per Middleware Boundary — agents bring their own memory.                                      |

Pi-era execution engine breakdown (13 files):

- `pi-bundle-mcp-tools.test.ts` — Pi tool bundling test
- `pi-embedded-helpers/turns.ts` — Pi turn helpers
- `pi-embedded-messaging.ts` — Pi embedded messaging
- `pi-extensions/compaction-safeguard.test.ts` — compaction safeguard test
- `pi-extensions/context-pruning.test.ts` — context-pruning test
- `pi-extensions/context-pruning.ts` — context-pruning extension barrel
- `pi-extensions/context-pruning/{extension,pruner,runtime,settings,tools}.ts` — context-pruning module (5 files)
- `pi-extensions/session-manager-runtime-registry.ts` — Pi session-manager runtime registry

Model-provider catalog breakdown (4 files):

- `bedrock-discovery.ts` — AWS Bedrock model discovery
- `cloudflare-ai-gateway.ts` — Cloudflare AI Gateway provider
- `huggingface-models.ts` — HuggingFace model catalog (already a stub with empty arrays — candidate for full GUT)
- `model-compat.ts` — provider model compat layer

Memory subsystem (1 file):

- `tools/memory-tool.runtime.ts` — memory tool runtime, paired with already-gutted `tools/memory-tool.ts` and helpers

## Why no per-file inspection was needed

Unlike C1 (which had `docs/concepts/agent-loop.md` requiring per-file judgment), all 17 C2 paths fall into well-established gut classes already represented multiple times in the registry:

- `src/agents/pi-*` and `src/agents/pi-extensions/**` — Pi-era execution engine (13+ existing EXCLUDE-GUT rows already, e.g., `pi-tools.ts`, `pi-extensions/compaction-safeguard*.ts`, `pi-extensions/compaction-instructions*.ts`, `pi-embedded.ts`, `pi-embedded-runner/**`).
- `src/agents/tools/memory-tool.*` — memory subsystem (4 existing EXCLUDE-GUT rows already, including `memory-tool.ts`, `.test.ts`, `.test-helpers.ts`, `.citations.test.ts`).
- `src/agents/{bedrock,cloudflare,huggingface,model-compat}-*.ts` — model-provider catalog (multiple existing EXCLUDE-GUT rows for Ollama, OpenAI, Vertex, Kilocode, Venice, Vercel, Anthropic provider files).

Per-file inspection would only add noise — the disposition is mechanical given the established subsystem boundaries. Triage at `hq/upstream/pending-sync-review/2026-04-24-cat-c-triage.md` § C2 documents the pattern derivation.

## Audit verification

Programmatic verification against `hq/upstream/disposition.tsv` (post-update):

- **Total expected**: 17
- **Found**: 17/17
- **Missing**: 0/17
- **DIFFER** (rationale mismatch vs cluster TSV, registry-confirmed set): 0/5
- **New rows added**: 12/12

Bulk audit residual for Cat C cluster C2 against `v2026.3.22`: **0**.

## Out of scope

- Other Cat C clusters: C1 (#2587 — closed, see PR #2599), C3 (#2589), C4 (#2590), C5 (#2591), C6 (#2592), C7 (#2593), C8 (#2594) — separate per-cluster issues.
- Cat A waves (#2582-#2585) — closed, see PRs #2595-#2598.
- Cat B (#2577) — closed, see PR #2586.
- B11 sync batch (`v2026.3.22 → v2026.4.19-beta.2`) — scheduled after Cat A/B/C close.
- Full GUT of the `huggingface-models.ts` stub — tracked separately as a registry candidate (rationale already flagged "candidate for GUT").
