---
description: "Run RemoteClaw with vLLM (OpenAI-compatible local server)"
read_when:
  - You want to run RemoteClaw against a local vLLM server
  - You want OpenAI-compatible /v1 endpoints with your own models
title: "vLLM"
---

# vLLM

vLLM can serve open-source (and some custom) models via an **OpenAI-compatible** HTTP API. RemoteClaw can connect to vLLM using the `openai-completions` API.

RemoteClaw can also **auto-discover** available models from vLLM when you opt in with `VLLM_API_KEY` (any value works if your server doesn’t enforce auth).

## Quick start

1. Start vLLM with an OpenAI-compatible server.

Your base URL should expose `/v1` endpoints (e.g. `/v1/models`, `/v1/chat/completions`). vLLM commonly runs on:

- `http://127.0.0.1:8000/v1`

2. Opt in (any value works if no auth is configured):

```bash
export VLLM_API_KEY="vllm-local"
```

3. Select a model (replace with one of your vLLM model IDs):

```json5
{
  agents: {
    defaults: {
      model: { primary: "vllm/your-model-id" },
    },
  },
}
```

## Model discovery (implicit provider)

When `VLLM_API_KEY` is set (or an auth profile exists), RemoteClaw will query:

- `GET http://127.0.0.1:8000/v1/models`

…and convert the returned IDs into model entries.

## Troubleshooting

- Check the server is reachable:

```bash
curl http://127.0.0.1:8000/v1/models
```

- If requests fail with auth errors, set a real `VLLM_API_KEY` that matches your server configuration.
