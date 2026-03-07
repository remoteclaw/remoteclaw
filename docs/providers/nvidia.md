---
description: "Use NVIDIA's OpenAI-compatible API in RemoteClaw"
read_when:
  - You want to use NVIDIA models in RemoteClaw
  - You need NVIDIA_API_KEY setup
title: "NVIDIA"
---

# NVIDIA

NVIDIA provides an OpenAI-compatible API at `https://integrate.api.nvidia.com/v1` for Nemotron and NeMo models. Authenticate with an API key from [NVIDIA NGC](https://catalog.ngc.nvidia.com/).

## CLI setup

Export the key once, then run onboarding:

```bash
export NVIDIA_API_KEY="nvapi-..."
remoteclaw onboard --auth-choice skip
```

## Config snippet

```json5
{
  env: { NVIDIA_API_KEY: "nvapi-..." },
  agents: {
    defaults: {
      model: { primary: "nvidia/nvidia/llama-3.1-nemotron-70b-instruct" },
    },
  },
}
```

## Model IDs

- `nvidia/llama-3.1-nemotron-70b-instruct` (default)
- `meta/llama-3.3-70b-instruct`
- `nvidia/mistral-nemo-minitron-8b-8k-instruct`

## Notes

- OpenAI-compatible `/v1` endpoint; use an API key from NVIDIA NGC.
- Provider auto-enables when `NVIDIA_API_KEY` is set; uses static defaults (131,072-token context window, 4,096 max tokens).
