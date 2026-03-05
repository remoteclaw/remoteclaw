---
name: boot
description: "Run boot prompt on gateway startup"
homepage: https://docs.remoteclaw.org/automation/hooks#boot
metadata:
  {
    "remoteclaw":
      {
        "emoji": "🚀",
        "events": ["gateway:startup"],
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with RemoteClaw" }],
      },
  }
---

# Boot Hook

Runs the configured boot prompt at gateway startup for each configured agent scope.

Boot prompt is resolved from config (`agents.defaults.boot` or per-agent `agents.list[].boot`):

- `boot.prompt`: inline prompt text (takes precedence)
- `boot.file`: path to a prompt file (relative to agent workspace directory)
- Neither set: boot is skipped for that agent
