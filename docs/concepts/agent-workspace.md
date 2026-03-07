---
description: "Agent workspace: location, layout, and backup strategy"
read_when:
  - You need to explain the agent workspace or its file layout
  - You want to back up or migrate an agent workspace
title: "Agent Workspace"
---

# Agent workspace

The workspace is the agent's home. It is the only working directory used for
file tools and for workspace context. Keep it private and treat it as memory.

This is separate from `~/.remoteclaw/`, which stores config, credentials, and
sessions.

**Important:** the workspace is the **default cwd**, not a hard sandbox. Tools
resolve relative paths against the workspace, but absolute paths can still reach
elsewhere on the host unless sandboxing is enabled. If you need isolation, use
`agents.defaults.sandbox` (and/or per‑agent sandbox config).
When sandboxing is enabled and `workspaceAccess` is not `"rw"`, tools operate
inside a sandbox workspace under `~/.remoteclaw/sandboxes`, not your host workspace.

## Configuration

There is no built-in workspace path — you must explicitly configure one.
Set a default via `agents.defaults.workspace` (applied per-agent, not a shared
directory) or override per-agent via `agents.list[].workspace`:

```json5
{
  agents: {
    defaults: {
      workspace: "~/projects",
    },
  },
}
```

`remoteclaw setup` creates the workspace directory if it does not exist.

## Workspace contents

The workspace is a plain working directory. Agents bring their own
configuration (e.g., `CLAUDE.md` for Claude Code, `.gemini/` for Gemini CLI).
RemoteClaw does not seed or manage template files in the workspace.

Files that RemoteClaw may read or write:

- `HEARTBEAT.md`
  - Optional tiny checklist for heartbeat runs.
  - Keep it short to avoid token burn.

- Boot prompt file (configurable path via `agents.defaults.boot.file`)
  - Optional startup prompt executed on gateway restart when internal hooks are enabled.
  - Configure via `agents.defaults.boot` or per-agent `agents.list[].boot`.
  - Keep it short; use the message tool for outbound sends.

- `memory/YYYY-MM-DD.md`
  - Daily memory log (one file per day).
  - Recommended to read today + yesterday on session start.

- `MEMORY.md` (optional)
  - Curated long-term memory.
  - Only load in the main, private session (not shared/group contexts).

- `skills/` (optional)
  - Workspace-specific skills.
  - Overrides managed/bundled skills when names collide.

- `canvas/` (optional)
  - Canvas UI files for node displays (for example `canvas/index.html`).

### Editable files via gateway

The gateway file editor exposes workspace files matching configurable glob
patterns. Set `agents.defaults.editableFiles` (or per-agent
`agents.list[].editableFiles`) to an array of globs:

```json5
{
  agents: {
    defaults: {
      editableFiles: ["HEARTBEAT.md", "memory/**/*.md"],
    },
  },
}
```

## What is NOT in the workspace

These live under `~/.remoteclaw/` and should NOT be committed to the workspace repo:

- `~/.remoteclaw/remoteclaw.json` (config)
- `~/.remoteclaw/credentials/` (OAuth tokens, API keys)
- `~/.remoteclaw/agents/<agentId>/sessions/` (session transcripts + metadata)
- `~/.remoteclaw/skills/` (managed skills)

If you need to migrate sessions or config, copy them separately and keep them
out of version control.

## Git backup (recommended, private)

Treat the workspace as private memory. Put it in a **private** git repo so it is
backed up and recoverable.

Run these steps on the machine where the Gateway runs (that is where the
workspace lives).

### 1) Initialize the repo

```bash
cd ~/projects  # your workspace path
git init
git add HEARTBEAT.md memory/
git commit -m "Add agent workspace"
```

### 2) Add a private remote (beginner-friendly options)

Option A: GitHub web UI

1. Create a new **private** repository on GitHub.
2. Do not initialize with a README (avoids merge conflicts).
3. Copy the HTTPS remote URL.
4. Add the remote and push:

```bash
git branch -M main
git remote add origin <https-url>
git push -u origin main
```

Option B: GitHub CLI (`gh`)

```bash
gh auth login
gh repo create remoteclaw-workspace --private --source . --remote origin --push
```

Option C: GitLab web UI

1. Create a new **private** repository on GitLab.
2. Do not initialize with a README (avoids merge conflicts).
3. Copy the HTTPS remote URL.
4. Add the remote and push:

```bash
git branch -M main
git remote add origin <https-url>
git push -u origin main
```

### 3) Ongoing updates

```bash
git status
git add .
git commit -m "Update memory"
git push
```

## Do not commit secrets

Even in a private repo, avoid storing secrets in the workspace:

- API keys, OAuth tokens, passwords, or private credentials.
- Anything under `~/.remoteclaw/`.
- Raw dumps of chats or sensitive attachments.

If you must store sensitive references, use placeholders and keep the real
secret elsewhere (password manager, environment variables, or `~/.remoteclaw/`).

Suggested `.gitignore` starter:

```gitignore
.DS_Store
.env
**/*.key
**/*.pem
**/secrets*
```

## Moving the workspace to a new machine

1. Clone the repo to the desired path on the new machine.
2. Set `agents.defaults.workspace` (or per-agent `agents.list[].workspace`)
   to that path in `~/.remoteclaw/remoteclaw.json`.
3. Run `remoteclaw setup` to create the workspace directory if needed.
4. If you need sessions, copy `~/.remoteclaw/agents/<agentId>/sessions/` from the
   old machine separately.

## Advanced notes

- Multi-agent routing can use different workspaces per agent. See
  [Channel routing](/channels/channel-routing) for routing configuration.
- If `agents.defaults.sandbox` is enabled, non-main sessions can use per-session sandbox
  workspaces under `agents.defaults.sandbox.workspaceRoot`.
