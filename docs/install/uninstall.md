---
description: "Uninstall RemoteClaw completely (CLI, service, state, workspace)"
read_when:
  - You want to remove RemoteClaw from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `remoteclaw` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
remoteclaw uninstall
```

Non-interactive (automation / npx):

```bash
remoteclaw uninstall --all --yes --non-interactive
npx -y remoteclaw uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
remoteclaw gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
remoteclaw gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${REMOTECLAW_STATE_DIR:-$HOME/.remoteclaw}"
```

If you set `REMOTECLAW_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.remoteclaw/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g remoteclaw
pnpm remove -g remoteclaw
bun remove -g remoteclaw
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/RemoteClaw.app
```

Notes:

- If you used profiles (`--profile` / `REMOTECLAW_PROFILE`), repeat step 3 for each state dir (defaults are `~/.remoteclaw-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `remoteclaw` is missing.

### macOS (launchd)

Default label is `org.remoteclaw.gateway` (or `org.remoteclaw.<profile>`; legacy `com.remoteclaw.*` may still exist):

```bash
launchctl bootout gui/$UID/org.remoteclaw.gateway
rm -f ~/Library/LaunchAgents/org.remoteclaw.gateway.plist
```

If you used a profile, replace the label and plist name with `org.remoteclaw.<profile>`. Remove any legacy `com.remoteclaw.*` plists if present.

### Linux (systemd user unit)

Default unit name is `remoteclaw-gateway.service` (or `remoteclaw-gateway-<profile>.service`):

```bash
systemctl --user disable --now remoteclaw-gateway.service
rm -f ~/.config/systemd/user/remoteclaw-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `RemoteClaw Gateway` (or `RemoteClaw Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "RemoteClaw Gateway"
Remove-Item -Force "$env:USERPROFILE\.remoteclaw\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.remoteclaw-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://remoteclaw.org/install.sh` or `install.ps1`, the CLI was installed with `npm install -g remoteclaw@latest`.
Remove it with `npm rm -g remoteclaw` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `remoteclaw ...` / `bun run remoteclaw ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
