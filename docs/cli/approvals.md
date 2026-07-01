---
summary: "CLI reference for `remoteclaw approvals` and `remoteclaw exec-policy`"
read_when:
  - You want to edit exec approvals from the CLI
  - You need to manage allowlists on gateway or node hosts
title: "Approvals"
---

# `remoteclaw approvals`

Manage exec approvals for the **local host**, **gateway host**, or a **node host**.
By default, commands target the local approvals file on disk. Use `--gateway` to target the gateway, or `--node` to target a specific node.

Alias: `remoteclaw exec-approvals`

Related:

- Exec approvals: [Exec approvals](/tools/exec-approvals)
- Nodes: [Nodes](/nodes)

## `remoteclaw exec-policy`

`remoteclaw exec-policy` is the local convenience command for keeping the requested
`tools.exec.*` config and the local host approvals file aligned in one step.

Use it when you want to:

- inspect the local requested policy, host approvals file, and effective merge
- apply a local preset such as YOLO or deny-all
- synchronize local `tools.exec.*` and local `~/.remoteclaw/exec-approvals.json`

Examples:

```bash
remoteclaw exec-policy show
remoteclaw exec-policy show --json

remoteclaw exec-policy preset yolo
remoteclaw exec-policy preset cautious --json

remoteclaw exec-policy set --host gateway --security full --ask off --ask-fallback full
```

Output modes:

- no `--json`: prints the human-readable table view
- `--json`: prints machine-readable structured output

Current scope:

- `exec-policy` is **local-only**
- it updates the local config file and the local approvals file together
- it does **not** push policy to the gateway host or a node host
- `--host node` is rejected in this command because node exec approvals are fetched from the node at runtime and must be managed through node-targeted approvals commands instead
- `remoteclaw exec-policy show` marks `host=node` scopes as node-managed at runtime instead of deriving an effective policy from the local approvals file

If you need to edit remote host approvals directly, keep using `remoteclaw approvals set --gateway`
or `remoteclaw approvals set --node <id|name|ip>`.

## Common commands

```bash
remoteclaw approvals get
remoteclaw approvals get --node <id|name|ip>
remoteclaw approvals get --gateway
```

`remoteclaw approvals get` now shows the effective exec policy for local, gateway, and node targets:

- requested `tools.exec` policy
- host approvals-file policy
- effective result after precedence rules are applied

Precedence is intentional:

- the host approvals file is the enforceable source of truth
- requested `tools.exec` policy can narrow or broaden intent, but the effective result is still derived from the host rules
- `--node` combines the node host approvals file with gateway `tools.exec` policy, because both still apply at runtime
- if gateway config is unavailable, the CLI falls back to the node approvals snapshot and notes that the final runtime policy could not be computed

## Replace approvals from a file

```bash
remoteclaw approvals set --file ./exec-approvals.json
remoteclaw approvals set --stdin <<'EOF'
{ version: 1, defaults: { security: "full", ask: "off" } }
EOF
remoteclaw approvals set --node <id|name|ip> --file ./exec-approvals.json
remoteclaw approvals set --gateway --file ./exec-approvals.json
```

`set` accepts JSON5, not only strict JSON. Use either `--file` or `--stdin`, not both.

## "Never prompt" / YOLO example

For a host that should never stop on exec approvals, set the host approvals defaults to `full` + `off`:

```bash
remoteclaw approvals set --stdin <<'EOF'
{
  version: 1,
  defaults: {
    security: "full",
    ask: "off",
    askFallback: "full"
  }
}
EOF
```

Node variant:

```bash
remoteclaw approvals set --node <id|name|ip> --stdin <<'EOF'
{
  version: 1,
  defaults: {
    security: "full",
    ask: "off",
    askFallback: "full"
  }
}
EOF
```

This changes the **host approvals file** only. To keep the requested RemoteClaw policy aligned, also set:

```bash
remoteclaw config set tools.exec.host gateway
remoteclaw config set tools.exec.security full
remoteclaw config set tools.exec.ask off
```

Why `tools.exec.host=gateway` in this example:

- `host=auto` still means "sandbox when available, otherwise gateway".
- YOLO is about approvals, not routing.
- If you want host exec even when a sandbox is configured, make the host choice explicit with `gateway` or `/exec host=gateway`.

This matches the current host-default YOLO behavior. Tighten it if you want approvals.

Local shortcut:

```bash
remoteclaw exec-policy preset yolo
```

That local shortcut updates both the requested local `tools.exec.*` config and the
local approvals defaults together. It is equivalent in intent to the manual two-step
setup above, but only for the local machine.

## Allowlist helpers

```bash
remoteclaw approvals allowlist add "~/Projects/**/bin/rg"
remoteclaw approvals allowlist add --agent main --node <id|name|ip> "/usr/bin/uptime"
remoteclaw approvals allowlist add --agent "*" "/usr/bin/uname"

remoteclaw approvals allowlist remove "~/Projects/**/bin/rg"
```

## Common options

`get`, `set`, and `allowlist add|remove` all support:

- `--node <id|name|ip>`
- `--gateway`
- shared node RPC options: `--url`, `--token`, `--timeout`, `--json`

Targeting notes:

- no target flags means the local approvals file on disk
- `--gateway` targets the gateway host approvals file
- `--node` targets one node host after resolving id, name, IP, or id prefix

`allowlist add|remove` also supports:

- `--agent <id>` (defaults to `*`)

## Notes

- `--node` uses the same resolver as `remoteclaw nodes` (id, name, ip, or id prefix).
- `--agent` defaults to `"*"`, which applies to all agents.
- The node host must advertise `system.execApprovals.get/set` (macOS app or headless node host).
- Approvals files are stored per host at `~/.remoteclaw/exec-approvals.json`.

## Related

- [CLI reference](/cli)
- [Exec approvals](/tools/exec-approvals)
