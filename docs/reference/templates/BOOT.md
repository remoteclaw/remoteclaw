---
title: "Boot Prompt Template"
summary: "Template for a boot prompt file"
read_when:
  - Adding a boot prompt file
---

# Boot Prompt File

Add short, explicit instructions for what RemoteClaw should do on startup (enable `hooks.internal.enabled`).
If the task sends a message, use the message tool and then reply with NO_REPLY.

Reference this file from config:

```json
{
  "agents": {
    "defaults": {
      "boot": {
        "file": "BOOT.md"
      }
    }
  }
}
```

Or use an inline prompt instead:

```json
{
  "agents": {
    "defaults": {
      "boot": {
        "prompt": "Check inbox and summarize unread messages"
      }
    }
  }
}
```
