---
description: "Move (migrate) a RemoteClaw install from one machine to another"
read_when:
  - You are moving RemoteClaw to a new laptop/server
  - You want to preserve sessions, auth, and channel logins (WhatsApp, etc.)
title: "Migration Guide"
---

# Migrating RemoteClaw to a new machine

This guide migrates a RemoteClaw Gateway from one machine to another **without redoing onboarding**.

The migration is simple conceptually:

- Copy the **state directory** (`$REMOTECLAW_STATE_DIR`, default: `~/.remoteclaw/`) — this includes config, auth, sessions, and channel state.
- Copy your **workspace** (`~/.remoteclaw/workspace/` by default) — this includes your agent files (memory, prompts, etc.).

But there are common footguns around **profiles**, **permissions**, and **partial copies**.

## Before you start (what you are migrating)

### 1) Identify your state directory

Most installs use the default:

- **State dir:** `~/.remoteclaw/`

But it may be different if you use:

- `--profile <name>` (often becomes `~/.remoteclaw-<profile>/`)
- `REMOTECLAW_STATE_DIR=/some/path`

If you’re not sure, run on the **old** machine:

```bash
remoteclaw status
```

Look for mentions of `REMOTECLAW_STATE_DIR` / profile in the output. If you run multiple gateways, repeat for each profile.

### 2) Identify your workspace

There is no built-in default workspace path — check your `agents.defaults.workspace`
(or per-agent `agents.list[].workspace`) in `remoteclaw.json`.

Your workspace is where files like `MEMORY.md`, `IDENTITY.md`, and `memory/*.md` live.

> **Note:** RemoteClaw no longer seeds template files (`SOUL.md`, `AGENTS.md`,
> `USER.md`, `TOOLS.md`, `BOOTSTRAP.md`) in the workspace. Agents bring their
> own config (e.g. `CLAUDE.md` for Claude Code). If you're migrating from an
> older install, these files can be safely removed.

### 3) Understand what you will preserve

If you copy **both** the state dir and workspace, you keep:

- Gateway configuration (`remoteclaw.json`)
- Auth profiles / API keys / OAuth tokens
- Session history + agent state
- Channel state (e.g. WhatsApp login/session)
- Your workspace files (memory, skills notes, etc.)

If you copy **only** the workspace (e.g., via Git), you do **not** preserve:

- sessions
- credentials
- channel logins

Those live under `$REMOTECLAW_STATE_DIR`.

## Migration steps (recommended)

### Step 0 — Make a backup (old machine)

On the **old** machine, stop the gateway first so files aren’t changing mid-copy:

```bash
remoteclaw gateway stop
```

(Optional but recommended) archive the state dir and workspace:

```bash
# Adjust paths if you use a profile or custom locations
cd ~
tar -czf remoteclaw-state.tgz .remoteclaw

tar -czf remoteclaw-workspace.tgz .remoteclaw/workspace
```

If you have multiple profiles/state dirs (e.g. `~/.remoteclaw-main`, `~/.remoteclaw-work`), archive each.

### Step 1 — Install RemoteClaw on the new machine

On the **new** machine, install the CLI (and Node if needed):

- See: [Install](/install)

At this stage, it’s OK if onboarding creates a fresh `~/.remoteclaw/` — you will overwrite it in the next step.

### Step 2 — Copy the state dir + workspace to the new machine

Copy **both**:

- `$REMOTECLAW_STATE_DIR` (default `~/.remoteclaw/`)
- your workspace (configured via `agents.defaults.workspace` — no built-in default)

Common approaches:

- `scp` the tarballs and extract
- `rsync -a` over SSH
- external drive

After copying, ensure:

- Hidden directories were included (e.g. `.remoteclaw/`)
- File ownership is correct for the user running the gateway

### Step 3 — Run Doctor (migrations + service repair)

On the **new** machine:

```bash
remoteclaw doctor
```

Doctor is the “safe boring” command. It repairs services, applies config migrations, and warns about mismatches.

Then:

```bash
remoteclaw gateway restart
remoteclaw status
```

## Common footguns (and how to avoid them)

### Footgun: profile / state-dir mismatch

If you ran the old gateway with a profile (or `REMOTECLAW_STATE_DIR`), and the new gateway uses a different one, you’ll see symptoms like:

- config changes not taking effect
- channels missing / logged out
- empty session history

Fix: run the gateway/service using the **same** profile/state dir you migrated, then rerun:

```bash
remoteclaw doctor
```

### Footgun: copying only `remoteclaw.json`

`remoteclaw.json` is not enough. Many providers store state under:

- `$REMOTECLAW_STATE_DIR/credentials/`
- `$REMOTECLAW_STATE_DIR/agents/<agentId>/...`

Always migrate the entire `$REMOTECLAW_STATE_DIR` folder.

### Footgun: permissions / ownership

If you copied as root or changed users, the gateway may fail to read credentials/sessions.

Fix: ensure the state dir + workspace are owned by the user running the gateway.

### Footgun: migrating between remote/local modes

- If your UI (WebUI/TUI) points at a **remote** gateway, the remote host owns the session store + workspace.
- Migrating your laptop won’t move the remote gateway’s state.

If you’re in remote mode, migrate the **gateway host**.

### Footgun: secrets in backups

`$REMOTECLAW_STATE_DIR` contains secrets (API keys, OAuth tokens, WhatsApp creds). Treat backups like production secrets:

- store encrypted
- avoid sharing over insecure channels
- rotate keys if you suspect exposure

## Verification checklist

On the new machine, confirm:

- `remoteclaw status` shows the gateway running
- Your channels are still connected (e.g. WhatsApp doesn’t require re-pair)
- The dashboard opens and shows existing sessions
- Your workspace files (memory, configs) are present

## Related

- [Doctor](/gateway/doctor)
- [Gateway troubleshooting](/gateway/troubleshooting)
- [Where does RemoteClaw store its data?](/help/faq#where-does-remoteclaw-store-its-data)
