---
description: "Use Qwen OAuth (free tier) in RemoteClaw"
read_when:
  - You want to use Qwen with RemoteClaw
  - You want free-tier OAuth access to Qwen Coder
title: "Qwen"
---

# Qwen

Qwen provides a free-tier OAuth flow for Qwen Coder and Qwen Vision models
(2,000 requests/day, subject to Qwen rate limits).

## Enable the plugin

```bash
remoteclaw plugins enable qwen-portal-auth
```

Restart the Gateway after enabling.

## Authenticate

```bash
remoteclaw onboard --auth-choice qwen-portal
```

This runs the Qwen device-code OAuth flow and configures the provider.

## Model IDs

- `qwen-portal/coder-model`
- `qwen-portal/vision-model`

## Reuse Qwen Code CLI login

If you already logged in with the Qwen Code CLI, RemoteClaw will sync credentials
from `~/.qwen/oauth_creds.json` when it loads the auth store.

## Notes

- Tokens auto-refresh; re-run onboarding if refresh fails or access is revoked.
