---
title: "Docs Audit: References to Gutted Features"
summary: "Classified inventory of `docs/**/*.md` references to features removed during the OpenClaw → RemoteClaw fork transition"
read_when:
  - Planning docs cleanup for gutted upstream features
  - Triaging STALE vs ACCURATE vs HISTORICAL references
  - Opening follow-up issues to rewrite or delete stale doc sections
---

# Docs Audit: References to Gutted Features

**Tracking issue**: [#2530](https://github.com/remoteclaw/remoteclaw/issues/2530) — spike(docs): audit `docs/**` for references to gutted features.

This audit classifies every `docs/**/*.md` reference to features removed during the
OpenClaw → RemoteClaw fork transition. Authoritative removal contract:
[`docs/install/breaking-changes-from-openclaw.md`](/install/breaking-changes-from-openclaw).

The `CLAUDE.md § Fork Context` summary:

- **Kept**: channel adapters, gateway, messaging infra, plugin system (SDK + bundled plugins in `extensions/*`), CLI onboarding wizard (`remoteclaw onboard`), skills as files (SKILL.md loaded as system-prompt metadata).
- **Replaced**: embedded Pi execution engine → `AgentRuntime` subprocess (Claude / Gemini / Codex / OpenCode).
- **Removed**: skills marketplace UX, model provider ecosystem (`remoteclaw models` CLI + pi-ai provider catalog browsing), consumer onboarding UX (in-wizard model picker), ClawHub plugin/skill install path (`clawhub:<pkg>` locator).

## Method

1. Identify the authoritative removal contract (`docs/install/breaking-changes-from-openclaw.md`).
2. For every removed feature, verify the expected CLI surface is actually missing from `src/cli/program/register.*.ts` and related command files.
3. `rg` `docs/` for command invocations (`remoteclaw models *`, `remoteclaw skills *`, `clawhub:`, `autoAllowSkills`), brand/marketplace names (`ClawHub`), and feature nouns.
4. Classify each hit per the taxonomy below.

## Classification taxonomy

- **STALE**: describes a removed feature as if current — rewrite or delete candidate.
- **ACCURATE**: describes a still-present feature. Keep unchanged.
- **CROSS-REF**: mentions a gutted system as context for a current feature — update surrounding context (usually lighter than a rewrite).
- **HISTORICAL**: intentionally preserved in a changelog, migration guide, landscape page, or ADR-equivalent. Keep unchanged.

## CLI-surface verification (evidence)

The following commands referenced in docs **do not exist** in `src/cli/program/register.*.ts` or any equivalent registrar:

| Command referenced in docs                                                                    | Exists in code? | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- | ------------------------------------------------------ |
| `remoteclaw models list / set / status / scan / aliases / fallbacks / image-fallbacks / auth` | **No**          | `src/cli/program/register.*.ts` registers: `agent`, `agents`, `configure`, `import`, `doctor`, `dashboard`, `reset`, `uninstall`, `message`, `onboard`, `setup`, `status`, `health`, `sessions`, `cleanup`, plus sub-CLIs (`acp`, `gateway`, `daemon`, `logs`, `system`, `nodes`, `devices`, `node`, `tui`, `cron`, `dns`, `hooks`, `qr`, `pairing`, `plugins`, `channels`, `directory`, `security`, `update`, `completion`). No `models` registrar. `src/cli/program/help.test.ts` contains a stub `program.command("models").description("models")` only as a test fixture. |
| `remoteclaw skills install / search / update / list / info / enable / disable`                | **No**          | No skills sub-CLI registrar. Skills code under `src/agents/skills/` provides file loading (SKILL.md discovery, filtering), not a user-facing install/search CLI.                                                                                                                                                                                                                                                                                                                                                                                                              |
| `clawhub:<package>` plugin install locator                                                    | **No**          | `rg "clawhub:                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | clawHub | ClawHubPackage | installFromClawHub"`across`src/` returns zero matches. |
| `remoteclaw onboard`                                                                          | Yes             | `src/cli/program/register.onboard.ts:48` registers `.command("onboard")`. Provider auth flags still live in `src/commands/onboard-provider-auth-flags.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `remoteclaw plugins list / install / info / enable / disable / uninstall / update / doctor`   | Yes             | `src/cli/plugins-cli.ts:366` registers `.command("plugins")` with each subcommand.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## Classified inventory

### STALE — CLI references that no longer exist

Every row below references `remoteclaw models *` or `remoteclaw skills *` commands that are not in the CLI surface. Rewrite or delete required.

| File                                | Line(s)                                                                                                                                  | Stale reference                                                                                                                                            | Replacement guidance                                                                                                                                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/concepts/models.md`           | whole file (220 lines)                                                                                                                   | Entire page documents `remoteclaw models {list,set,status,set-image,aliases,fallbacks,image-fallbacks,scan}` — none exist                                  | Rewrite to describe model selection as agent-config only (`agents.defaults.model` / `agents.defaults.models` in `remoteclaw.json`) — keep this page as the concept anchor, but strip the non-existent CLI. Update inbound links. |
| `docs/concepts/model-providers.md`  | 18, 45, 63, 78, 95, 110, 119-122, 131, 139, 146, 167, 259, 292, 323, 375, 452-454                                                        | `remoteclaw models list`, `remoteclaw models set`, `remoteclaw models auth login/paste-token`, "built-in providers (pi-ai catalog)" language               | Keep provider-config examples that map to `agents.defaults.model`; delete all `remoteclaw models *` invocations; reframe from "pi-ai catalog" browsing to "agent picks its own model".                                           |
| `docs/gateway/authentication.md`    | 70, 76, 96, 97, 108, 119, 153, 154, 155, 168, 173                                                                                        | 11 × `remoteclaw models auth` / `remoteclaw models status` invocations                                                                                     | Replace with equivalent actions via `remoteclaw onboard` or direct config edits in `remoteclaw.json` under `agents.defaults`. Delete the `models status --check` / `models auth order` flows.                                    |
| `docs/gateway/troubleshooting.md`   | 39                                                                                                                                       | `remoteclaw models status`                                                                                                                                 | Replace with `remoteclaw status` and/or `remoteclaw config get agents.defaults.models`.                                                                                                                                          |
| `docs/help/testing.md`              | 232, 233, 252, 357, 372                                                                                                                  | `remoteclaw models list / list --json / auth paste-token / scan`                                                                                           | Drop the step or substitute with test harness that reads `agents.defaults.models`.                                                                                                                                               |
| `docs/help/faq.md`                  | 112, 119, 219, 560, 570, 625, 1743, 1762, 2035, 2061, 2075, 2162, 2321, 2329, 2330, 2336, 2385, 2391, 2394, 2397, 2400, 2406, 2656, 2716 | 24+ instances of `remoteclaw models {status,set,list,auth,...}`                                                                                            | Rewrite each FAQ entry to direct users to `remoteclaw onboard` for provider auth, and `remoteclaw status` / `remoteclaw config get` for introspection.                                                                           |
| `docs/help/faq.md`                  | 996, 999-1001, 1004, 1076, 1077, 1080                                                                                                    | `remoteclaw skills search/install/update/--all`, "Install the separate `clawhub` CLI", "[Skills](/tools/skills) and [ClawHub](/tools/clawhub)"             | Remove skills marketplace flow. Keep guidance about "place SKILL.md in `<workspace>/skills` or `~/.remoteclaw/skills`" as that is still how skills are discovered.                                                               |
| `docs/web/tui.md`                   | 160                                                                                                                                      | `remoteclaw models status`                                                                                                                                 | Replace with `remoteclaw status`.                                                                                                                                                                                                |
| `docs/cli/index.md`                 | 490-501, 855-858, 865-867                                                                                                                | Documents a `skills` subcommand group (`skills update`, `skills list`, `skills info`, `skills check`) and a `models` root/status command — none registered | Delete both sections. Replace tip at line 501 ("use `remoteclaw skills search/install/update` for ClawHub-backed skills") with the file-placement guidance.                                                                      |
| `docs/reference/api-usage-costs.md` | 113, 115, 126                                                                                                                            | `remoteclaw models status --json`, link to `/cli/models`, `remoteclaw models scan`                                                                         | Drop references. Usage surfaces remain (`/status`, `/usage`, `remoteclaw status --usage`).                                                                                                                                       |

### STALE — ClawHub marketplace references

ClawHub was removed as a marketplace install surface. The `clawhub:<package>` locator does not exist in `src/`.

| File                               | Line(s)              | Stale reference                                                                                                                                                                                                    | Replacement guidance                                                                                                                                                                                                               |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/cli/plugins.md`              | 49-50, 57, 81        | `remoteclaw plugins install clawhub:<package>`, "Bare package names are checked against ClawHub first, then npm", "ClawHub installs use an explicit `clawhub:<package>` locator"                                   | Remove the ClawHub resolution layer; document only local path/archive and npm package specs.                                                                                                                                       |
| `docs/cli/hooks.md`                | 192                  | `remoteclaw plugins install <package>` comment says "ClawHub first, then npm"                                                                                                                                      | Drop the "ClawHub first" half; keep the npm path.                                                                                                                                                                                  |
| `docs/tools/plugin.md`             | 51, 57, 208-211      | Code examples using `clawhub:@remoteclaw/voice-call`, resolver description says "`clawhub:<pkg>` or bare package spec (ClawHub first, then npm fallback)", CLI examples `remoteclaw plugins install clawhub:<pkg>` | Replace code samples with npm/local-path examples. Simplify resolver description to "local path or npm package".                                                                                                                   |
| `docs/plugins/building-plugins.md` | 17-18, 110, 116      | "Publish to [ClawHub](/tools/clawhub) or npm", "RemoteClaw tries ClawHub first and...", "RemoteClaw checks ClawHub first, then falls back to npm"                                                                  | Drop ClawHub publishing half — publish to npm only. Also the ClawHub dead link at `/tools/clawhub`.                                                                                                                                |
| `docs/plugins/community.md`        | 13, 20, 105-107, 134 | Publishing flow assumes ClawHub-first resolution + ClawHub as preferred registry                                                                                                                                   | Rewrite publishing flow as npm-only.                                                                                                                                                                                               |
| `docs/concepts/system-prompt.md`   | 130                  | System prompt "notes the public mirror, source repo, community Discord, and ClawHub ([https://clawhub.com](https://clawhub.com)) for skills discovery"                                                             | If the system prompt still emits that line, this is CROSS-REF (the emitted prompt is the stale surface — verify `src/agents/` before deciding STALE vs CROSS-REF). Likely STALE — skills-discovery-via-ClawHub is not a live flow. |
| `docs/start/hubs.md`               | 176-178              | Link list ends with `[Skills](/tools/skills)`, `[ClawHub](/tools/clawhub)`, `[Skills config](/tools/skills-config)` — all dead links; former ClawHub marketplace docs                                              | Remove dead links; retain skills-as-files guidance if placed elsewhere.                                                                                                                                                            |

### STALE — Threat model for removed marketplace

The ClawHub supply-chain threat model models an attack surface that no longer exists in RemoteClaw.

| File                                         | Line(s)                                       | Stale reference                                                                                                                                                                                  | Replacement guidance                                                                                                                                                                                                               |
| -------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/security/THREAT-MODEL-ATLAS.md`        | 45, 54, 141, 275, 277, 289, 317, 444-593, 602 | "ClawHub Marketplace" attack surface, "F5 ClawHub Agent Skill code", "Attacker publishes malicious skill to ClawHub", "§ 4. ClawHub Supply Chain Analysis", `convex/lib/moderation.ts` reference | Delete the ClawHub threat vectors and the whole "§ 4. ClawHub Supply Chain Analysis" section. Recalibrate the doc to the actual RemoteClaw attack surface: MCP-server supply chain, CLI-agent subprocess, plugin-install-from-npm. |
| `docs/security/CONTRIBUTING-THREAT-MODEL.md` | 22                                            | "Which parts of RemoteClaw are affected (CLI, gateway, channels, ClawHub, MCP servers, etc.)"                                                                                                    | Drop "ClawHub" from the list of affected parts.                                                                                                                                                                                    |

### STALE — `autoAllowSkills` config surface

Already tracked by **[#2538](https://github.com/remoteclaw/remoteclaw/issues/2538)** (OPEN): `gut(backend+docs): remove autoAllowSkills from config schema and documentation`.

| File                             | Stale reference                    |
| -------------------------------- | ---------------------------------- |
| `docs/tools/exec.md`             | `autoAllowSkills` config reference |
| `docs/tools/exec-approvals.md`   | `autoAllowSkills` config reference |
| `docs/gateway/security/index.md` | `autoAllowSkills` config reference |

**Action**: No new issue — folded into #2538.

### STALE — Dead links to missing docs

Several files link to `/tools/skills`, `/tools/clawhub`, `/tools/skills-config` — none of which exist as files in `docs/`.

| File                               | Line(s) |
| ---------------------------------- | ------- |
| `docs/tools/exec-approvals.md`     | 397     |
| `docs/plugins/community.md`        | 13, 107 |
| `docs/plugins/building-plugins.md` | 17, 110 |
| `docs/start/docs-directory.md`     | 27      |
| `docs/reference/wizard.md`         | 306     |
| `docs/help/testing.md`             | 469     |
| `docs/help/faq.md`                 | 1080    |
| `docs/start/hubs.md`               | 176-178 |

**Action**: Delete the dead links OR create stub pages if the linked content is actually live (file-based skills are — but the link name suggests marketplace docs, so most should be deleted).

### CROSS-REF — Gutted in context, needs lighter edit

| File                           | Context                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/tools/slash-commands.md` | Line 100 mentions `clawhub:<pkg>` as an accepted plugin spec for `/plugin install`. Aligns with `docs/cli/plugins.md` and `docs/tools/plugin.md` fixes — drop the ClawHub half only. |

### HISTORICAL — Preserved as removal contract / landscape

No changes needed. These documents describe the removal itself or OpenClaw-era context deliberately.

| File                                             | Why preserved                                                                                                         |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `docs/install/breaking-changes-from-openclaw.md` | Canonical removal contract. Source of truth for this audit.                                                           |
| `docs/install/migrating.md`                      | OpenClaw → RemoteClaw migration path (if present).                                                                    |
| `docs/landscape.md`                              | Positioning piece that discusses OpenClaw's platform layer as motivation for the fork. Contextual, not prescriptive.  |
| `docs/concepts/middleware-architecture.md`       | Contrasts middleware (RemoteClaw) with platform (OpenClaw). Historical positioning, not a guide to a removed feature. |
| `docs/experiments/proposals/model-config.md`     | Experiment proposal; preserved as design-history.                                                                     |
| `docs/experiments/onboarding-config-protocol.md` | Experiment proposal; preserved as design-history.                                                                     |
| `docs/cli/uninstall.md`                          | Uninstall path references `~/.openclaw`; legitimate for the teardown flow.                                            |
| `docs/cli/reset.md`                              | Same as above.                                                                                                        |
| `docs/nodes/location-command.md`                 | Any OpenClaw reference here is likely historical context — verify during any rewrite.                                 |

### ACCURATE — Explicitly verified, not stale

| File                              | Verification                                                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/concepts/agent-runtimes.md` | Describes AgentRuntime interface (the replacement for the gutted Pi engine). Current architecture.                                                                                                                           |
| `docs/concepts/agent.md`          | Reviewed via grep — no references to removed CLI surfaces.                                                                                                                                                                   |
| `docs/concepts/usage-tracking.md` | Reads "Tracks session-level token usage from CLI agent run output. No direct polling of external APIs." — aligned with post-gutting architecture.                                                                            |
| `docs/reference/credits.md`       | Project contributor credits, not billing credits.                                                                                                                                                                            |
| `docs/reference/token-use.md`     | Current token-tracking surfaces (`/status`, `/usage`). Line 19 mentions "Skills list (only metadata; instructions are loaded on demand with `read`)" — aligned with SKILL.md discovery still living in `src/agents/skills/`. |
| `docs/cli/onboard.md`             | `remoteclaw onboard` command exists; flags match `src/cli/program/register.onboard.ts` + `src/commands/onboard-provider-auth-flags.ts`.                                                                                      |
| `docs/reference/wizard.md`        | Wizard flow reference — the wizard is kept (just the in-wizard model-picker dropdown is gone; the wizard itself still installs channels/providers/auth).                                                                     |
| `docs/refactor/plugin-sdk.md`     | Plugin SDK — kept per PR #2544.                                                                                                                                                                                              |
| `docs/plugins/manifest.md`        | Plugin manifest schema — plugin system kept.                                                                                                                                                                                 |
| `docs/plugins/sdk-migration.md`   | Plugin SDK migration notes — plugin system kept.                                                                                                                                                                             |

## Summary

| Classification                        | File count | Reference count                                         |
| ------------------------------------- | ---------- | ------------------------------------------------------- |
| STALE — CLI commands that don't exist | 10         | 46 `remoteclaw models *` + 7 `remoteclaw skills *` = 53 |
| STALE — ClawHub marketplace           | 7          | ~20                                                     |
| STALE — ClawHub threat model          | 2          | ~15 (heavy edits in one file)                           |
| STALE — `autoAllowSkills`             | 3          | 3 (tracked in #2538)                                    |
| STALE — Dead links to missing docs    | 8          | 9                                                       |
| CROSS-REF                             | 1          | 1                                                       |
| HISTORICAL                            | 9          | —                                                       |
| ACCURATE (explicitly verified)        | 10         | —                                                       |

## Follow-up plan

The issue (`#2530`) calls for "docs(audit): ..." follow-up PRs/issues for STALE sections. Recommended grouping (open one issue per group, keeps PRs reviewable):

1. **`remoteclaw models` CLI removal sweep** — delete/rewrite `docs/concepts/models.md` (whole-file), `docs/concepts/model-providers.md` (mass edit), `docs/gateway/authentication.md` (11 refs), `docs/gateway/troubleshooting.md`, `docs/web/tui.md`, `docs/reference/api-usage-costs.md`. One issue, potentially split across 2-3 PRs by doc area (concepts / gateway / reference+help).
2. **`remoteclaw skills` CLI removal sweep** — `docs/help/faq.md` (skills blocks), `docs/cli/index.md`. Single PR.
3. **ClawHub plugin/skill marketplace sweep** — `docs/cli/plugins.md`, `docs/cli/hooks.md`, `docs/tools/plugin.md`, `docs/tools/slash-commands.md`, `docs/plugins/building-plugins.md`, `docs/plugins/community.md`, `docs/concepts/system-prompt.md`, `docs/start/hubs.md`. Single issue, likely one PR.
4. **ClawHub threat-model rewrite** — `docs/security/THREAT-MODEL-ATLAS.md`, `docs/security/CONTRIBUTING-THREAT-MODEL.md`. Needs security-architect review since the rewrite changes the threat surface. Separate issue.
5. **Dead-link sweep** — `/tools/skills`, `/tools/clawhub`, `/tools/skills-config` link targets in 8 files. Single PR — either delete links or create stub pages with live content.
6. **FAQ consolidated cleanup** — `docs/help/faq.md` accumulates multiple categories; consider one dedicated FAQ-rewrite PR that addresses `remoteclaw models`, `remoteclaw skills`, ClawHub, and `autoAllowSkills` hits together.

The `autoAllowSkills` row is already tracked by [#2538](https://github.com/remoteclaw/remoteclaw/issues/2538) — no new issue needed.

## Verification notes (for future maintainers)

If a later fork-sync re-imports a gutted surface into `src/`, this audit no longer applies. Re-run the CLI-surface verification table at the top before acting on any row.

Quick re-verification script:

```bash
# Re-verify the three CLI surfaces this audit depends on:
rg -l "remoteclaw models " docs/                          # should list ~9 files until sweep lands
rg -l "remoteclaw skills " docs/                          # should list ~2 files until sweep lands
rg -l "clawhub:|ClawHub" docs/                            # should list marketplace refs until sweep lands
rg "\.command\(\"models\"\)" src/cli/program/             # must remain empty outside tests
rg "\.command\(\"skills\"\)" src/cli/program/             # must remain empty
rg "clawhub:|clawHub|ClawHubPackage|installFromClawHub" src/   # must remain empty
```
