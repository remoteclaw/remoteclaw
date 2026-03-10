---
title: "Agent Middleware Landscape"
description: "A map of 100+ AI agent projects and where agent middleware fits"
---

250,000 stars. 36,900 forks. Five complete language rewrites. And nobody built the one thing
developers kept asking for.

We mapped the AI agent landscape -- every fork, rewrite, bridge, and managed service
we could find -- and discovered a product category that barely exists.

100+ projects want to be your AI agent. Zero connect the one you already have.

## Two Kinds of Users

There are two fundamentally different people evaluating AI agent tools right now:

|                     | Builds Agent Logic                                       | Bridges Existing Agents                   |
| ------------------- | -------------------------------------------------------- | ----------------------------------------- |
| **Many Channels**   | OpenClaw, NanoClaw, AstrBot, CoPaw, LangBot, PocketPaw   | RemoteClaw, cc-connect                    |
| **Few/No Channels** | Nanobot, ZeroClaw, IronClaw, MicroClaw, Moltis, OpenFang | TinyClaw, claude-pipe, Claude-Code-Remote |

The left side is a crowded, well-served market. OpenClaw alone has 250K+ stars and 36,900 forks.
NanoClaw offers the same idea in 15 source files. At least five Rust rewrites compete for the
"same thing, but faster" niche.

The right side is almost empty.

This is the developer who already has Claude Code configured with a custom `~/.claude` directory,
or a Gemini CLI setup they've spent weeks tuning, or a Codex workflow integrated into their team's
process. They do not want a new agent. They want to send a message to the agent they already have
-- from their phone, from a Slack channel, from WhatsApp.

## The Fork Explosion

In February 2026, OpenClaw was forking at 100 per hour. By March, the ecosystem had produced five
complete language rewrites (Rust, Go, Python, Zig, Shell), a dozen managed hosting services, and
over 60 forks with meaningful modifications.

The fork explosion was not about OpenClaw being bad. It was about OpenClaw being almost-right for
too many different use cases. Every fork adjusts the same core product for a different audience:
lighter, more secure, Chinese-market-native, edge-deployable, enterprise-ready.

But almost every fork keeps the same fundamental architecture: a platform that owns the agent loop,
runs its own LLM orchestration, and bundles everything from memory to skills to model management.

## The Missing Category

We call this gap **agent middleware**: software that connects existing AI agents to messaging
channels without owning the agent loop.

The boundary test for agent middleware is simple: does it route through infrastructure, or does it
try to be the agent?

| Agent Middleware                    | Agent Platform                         |
| ----------------------------------- | -------------------------------------- |
| Bridges to your CLI agent           | Runs its own LLM calls                 |
| Preserves your agent's config       | Requires its own configuration         |
| Adds channels, sessions, scheduling | Adds memory, skills, model management  |
| Your `~/.claude` is the agent       | Its built-in orchestrator is the agent |

This is not a quality judgment. Platforms like OpenClaw, NanoClaw, and Nanobot are excellent at what
they do. The distinction is architectural: they own the agent loop, agent middleware does not.

CLI agents ship new capabilities monthly. A platform that bundles its own versions of those
capabilities is building on quicksand. OpenClaw's 294,000 lines of code and 5,300+ open issues
are the natural result. NanoClaw and Nanobot exist because the full platform became too heavy.

Middleware only provides what a CLI agent cannot provide for itself: sessions, channel routing,
scheduling, and gateway services. Everything else is the agent's job.

## The Convergence Evidence

Multiple independent developers arrived at the same conclusion:

| Project              | Runtime                       | Channels                 | Notes                    |
| -------------------- | ----------------------------- | ------------------------ | ------------------------ |
| claude-code-telegram | Claude Code                   | Telegram                 | SDK + CLI fallback, cron |
| ccbot                | Claude Code                   | Telegram                 | tmux-based               |
| claude-pipe          | Claude Code                   | Telegram + Discord       | ~1,000 lines             |
| Claude-Code-Remote   | Claude, Gemini, Cursor        | Email, Discord, Telegram | Multi-runtime            |
| cc-connect           | Claude, Gemini, Codex, Cursor | 8 channels               | Cron, voice              |

**cc-connect** bridges four CLI runtimes to 8 messaging channels with cron scheduling and voice
support. Same multi-runtime, multi-channel concept, implemented as a lightweight bridge.

**LangBot** is the closest thing to production middleware from the Chinese ecosystem: 11+ messaging
platforms, integrations with Dify, Coze, n8n, and other agent runtimes. Pure bridge, no agent logic.

**Claude-to-IM-skill** bridges Claude Code and Codex to Telegram, Discord, and Feishu
simultaneously, with persistent sessions and a permission system.

When 10 developers independently build the same Telegram bridge without knowing about each other,
that is not a trend. It is a product category announcing itself.

## What Agent Middleware Actually Does

If middleware does not own the agent loop, what does it provide?

| Capability           | What It Does                                             | Why a CLI Agent Cannot Do This                  |
| -------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| **Sessions**         | Maps Telegram conversations to persistent agent sessions | CLI agent does not know about Telegram sessions |
| **Channel routing**  | Routes WhatsApp and Slack messages to the same agent     | CLI agent assumes a terminal                    |
| **Scheduling**       | "Analyze revenue at 8am, post to Slack"                  | CLI agent cannot trigger itself                 |
| **Gateway services** | Auth, rate limiting, tool access policies                | CLI agent has no network layer                  |

These capabilities are infrastructure-bound. They only make sense when there is a system between the
user and the agent. The moment you want to access your agent from your phone, you need all of them.

```sh
# What the setup looks like
npm install -g remoteclaw
remoteclaw init --channel telegram --runtime claude
remoteclaw start
```

## The Landscape

Here is a simplified map of how the ecosystem divides. This is not exhaustive -- the data covers
115+ projects across 10 categories.

**Mobile remote control apps** (Happy Coder, CloudCLI) solve the "remote access" need through native
apps rather than messaging. They compete for the same user but through a different channel.

**Bot frameworks** (Botpress, Rasa, Chatwoot) connect to messaging channels but own the conversation
logic. They are platforms, not middleware.

**Agent orchestration frameworks** (LangGraph, CrewAI, AutoGen) build multi-agent systems but do not
provide messaging channel integration. They are infrastructure for agent logic, not for message
delivery.

If you are building a single-channel bridge for Claude Code, [check if RemoteClaw already supports
your channel](/channels).

## Why We Built RemoteClaw

We built RemoteClaw after going deep inside the OpenClaw codebase -- analyzing 5,605 files
across 334 analysis batches -- and realizing that the channel infrastructure was exactly what
developers with existing agents needed, but the platform layer was exactly what they did not.

RemoteClaw is a fork of OpenClaw that strips the platform layer and replaces it with an AgentRuntime
interface. Your CLI agent runs as a subprocess, preserving your configuration untouched. The gateway
handles sessions, channels, and 50 MCP tools. The agent handles everything else.

It is middleware, not a platform. It connects the agent you already have.

This map covers 115+ projects across 10 categories. We are certain we missed some. If you find a
project we missed or a description that needs correction, please
[open an issue](https://github.com/remoteclaw/remoteclaw/issues).

Will the "right side" of this map fill up in 2026, or will platforms absorb the middleware function?
We have a strong opinion. What is yours?
