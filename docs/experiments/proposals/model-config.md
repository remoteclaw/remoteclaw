---
description: "Exploration: model config, auth profiles, and fallback behavior"
read_when:
  - Exploring future model selection + auth profile ideas
title: "Model Config Exploration"
---

# Model Config (Exploration)

This document captures **ideas** from the OpenClaw era for model configuration.
These features were removed in RemoteClaw's middleware rewrite — model selection
is now the CLI agent's responsibility, not RemoteClaw's.

This file is kept for historical reference only.

## Motivation

> **Note:** These requirements described OpenClaw's in-process model management, which was removed.

Operators want:

- Multiple auth profiles per provider (personal vs work).
- Simple `/model` selection with predictable fallbacks.
- Clear separation between text models and image-capable models.

> **Note:** These directions proposed re-introducing in-process model management, which contradicts RemoteClaw's middleware architecture.

## Possible direction (high level)

- Keep model selection simple: `provider/model` with optional aliases.
- Let providers have multiple auth profiles, with an explicit order.
- Use a global fallback list so all sessions fail over consistently.
- Only override image routing when explicitly configured.

> **Note:** These questions assume the in-process model provider ecosystem, which was removed.

## Open questions

- Should profile rotation be per-provider or per-model?
- How should the UI surface profile selection for a session?
- What is the safest migration path from legacy config keys?
