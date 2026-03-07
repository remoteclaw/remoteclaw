---
description: "Use MiniMax M2.1 in RemoteClaw"
read_when:
  - You want MiniMax models in RemoteClaw
  - You need MiniMax setup guidance
title: "MiniMax"
---

# MiniMax

MiniMax is an AI company that builds the **M2/M2.1** model family. The current
coding-focused release is **MiniMax M2.1** (December 23, 2025), built for
real-world complex tasks.

Source: [MiniMax M2.1 release note](https://www.minimax.io/news/minimax-m21)

## Model overview (M2.1)

MiniMax highlights these improvements in M2.1:

- Stronger **multi-language coding** (Rust, Java, Go, C++, Kotlin, Objective-C, TS/JS).
- Better **web/app development** and aesthetic output quality (including native mobile).
- Improved **composite instruction** handling for office-style workflows, building on
  interleaved thinking and integrated constraint execution.
- **More concise responses** with lower token usage and faster iteration loops.
- Stronger **tool/agent framework** compatibility and context management (Claude Code,
  Droid/Factory AI, Cline, Kilo Code, Roo Code, BlackBox).
- Higher-quality **dialogue and technical writing** outputs.

## MiniMax M2.1 vs MiniMax M2.1 Lightning

- **Speed:** Lightning is the “fast” variant in MiniMax’s pricing docs.
- **Cost:** Pricing shows the same input cost, but Lightning has higher output cost.
- **Coding plan routing:** The Lightning back-end isn’t directly available on the MiniMax
  coding plan. MiniMax auto-routes most requests to Lightning, but falls back to the
  regular M2.1 back-end during traffic spikes.

## Choose a setup

### MiniMax OAuth (Coding Plan) — recommended

**Best for:** quick setup with MiniMax Coding Plan via OAuth, no API key required.

Enable the bundled OAuth plugin and authenticate:

```bash
remoteclaw plugins enable minimax-portal-auth  # skip if already loaded.
remoteclaw gateway restart  # restart if gateway is already running
remoteclaw onboard --auth-choice minimax-portal
```

You will be prompted to select an endpoint:

- **Global** - International users (`api.minimax.io`)
- **CN** - Users in China (`api.minimaxi.com`)

See [MiniMax OAuth plugin README](https://github.com/remoteclaw/remoteclaw/tree/main/extensions/minimax-portal-auth) for details.

### MiniMax M2.1 (API key)

**Best for:** hosted MiniMax with Anthropic-compatible API.

Configure via CLI:

- Run `remoteclaw configure`
- Select **Model/auth**
- Choose **MiniMax M2.1**

```json5
{
  env: { MINIMAX_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "minimax/MiniMax-M2.1" } } },
}
```

### MiniMax M2.1 as fallback (Opus primary)

**Best for:** keep Opus 4.6 as primary, fail over to MiniMax M2.1.

```json5
{
  env: { MINIMAX_API_KEY: "sk-..." },
  agents: {
    defaults: {
      models: {
        "anthropic/claude-opus-4-6": { alias: "opus" },
        "minimax/MiniMax-M2.1": { alias: "minimax" },
      },
      model: {
        primary: "anthropic/claude-opus-4-6",
        fallbacks: ["minimax/MiniMax-M2.1"],
      },
    },
  },
}
```

### Optional: Local via LM Studio (manual)

**Best for:** local inference with LM Studio.
We have seen strong results with MiniMax M2.1 on powerful hardware (e.g. a
desktop/server) using LM Studio's local server.

Configure manually via `remoteclaw.json`:

```json5
{
  agents: {
    defaults: {
      model: { primary: "lmstudio/minimax-m2.1-gs32" },
      models: { "lmstudio/minimax-m2.1-gs32": { alias: "Minimax" } },
    },
  },
}
```

## Configure via `remoteclaw configure`

Use the interactive config wizard to set MiniMax without editing JSON:

1. Run `remoteclaw configure`.
2. Select **Model/auth**.
3. Choose **MiniMax M2.1**.
4. Pick your default model when prompted.

## Configuration options

- `agents.defaults.models`: alias models you want in the allowlist.

## Notes

- Model refs are `minimax/<model>`.
- Coding Plan usage API: `https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains` (requires a coding plan key).
- Referral link for MiniMax Coding Plan (10% off): [https://platform.minimax.io/subscribe/coding-plan?code=DbXJTRClnb&source=link](https://platform.minimax.io/subscribe/coding-plan?code=DbXJTRClnb&source=link)

## Troubleshooting

### “Unknown model: minimax/MiniMax-M2.1”

This usually means the **MiniMax provider isn’t configured** (no provider entry
and no MiniMax auth profile/env key found). A fix for this detection is in
**2026.1.12** (unreleased at the time of writing). Fix by:

- Upgrading to **2026.1.12** (or run from source `main`), then restarting the gateway.
- Running `remoteclaw configure` and selecting **MiniMax M2.1**, or
- Setting `MINIMAX_API_KEY` (or a MiniMax auth profile) so the provider can be injected.

Make sure the model id is **case‑sensitive**:

- `minimax/MiniMax-M2.1`
- `minimax/MiniMax-M2.1-lightning`

Then recheck with:

```bash
remoteclaw doctor
```
