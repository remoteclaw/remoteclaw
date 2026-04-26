---
title: "Sync Cat C cluster C1 — docs/ Registry-Sync Disposition (#2587)"
description: "Per-file disposition for 19 upstream docs/ files in Cat C cluster C1 — 18 confirmed EXCLUDE-GUT (gutted-tool/skills docs already in registry) + 1 new EXCLUDE-GUT for docs/concepts/agent-loop.md (Pi-era loop, fork uses AgentRuntime)."
read_when:
  - Reviewing or closing #2587 (Cat C cluster C1 sync of v2026.3.22)
  - Looking up why upstream docs/concepts/agent-loop.md was not adopted
  - Triaging future upstream docs/ additions touching Pi-era subsystems
  - Cross-referencing per-cluster registry-sync precedent for the v2026.3.22 backlog
---

# Sync Cat C cluster C1 — `docs/` Registry-Sync Disposition (#2587)

**Issue**: #2587 — Process Cat C cluster C1 (docs/, 19 files) — registry-sync (gutted-tool/skills docs)
**Parent**: #2578 (Cat C decomposition)
**Sync target**: upstream `v2026.3.22`
**Date**: 2026-04-26

## Summary

All 19 upstream files in Cat C cluster C1 (`docs/concepts/` + `docs/tools/`) are dispositioned **EXCLUDE-GUT** — none are cherry-picked into the fork.

- **18 of 19**: registry-confirmed (entries already present in `hq/upstream/disposition.tsv` from earlier waves; this issue verifies wording is current and audit-resolves them).
- **1 of 19**: `docs/concepts/agent-loop.md` — newly resolved after per-file inspection. Decision: EXCLUDE-GUT.

## Per-file disposition

| #   | Path                                      | Disposition | Source                      | Rationale                                              |
| --- | ----------------------------------------- | ----------- | --------------------------- | ------------------------------------------------------ |
| 1   | `docs/concepts/agent-loop.md`             | EXCLUDE-GUT | per-file inspection (#2587) | New decision. See § The agent-loop.md decision.        |
| 2   | `docs/tools/btw.md`                       | EXCLUDE-GUT | registry                    | gutted: docs for btw tool — Pi-era agent tool          |
| 3   | `docs/tools/capability-cookbook.md`       | EXCLUDE-GUT | registry                    | gutted: docs for Pi-era tool capability guide          |
| 4   | `docs/tools/clawhub.md`                   | EXCLUDE-GUT | registry                    | gutted: docs for ClawHub marketplace                   |
| 5   | `docs/tools/creating-skills.md`           | EXCLUDE-GUT | registry                    | gutted: docs for creating skills — Pi-era skills       |
| 6   | `docs/tools/duckduckgo-search.md`         | EXCLUDE-GUT | registry                    | gutted: docs for DuckDuckGo search — web tools removed |
| 7   | `docs/tools/elevated.md`                  | EXCLUDE-GUT | registry                    | gutted: docs for elevated tools — Pi-era privilege     |
| 8   | `docs/tools/exa-search.md`                | EXCLUDE-GUT | registry                    | gutted: docs for Exa search — web tools removed        |
| 9   | `docs/tools/gemini-search.md`             | EXCLUDE-GUT | registry                    | gutted: docs for Gemini search — web tools removed     |
| 10  | `docs/tools/grok-search.md`               | EXCLUDE-GUT | registry                    | gutted: docs for Grok search — web tools removed       |
| 11  | `docs/tools/kimi-search.md`               | EXCLUDE-GUT | registry                    | gutted: docs for Kimi search — web tools removed       |
| 12  | `docs/tools/lobster.md`                   | EXCLUDE-GUT | registry                    | gutted: docs for Lobster tool — Pi-era agent tool      |
| 13  | `docs/tools/multi-agent-sandbox-tools.md` | EXCLUDE-GUT | registry                    | gutted: docs for sandbox tools — sandbox removed       |
| 14  | `docs/tools/perplexity-search.md`         | EXCLUDE-GUT | registry                    | gutted: docs for Perplexity search — web tools removed |
| 15  | `docs/tools/skills-config.md`             | EXCLUDE-GUT | registry                    | gutted: docs for skills config — Pi-era skills         |
| 16  | `docs/tools/skills.md`                    | EXCLUDE-GUT | registry                    | gutted: docs for skills system — Pi-era skills         |
| 17  | `docs/tools/tavily.md`                    | EXCLUDE-GUT | registry                    | gutted: docs for Tavily search — web tools removed     |
| 18  | `docs/tools/thinking.md`                  | EXCLUDE-GUT | registry                    | gutted: docs for thinking tool — Pi-era tool           |
| 19  | `docs/tools/tts.md`                       | EXCLUDE-GUT | registry                    | fork has own TTS docs — upstream docs site replaced    |

All 19 entries map to file-level rows in `hq/upstream/disposition.tsv`. Each is also covered by the existing directory-wide `EXCLUDE` rules for `docs/concepts/` and `docs/tools/`; the file-level overlays carry per-file `gutted: ...` rationale that the directory-wide rules' "upstream-only" wording does not.

## The `agent-loop.md` decision

The single new disposition in this cluster.

**Upstream content** (`docs/concepts/agent-loop.md` @ `v2026.3.22`): describes the OpenClaw agent loop as wired around `pi-agent-core`:

- Entry: `agent` and `agent.wait` Gateway RPCs, plus the `agent` CLI command.
- Runtime: `runEmbeddedPiAgent` (pi-agent-core), `subscribeEmbeddedPiSession` event bridge, per-session + global serialization queues.
- Prompt assembly: skills snapshot loading + skills-prompt injection + bootstrap context files.
- Hook surface: plugin hooks `before_model_resolve`, `before_prompt_build`, `before_compaction` / `after_compaction`, `before_tool_call` / `after_tool_call`, etc.
- Streaming: pi-agent-core deltas → `assistant` / `tool` / `lifecycle` streams.
- Compaction: auto-compaction emits `compaction` stream events and triggers retry.

**Fork architecture** (`src/agents/`): RemoteClaw replaced the Pi-based orchestrator with **AgentRuntime** — a thin contract for running CLI agents (Claude, Gemini, Codex, OpenCode) as subprocesses (CLAUDE.md § Fork Context). Concretely:

- No `pi-agent-core` runtime, no `runEmbeddedPiAgent`, no `subscribeEmbeddedPiSession`.
- No skills snapshot loading (skills marketplace gutted — see disposition.tsv `EXCLUDE-GUT docs/tools/skills.md`).
- No model resolution / `before_model_resolve` hook (model selection gutted by WI-069 — see disposition.tsv `EXCLUDE-GUT docs/concepts/models.md`).
- No compaction pipeline (gutted — see disposition.tsv `EXCLUDE-GUT docs/concepts/compaction.md`).
- The fork's `AgentRuntime` interface is a single `execute(params): AsyncIterable<AgentEvent>` method; subprocess lifecycle and CLI output parsing are runtime-implementation concerns. Each CLI agent owns its own loop, hooks, model selection, and compaction.

The upstream document describes mechanisms that **do not exist** in the fork. None of its hook names, runtime entry points, queue semantics, or streaming chunking apply to `AgentRuntime`. Cherry-picking and rebranding would propagate Pi-era terminology back into the fork's docs.

**Fork's coverage of equivalent topics**: the AgentRuntime model is documented separately:

- `docs/concepts/agent.md` — Agent runtime, workspace contract, bootstrap files (`AGENTS.md`, `SOUL.md`, `TOOLS.md`).
- `docs/concepts/agent-runtimes.md` — `AgentRuntime` interface, `execute()` contract, CLI subprocess lifecycle, event translation.

These cover the same problem space (lifecycle, prompt assembly, streaming, error boundaries) from the fork-applicable angle (CLI subprocesses, not embedded loop).

**Disposition row added** to `hq/upstream/disposition.tsv`:

```text
EXCLUDE-GUT  docs/concepts/agent-loop.md  gutted: doc describes Pi-era agent loop (runEmbeddedPiAgent, pi-agent-core, skills snapshot, before_model_resolve hook, compaction); fork replaced this with AgentRuntime CLI-subprocess model — covered by docs/concepts/agent.md + docs/concepts/agent-runtimes.md (#2587 C1)
```

## Audit verification

Programmatic verification against `hq/upstream/disposition.tsv`:

- **Total expected**: 19
- **Found**: 19/19
- **Missing**: 0/19
- **DIFFER** (rationale mismatch vs issue body): 0/18 for the registry-confirmed set

Bulk audit residual for Cat C cluster C1 against `v2026.3.22`: **0**.

## Out of scope

- Other Cat C clusters: C2 (#2588), C3 (#2589), C4 (#2590), C5 (#2591), C6 (#2592), C7 (#2593), C8 (#2594) — separate per-cluster issues.
- Cat A waves (#2582-#2585) — closed, see PRs #2595-#2598.
- Cat B (#2577) — closed, see PR #2586.
- B11 sync batch (`v2026.3.22 → v2026.4.19-beta.2`) — scheduled after Cat A/B/C close.
