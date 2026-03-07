---
title: "Middleware Architecture"
---

# Middleware Architecture

RemoteClaw is **middleware**, not an AI runtime. It connects CLI-based AI
agents to messaging channels without reimplementing the agentic loop.

## The Middleware Model

Traditional AI chat platforms embed the language model, tool execution, and
conversation management into a single process. RemoteClaw takes a different
approach: it acts as a **message router** between messaging channels (WhatsApp,
Telegram, Slack, Discord, etc.) and CLI agent processes that run as
subprocesses.

```
┌────────────┐      ┌─────────────────────┐      ┌──────────────┐
│  Messaging  │ ──▶ │     RemoteClaw       │ ──▶ │  CLI Agent    │
│  Channel    │ ◀── │  (ChannelBridge)     │ ◀── │  (subprocess) │
└────────────┘      └─────────────────────┘      └──────────────┘
                         │          ▲
                         ▼          │
                    ┌──────────┐  ┌──────────┐
                    │ Sessions │  │ MCP Side  │
                    │  (file)  │  │ Effects   │
                    └──────────┘  └──────────┘
```

A channel adapter receives a user message and passes it to the
[ChannelBridge](channel-bridge.md). The bridge looks up session state, builds a
system prompt, spawns the appropriate CLI agent as a subprocess, streams events
back, and delivers the response to the channel.

The agent subprocess is short-lived: it starts, processes one exchange, and
exits. Conversation continuity is maintained by passing a CLI-specific session
ID on each invocation.

## Bring Your Own Agent

RemoteClaw supports any CLI agent that communicates over stdin/stdout (or
stderr) using structured output. Four runtimes ship out of the box:

| Agent    | CLI Command | Structured Output     |
| -------- | ----------- | --------------------- |
| Claude   | `claude`    | Stream JSON on stderr |
| Gemini   | `gemini`    | Stream JSON on stdout |
| Codex    | `codex`     | JSON on stdout        |
| OpenCode | `opencode`  | JSON on stdout        |

Each runtime translates the CLI's native event format into RemoteClaw's
unified `AgentEvent` stream. Adding a new agent means implementing one
interface — see [Agent Runtimes](agent-runtimes.md) for the contract.

## How This Differs from OpenClaw

OpenClaw ran an embedded execution engine (Pi) inside the main process. The
model, tool execution, prompt management, and conversation state all lived
in-process:

```
OpenClaw (single process)
├── Pi execution engine (in-process LLM orchestration)
├── Model provider ecosystem (OpenAI, Anthropic, Google, etc.)
├── Tool execution (in-process)
├── Skills marketplace
└── Session management
```

RemoteClaw replaces all of this with a subprocess boundary:

```
RemoteClaw
├── ChannelBridge (message routing + session tracking)
├── CLI subprocess (claude, gemini, codex, or opencode)
│   ├── LLM interaction (handled by the CLI)
│   ├── Tool execution (handled by the CLI)
│   └── Conversation management (handled by the CLI)
└── MCP server (injected into subprocess for gateway access)
```

The CLI agent owns the agentic loop. RemoteClaw only handles what requires
its infrastructure: session persistence, message delivery, system prompt
injection, and MCP tool bridging to the gateway.

## The Middleware Boundary Principle

RemoteClaw documents and provides capabilities that **require RemoteClaw
infrastructure**:

| RemoteClaw's responsibility         | Agent's responsibility                       |
| ----------------------------------- | -------------------------------------------- |
| Session persistence across messages | Conversation memory within a session         |
| Message delivery to channels        | Deciding what to say                         |
| System prompt with channel context  | Tool execution (web search, file I/O, shell) |
| MCP tools bridging to the gateway   | Model selection and inference                |
| Cron scheduling                     | Code generation and analysis                 |
| Cross-channel message routing       | Any capability the CLI provides natively     |

This principle governs what belongs in RemoteClaw's codebase and
documentation. If a capability works without RemoteClaw infrastructure, it
belongs to the agent CLI, not to RemoteClaw.

## Key Components

| Component                            | Purpose                                         | Documentation |
| ------------------------------------ | ----------------------------------------------- | ------------- |
| [ChannelBridge](channel-bridge.md)   | Orchestrates the full message-handling pipeline | Concepts      |
| [Agent Runtimes](agent-runtimes.md)  | Subprocess management and event translation     | Concepts      |
| [Gateway](../gateway/)               | WebSocket transport for channel adapters        | Gateway docs  |
| [Sessions](session.md)               | Conversation state and scoping                  | Concepts      |
| [Configuration](../configuration.md) | Runtime selection, MCP setup, channel config    | Reference     |
