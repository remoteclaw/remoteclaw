---
description: "Run RemoteClaw in a rootless Podman container"
read_when:
  - You want a containerized gateway with Podman instead of Docker
title: "Podman"
---

# Podman

Run the RemoteClaw gateway in a **rootless** Podman container. Uses the same image as Docker (build from the repo [Dockerfile](https://github.com/remoteclaw/remoteclaw/blob/main/Dockerfile)).

## Requirements

- Podman (rootless)
- Sudo for one-time setup (create user, build image)

## Quick start

**1. One-time setup** (from repo root; creates user, builds image, installs launch script):

```bash
./setup-podman.sh
```

This also creates a minimal `~remoteclaw/.remoteclaw/remoteclaw.json` (sets `gateway.mode="local"`) so the gateway can start without running the wizard.

By default the container is **not** installed as a systemd service, you start it manually (see below). For a production-style setup with auto-start and restarts, install it as a systemd Quadlet user service instead:

```bash
./setup-podman.sh --quadlet
```

(Or set `REMOTECLAW_PODMAN_QUADLET=1`; use `--container` to install only the container and launch script.)

**2. Start gateway** (manual, for quick smoke testing):

```bash
./scripts/run-remoteclaw-podman.sh launch
```

**3. Onboarding wizard** (e.g. to add channels or providers):

```bash
./scripts/run-remoteclaw-podman.sh launch setup
```

Then open `http://127.0.0.1:18789/` and use the token from `~remoteclaw/.remoteclaw/.env` (or the value printed by setup).

## Systemd (Quadlet, optional)

If you ran `./setup-podman.sh --quadlet` (or `REMOTECLAW_PODMAN_QUADLET=1`), a [Podman Quadlet](https://docs.podman.io/en/latest/markdown/podman-systemd.unit.5.html) unit is installed so the gateway runs as a systemd user service for the remoteclaw user. The service is enabled and started at the end of setup.

- **Start:** `sudo systemctl --machine remoteclaw@ --user start remoteclaw.service`
- **Stop:** `sudo systemctl --machine remoteclaw@ --user stop remoteclaw.service`
- **Status:** `sudo systemctl --machine remoteclaw@ --user status remoteclaw.service`
- **Logs:** `sudo journalctl --machine remoteclaw@ --user -u remoteclaw.service -f`

The quadlet file lives at `~remoteclaw/.config/containers/systemd/remoteclaw.container`. To change ports or env, edit that file (or the `.env` it sources), then `sudo systemctl --machine remoteclaw@ --user daemon-reload` and restart the service. On boot, the service starts automatically if lingering is enabled for remoteclaw (setup does this when loginctl is available).

To add quadlet **after** an initial setup that did not use it, re-run: `./setup-podman.sh --quadlet`.

## The remoteclaw user (non-login)

`setup-podman.sh` creates a dedicated system user `remoteclaw`:

- **Shell:** `nologin` — no interactive login; reduces attack surface.
- **Home:** e.g. `/home/remoteclaw` — holds `~/.remoteclaw` (config, workspace) and the launch script `run-remoteclaw-podman.sh`.
- **Rootless Podman:** The user must have a **subuid** and **subgid** range. Many distros assign these automatically when the user is created. If setup prints a warning, add lines to `/etc/subuid` and `/etc/subgid`:

  ```text
  remoteclaw:100000:65536
  ```

  Then start the gateway as that user (e.g. from cron or systemd):

  ```bash
  sudo -u remoteclaw /home/remoteclaw/run-remoteclaw-podman.sh
  sudo -u remoteclaw /home/remoteclaw/run-remoteclaw-podman.sh setup
  ```

- **Config:** Only `remoteclaw` and root can access `/home/remoteclaw/.remoteclaw`. To edit config: use the Control UI once the gateway is running, or `sudo -u remoteclaw $EDITOR /home/remoteclaw/.remoteclaw/remoteclaw.json`.

## Environment and config

- **Token:** Stored in `~remoteclaw/.remoteclaw/.env` as `REMOTECLAW_GATEWAY_TOKEN`. `setup-podman.sh` and `run-remoteclaw-podman.sh` generate it if missing (uses `openssl`, `python3`, or `od`).
- **Optional:** In that `.env` you can set provider keys (e.g. `GROQ_API_KEY`, `OLLAMA_API_KEY`) and other RemoteClaw env vars.
- **Host ports:** By default the script maps `18789` (gateway) and `18790` (bridge). Override the **host** port mapping with `REMOTECLAW_PODMAN_GATEWAY_HOST_PORT` and `REMOTECLAW_PODMAN_BRIDGE_HOST_PORT` when launching.
- **Paths:** Host config and workspace default to `~remoteclaw/.remoteclaw` and `~remoteclaw/.remoteclaw/workspace`. Override the host paths used by the launch script with `REMOTECLAW_CONFIG_DIR` and `REMOTECLAW_WORKSPACE_DIR`.

## Useful commands

- **Logs:** With quadlet: `sudo journalctl --machine remoteclaw@ --user -u remoteclaw.service -f`. With script: `sudo -u remoteclaw podman logs -f remoteclaw`
- **Stop:** With quadlet: `sudo systemctl --machine remoteclaw@ --user stop remoteclaw.service`. With script: `sudo -u remoteclaw podman stop remoteclaw`
- **Start again:** With quadlet: `sudo systemctl --machine remoteclaw@ --user start remoteclaw.service`. With script: re-run the launch script or `podman start remoteclaw`
- **Remove container:** `sudo -u remoteclaw podman rm -f remoteclaw` — config and workspace on the host are kept

## Troubleshooting

- **Permission denied (EACCES) on config or auth-profiles:** The container defaults to `--userns=keep-id` and runs as the same uid/gid as the host user running the script. Ensure your host `REMOTECLAW_CONFIG_DIR` and `REMOTECLAW_WORKSPACE_DIR` are owned by that user.
- **Gateway start blocked (missing `gateway.mode=local`):** Ensure `~remoteclaw/.remoteclaw/remoteclaw.json` exists and sets `gateway.mode="local"`. `setup-podman.sh` creates this file if missing.
- **Rootless Podman fails for user remoteclaw:** Check `/etc/subuid` and `/etc/subgid` contain a line for `remoteclaw` (e.g. `remoteclaw:100000:65536`). Add it if missing and restart.
- **Container name in use:** The launch script uses `podman run --replace`, so the existing container is replaced when you start again. To clean up manually: `podman rm -f remoteclaw`.
- **Script not found when running as remoteclaw:** Ensure `setup-podman.sh` was run so that `run-remoteclaw-podman.sh` is copied to remoteclaw’s home (e.g. `/home/remoteclaw/run-remoteclaw-podman.sh`).
- **Quadlet service not found or fails to start:** Run `sudo systemctl --machine remoteclaw@ --user daemon-reload` after editing the `.container` file. Quadlet requires cgroups v2: `podman info --format '{{.Host.CgroupsVersion}}'` should show `2`.

## Optional: run as your own user

To run the gateway as your normal user (no dedicated remoteclaw user): build the image, create `~/.remoteclaw/.env` with `REMOTECLAW_GATEWAY_TOKEN`, and run the container with `--userns=keep-id` and mounts to your `~/.remoteclaw`. The launch script is designed for the remoteclaw-user flow; for a single-user setup you can instead run the `podman run` command from the script manually, pointing config and workspace to your home. Recommended for most users: use `setup-podman.sh` and run as the remoteclaw user so config and process are isolated.
