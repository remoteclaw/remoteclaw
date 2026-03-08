---
description: "How RemoteClaw builds prompt context and reports token usage + costs"
read_when:
  - Explaining token usage, costs, or context windows
  - Debugging context growth or compaction behavior
title: "Token Use and Costs"
---

# Token use & costs

RemoteClaw tracks **tokens**, not characters. Tokens are model-specific, but most
OpenAI-style models average ~4 characters per token for English text.

## How the system prompt is built

RemoteClaw assembles its own system prompt on every run. It includes:

- Tool list + short descriptions
- Skills list (only metadata; instructions are loaded on demand with `read`)
- Self-update instructions
- Workspace context files (`HEARTBEAT.md`, `MEMORY.md` when present). Agent CLIs load their own config files (e.g. `CLAUDE.md`). `memory/*.md` files are on-demand via memory tools and are not auto-injected.
- Time (UTC + user timezone)
- Reply tags + heartbeat behavior
- Runtime metadata (host/OS/model/thinking)

See the full breakdown in [System Prompt](/concepts/system-prompt).

## What counts in the context window

Everything the model receives counts toward the context limit:

- System prompt (all sections listed above)
- Conversation history (user + assistant messages)
- Tool calls and tool results
- Attachments/transcripts (images, audio, files)
- Compaction summaries and pruning artifacts
- Provider wrappers or safety headers (not visible, but still counted)

For images, RemoteClaw downscales transcript/tool image payloads before
forwarding them to the CLI agent.
Use `agents.defaults.imageMaxDimensionPx` (default: `1200`) to tune this:

- Lower values usually reduce vision-token usage and payload size.
- Higher values preserve more visual detail for OCR/UI-heavy screenshots.

For a practical breakdown (per injected file, tools, skills, and system prompt size), use `/context list` or `/context detail`. See [Context](/concepts/context).

## How to see current token usage

Use these in chat:

- `/status` → **emoji‑rich status card** with the session model, context usage,
  last response input/output tokens, and **estimated cost** (when available).
- `/usage off|tokens|full` → appends a **per-response usage footer** to every reply.
  - Persists per session (stored as `responseUsage`).
  - Cost display depends on the CLI agent's auth method; some auth flows
    report tokens only.
- `/usage cost` → shows a local cost summary from RemoteClaw session logs.

Other surfaces:

- **TUI/Web TUI:** `/status` + `/usage` are supported.
- **CLI:** `remoteclaw status --usage` and `remoteclaw channels list` show
  channel-level quota information (not per-response costs).

## Cost estimation (when shown)

Costs are estimated from your CLI agent's pricing data (when available). The CLI
agent reports `input`, `output`, `cacheRead`, and `cacheWrite` costs in **USD
per 1M tokens**. If pricing is missing or the CLI agent doesn't report it,
RemoteClaw shows tokens only.

## Cache TTL and session pruning

Prompt caching is managed by the CLI agent's underlying provider. RemoteClaw can
optionally run **cache-ttl pruning** on the session: it prunes conversation
history once the cache TTL has expired, then resets the window so the CLI agent
can re-cache a shorter context rather than the full history. This keeps cache
write costs lower when a session goes idle past the TTL.

Configure it in [Gateway configuration](/gateway/configuration) and see the
behavior details in [Session pruning](/concepts/session-pruning).

Heartbeat can keep the cache **warm** across idle gaps. If the provider cache TTL
is `1h`, setting the heartbeat interval just under that (e.g., `55m`) can avoid
re-caching the full prompt, reducing cache write costs.

In multi-agent setups, you can keep one shared model config and tune cache behavior
per agent with `agents.list[].params.cacheRetention`.

For a full knob-by-knob guide, see [Prompt Caching](/reference/prompt-caching).

For Anthropic API pricing, cache reads are significantly cheaper than input
tokens, while cache writes are billed at a higher multiplier. See Anthropic’s
prompt caching pricing for the latest rates and TTL multipliers:
[https://docs.anthropic.com/docs/build-with-claude/prompt-caching](https://docs.anthropic.com/docs/build-with-claude/prompt-caching)

### Example: keep 1h cache warm with heartbeat

```yaml
agents:
  defaults:
    heartbeat:
      every: "55m"
```

Set `cacheRetention` on the CLI agent side (e.g., via agent-level params)
to control cache write behavior.

### Example: mixed traffic with per-agent cache strategy

```yaml
agents:
  list:
    - id: "research"
      default: true
      heartbeat:
        every: "55m" # keep cache warm for deep sessions
      params:
        cacheRetention: "long"
    - id: "alerts"
      params:
        cacheRetention: "none" # avoid cache writes for bursty notifications
```

`agents.list[].params` lets you override cache behavior per agent.

## Tips for reducing token pressure

- Use `/compact` to summarize long sessions.
- Trim large tool outputs in your workflows.
- Lower `agents.defaults.imageMaxDimensionPx` for screenshot-heavy sessions.
- Keep skill descriptions short (skill list is injected into the prompt).
- Configure your CLI agent to use a smaller model for verbose, exploratory work.

Keep skill descriptions short to minimize prompt overhead.
