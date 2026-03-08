---
description: "Monitor OAuth expiry for CLI agent credentials"
read_when:
  - Setting up auth expiry monitoring or alerts
  - Automating Claude Code / Codex OAuth refresh checks
title: "Auth Monitoring"
---

# Auth monitoring

CLI agent credentials (OAuth tokens for Claude Code, Codex, etc.) expire
periodically. Use the scripts below for automation and alerting.

## Scripts (ops / phone workflows)

These live under `scripts/` and are **optional**. They assume SSH access to the
gateway host and are tuned for systemd + Termux.

- `scripts/claude-auth-status.sh`: Claude Code + RemoteClaw auth checker (full/json/simple).
- `scripts/auth-monitor.sh`: cron/systemd timer target; sends alerts (ntfy or phone).
- `scripts/systemd/remoteclaw-auth-monitor.{service,timer}`: systemd user timer.
- `scripts/mobile-reauth.sh`: guided re‑auth flow over SSH.
- `scripts/termux-quick-auth.sh`: one‑tap widget status + open auth URL.
- `scripts/termux-auth-widget.sh`: full guided widget flow.
- `scripts/termux-sync-widget.sh`: sync Claude Code creds → RemoteClaw.

If you don’t need phone automation or systemd timers, skip these scripts.
