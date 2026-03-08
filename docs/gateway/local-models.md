---
description: "Run RemoteClaw with local LLMs (LM Studio, vLLM, LiteLLM, custom OpenAI endpoints)"
read_when:
  - You want to serve models from your own GPU box
  - You are wiring LM Studio or an OpenAI-compatible proxy
  - You need the safest local model guidance
title: "Local Models"
---

# Local models

Local is doable, but RemoteClaw expects large context + strong defenses against prompt injection. Small cards truncate context and leak safety. Aim high: **≥2 maxed-out Mac Studios or equivalent GPU rig (~$30k+)**. A single **24 GB** GPU works only for lighter prompts with higher latency. Use the **largest / full-size model variant you can run**; aggressively quantized or "small" checkpoints raise prompt-injection risk (see [Security](/gateway/security)).

## How it works

RemoteClaw is middleware — it spawns CLI agents as subprocesses. To use a local model,
configure the CLI agent (e.g., Claude CLI, OpenCode) to point at your local
endpoint. RemoteClaw does not manage model selection or provider routing — that is
the CLI agent's responsibility.

For example, if your CLI agent supports a `--model` flag or an environment variable
for the API base URL, configure those on the gateway host.

## Recommended: LM Studio + MiniMax M2.1

Best current local stack. Load MiniMax M2.1 in LM Studio, enable the local server (default `http://127.0.0.1:1234`), and configure your CLI agent to use that endpoint.

**Setup checklist**

- Install LM Studio: [https://lmstudio.ai](https://lmstudio.ai)
- In LM Studio, download the **largest MiniMax M2.1 build available** (avoid "small"/heavily quantized variants), start the server, confirm `http://127.0.0.1:1234/v1/models` lists it.
- Keep the model loaded; cold-load adds startup latency.
- Configure your CLI agent to use the local endpoint (e.g., set `ANTHROPIC_BASE_URL` or equivalent for your runtime).
- For WhatsApp, use an API mode that returns only final text (not streaming reasoning).

## Other OpenAI-compatible local proxies

vLLM, LiteLLM, OAI-proxy, or custom gateways work if they expose an OpenAI-style `/v1` endpoint. Configure your CLI agent to point at the local endpoint.

## Regional hosting / data routing

- Hosted MiniMax/Kimi/GLM variants also exist on OpenRouter with region-pinned endpoints (e.g., US-hosted).
- Local-only remains the strongest privacy path; hosted regional routing is the middle ground when you need provider features but want control over data flow.

## Troubleshooting

- Gateway can reach the proxy? `curl http://127.0.0.1:1234/v1/models`.
- LM Studio model unloaded? Reload; cold start is a common "hanging" cause.
- Context errors? Lower `contextWindow` or raise your server limit.
- Safety: local models skip provider-side filters; keep agents narrow and compaction on to limit prompt injection blast radius.
