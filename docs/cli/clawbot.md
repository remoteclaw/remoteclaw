---
description: "CLI reference for `remoteclaw clawbot` (legacy alias namespace)"
read_when:
  - You maintain older scripts using `remoteclaw clawbot ...`
  - You need migration guidance to current commands
title: "Clawbot"
---

# `remoteclaw clawbot`

Legacy alias namespace kept for backward compatibility. It registers the same QR command as the top-level CLI, so `remoteclaw clawbot qr` accepts every [`remoteclaw qr`](/cli/qr) flag.

## Migration

Prefer the modern top-level command:

- `remoteclaw clawbot qr` -> `remoteclaw qr`

## Related

- [CLI reference](/cli)
