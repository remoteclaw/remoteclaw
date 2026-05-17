---
title: "Agent Harness Plugins"
sidebarTitle: "Agent Harness"
summary: "Experimental SDK surface for plugins that replace the low level embedded agent executor"
read_when:
  - You are changing the embedded agent runtime or harness registry
  - You are registering an agent harness from a bundled or trusted plugin
  - You need to understand how the Codex plugin relates to model providers
---

# Agent Harness Plugins

An **agent harness** is the low level executor for one prepared RemoteClaw agent
turn. It is not a model provider, not a channel, and not a tool registry.

Use this surface only for bundled or trusted native plugins. The contract is
still experimental because the parameter types intentionally mirror the current
embedded runner.

## When to use a harness

Register an agent harness when a model family has its own native session
runtime and the normal RemoteClaw provider transport is the wrong abstraction.

Examples:

- a native coding-agent server that owns threads and compaction
- a local CLI or daemon that must stream native plan/reasoning/tool events
- a model runtime that needs its own resume id in addition to the RemoteClaw
  session transcript

Do **not** register a harness just to add a new LLM API. For normal HTTP or
WebSocket model APIs, build a [provider plugin](/plugins/sdk-provider-plugins).

## What core still owns

Before a harness is selected, RemoteClaw has already resolved:

- provider and model
- runtime auth state
- thinking level and context budget
- the RemoteClaw transcript/session file
- workspace, sandbox, and tool policy
- channel reply callbacks and streaming callbacks
- model fallback and live model switching policy

That split is intentional. A harness runs a prepared attempt; it does not pick
providers, replace channel delivery, or silently switch models.

## Register a harness

**Import:** `remoteclaw/plugin-sdk/agent-harness`

```typescript
import type { AgentHarness } from "remoteclaw/plugin-sdk/agent-harness";
import { definePluginEntry } from "remoteclaw/plugin-sdk/plugin-entry";

const myHarness: AgentHarness = {
  id: "my-harness",
  label: "My native agent harness",

  supports(ctx) {
    return ctx.provider === "my-provider"
      ? { supported: true, priority: 100 }
      : { supported: false };
  },

  async runAttempt(params) {
    // Start or resume your native thread.
    // Use params.prompt, params.tools, params.images, params.onPartialReply,
    // params.onAgentEvent, and the other prepared attempt fields.
    return await runMyNativeTurn(params);
  },
};

export default definePluginEntry({
  id: "my-native-agent",
  name: "My Native Agent",
  description: "Runs selected models through a native agent daemon.",
  register(api) {
    api.registerAgentHarness(myHarness);
  },
});
```

## Selection policy

RemoteClaw chooses a harness after provider/model resolution:

1. `REMOTECLAW_AGENT_RUNTIME=<id>` forces a registered harness with that id.
2. `REMOTECLAW_AGENT_RUNTIME=pi` forces the built-in PI harness.
3. `REMOTECLAW_AGENT_RUNTIME=auto` asks registered harnesses if they support the
   resolved provider/model.
4. If no registered harness matches, RemoteClaw uses PI unless PI fallback is
   disabled.

Forced plugin harness failures surface as run failures. In `auto` mode,
RemoteClaw may fall back to PI when the selected plugin harness fails before a
turn has produced side effects. Set `REMOTECLAW_AGENT_HARNESS_FALLBACK=none` or
`embeddedHarness.fallback: "none"` to make that fallback a hard failure instead.

The bundled Codex plugin registers `codex` as its harness id. Core treats that
as an ordinary plugin harness id; Codex-specific aliases belong in the plugin
or operator config, not in the shared runtime selector.

## Provider plus harness pairing

Most harnesses should also register a provider. The provider makes model refs,
auth status, model metadata, and `/model` selection visible to the rest of
RemoteClaw. The harness then claims that provider in `supports(...)`.

The bundled Codex plugin follows this pattern:

- provider id: `codex`
- user model refs: `codex/gpt-5.4`, `codex/gpt-5.2`, or another model returned
  by the Codex app server
- harness id: `codex`
- auth: synthetic provider availability, because the Codex harness owns the
  native Codex login/session
- app-server request: RemoteClaw sends the bare model id to Codex and lets the
  harness talk to the native app-server protocol

The Codex plugin is additive. Plain `openai/gpt-*` refs remain OpenAI provider
refs and continue to use the normal RemoteClaw provider path. Select `codex/gpt-*`
when you want Codex-managed auth, Codex model discovery, native threads, and
Codex app-server execution. `/model` can switch among the Codex models returned
by the Codex app server without requiring OpenAI provider credentials.

For operator setup, model prefix examples, and Codex-only configs, see
[Codex Harness](/plugins/codex-harness).

RemoteClaw requires Codex app-server `0.118.0` or newer. The Codex plugin checks
the app-server initialize handshake and blocks older or unversioned servers so
RemoteClaw only runs against the protocol surface it has been tested with.

## Disable PI fallback

By default, RemoteClaw runs embedded agents with `agents.defaults.embeddedHarness`
set to `{ runtime: "auto", fallback: "pi" }`. In `auto` mode, registered plugin
harnesses can claim a provider/model pair. If none match, or if an auto-selected
plugin harness fails before producing output, RemoteClaw falls back to PI.

Set `fallback: "none"` when you need to prove that a plugin harness is the only
runtime being exercised. This disables automatic PI fallback; it does not block
an explicit `runtime: "pi"` or `REMOTECLAW_AGENT_RUNTIME=pi`.

For Codex-only embedded runs:

```json
{
  "agents": {
    "defaults": {
      "model": "codex/gpt-5.4",
      "embeddedHarness": {
        "runtime": "codex",
        "fallback": "none"
      }
    }
  }
}
```

If you want any registered plugin harness to claim matching models but never
want RemoteClaw to silently fall back to PI, keep `runtime: "auto"` and disable
the fallback:

```json
{
  "agents": {
    "defaults": {
      "embeddedHarness": {
        "runtime": "auto",
        "fallback": "none"
      }
    }
  }
}
```

Per-agent overrides use the same shape:

```json
{
  "agents": {
    "defaults": {
      "embeddedHarness": {
        "runtime": "auto",
        "fallback": "pi"
      }
    },
    "list": [
      {
        "id": "codex-only",
        "model": "codex/gpt-5.4",
        "embeddedHarness": {
          "runtime": "codex",
          "fallback": "none"
        }
      }
    ]
  }
}
```

`REMOTECLAW_AGENT_RUNTIME` still overrides the configured runtime. Use
`REMOTECLAW_AGENT_HARNESS_FALLBACK=none` to disable PI fallback from the
environment.

```bash
REMOTECLAW_AGENT_RUNTIME=codex \
REMOTECLAW_AGENT_HARNESS_FALLBACK=none \
remoteclaw gateway run
```

With fallback disabled, a session fails early when the requested harness is not
registered, does not support the resolved provider/model, or fails before
producing turn side effects. That is intentional for Codex-only deployments and
for live tests that must prove the Codex app-server path is actually in use.

This setting only controls the embedded agent harness. It does not disable
image, video, music, TTS, PDF, or other provider-specific model routing.

## Native sessions and transcript mirror

A harness may keep a native session id, thread id, or daemon-side resume token.
Keep that binding explicitly associated with the RemoteClaw session, and keep
mirroring user-visible assistant/tool output into the RemoteClaw transcript.

The RemoteClaw transcript remains the compatibility layer for:

- channel-visible session history
- transcript search and indexing
- switching back to the built-in PI harness on a later turn
- generic `/new`, `/reset`, and session deletion behavior

If your harness stores a sidecar binding, implement `reset(...)` so RemoteClaw can
clear it when the owning RemoteClaw session is reset.

## Tool and media results

Core constructs the RemoteClaw tool list and passes it into the prepared attempt.
When a harness executes a dynamic tool call, return the tool result back through
the harness result shape instead of sending channel media yourself.

This keeps text, image, video, music, TTS, approval, and messaging-tool outputs
on the same delivery path as PI-backed runs.

## Current limitations

- The public import path is generic, but some attempt/result type aliases still
  carry `Pi` names for compatibility.
- Third-party harness installation is experimental. Prefer provider plugins
  until you need a native session runtime.
- Harness switching is supported across turns. Do not switch harnesses in the
  middle of a turn after native tools, approvals, assistant text, or message
  sends have started.

## Related

- [SDK Overview](/plugins/sdk-overview)
- [Runtime Helpers](/plugins/sdk-runtime)
- [Provider Plugins](/plugins/sdk-provider-plugins)
- [Codex Harness](/plugins/codex-harness)
- [Model Providers](/concepts/model-providers)
