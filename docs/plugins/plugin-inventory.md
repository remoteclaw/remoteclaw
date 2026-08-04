---
summary: "Generated inventory of RemoteClaw plugins shipped in core, published externally, or kept source-only"
read_when:
  - You are deciding whether a plugin ships in the core npm package or installs separately
  - You are updating bundled plugin package metadata or release automation
  - You need the canonical internal vs external plugin list
title: "Plugin inventory"
---

# Plugin inventory

This page is generated from `extensions/*/package.json`, `remoteclaw.plugin.json`,
and the root npm package `files` exclusions. Regenerate it with:

```bash
pnpm plugins:inventory:gen
```

## Definitions

- **Core npm package:** built into the `remoteclaw` npm package and available without a separate plugin install.
- **Official external package:** RemoteClaw-maintained plugin omitted from the core npm package, kept in this official inventory, and installed on demand through ClawHub and/or npm.
- **Source checkout only:** repo-local plugin omitted from published npm artifacts and not advertised as an installable package.

Source checkouts are different from npm installs: after `pnpm install`, bundled
plugins load from `extensions/<id>` so local edits and package-local workspace
dependencies are available.

## Install a plugin

Use the install route in each entry to decide whether install is needed. Plugins
that say `included in RemoteClaw` are already present in the core package.
Official external packages need one install, then a Gateway restart.

For example, Discord is an official external package:

```bash
remoteclaw plugins install @remoteclaw/discord
remoteclaw gateway restart
remoteclaw plugins inspect discord --runtime --json
```

During the launch cutover, ordinary bare package specs still install from npm.
Use `clawhub:@remoteclaw/discord` or `npm:@remoteclaw/discord` when you need an
explicit source. After install, follow the plugin's setup doc, such as
[Discord](/channels/discord), to add credentials and channel config. See
[Manage plugins](/plugins/manage-plugins) for update, uninstall, and publishing
commands.

Each entry lists the package, distribution route, and description.

## Core npm package

59 plugins

- **[admin-http-rpc](/plugins/reference/admin-http-rpc)** (`@remoteclaw/admin-http-rpc`) - included in RemoteClaw. RemoteClaw admin HTTP RPC endpoint.

- **[alibaba](/plugins/reference/alibaba)** (`@remoteclaw/alibaba-provider`) - included in RemoteClaw. Adds video generation provider support.

- **[anthropic](/plugins/reference/anthropic)** (`@remoteclaw/anthropic-provider`) - included in RemoteClaw. Adds Anthropic model provider support to RemoteClaw.

- **[azure-speech](/plugins/reference/azure-speech)** (`@remoteclaw/azure-speech`) - included in RemoteClaw. Azure AI Speech text-to-speech (MP3, native Ogg/Opus voice notes, PCM telephony).

- **[bonjour](/plugins/reference/bonjour)** (`@remoteclaw/bonjour`) - included in RemoteClaw. Advertise the local RemoteClaw gateway over Bonjour/mDNS.

- **[browser](/plugins/reference/browser)** (`@remoteclaw/browser-plugin`) - included in RemoteClaw. Adds agent-callable tools.

- **[byteplus](/plugins/reference/byteplus)** (`@remoteclaw/byteplus-provider`) - included in RemoteClaw. Adds BytePlus, BytePlus Plan model provider support to RemoteClaw.

- **[canvas](/plugins/reference/canvas)** (`@remoteclaw/canvas-plugin`) - included in RemoteClaw. Experimental Canvas control and A2UI rendering surfaces for paired nodes.

- **[codex-supervisor](/plugins/reference/codex-supervisor)** (`@remoteclaw/codex-supervisor`) - included in RemoteClaw. Supervise Codex app-server sessions from RemoteClaw.

- **[cohere](/plugins/reference/cohere)** (`@remoteclaw/cohere-provider`) - included in RemoteClaw; npm; ClawHub: `clawhub:@remoteclaw/cohere-provider`. RemoteClaw Cohere provider plugin.

- **[comfy](/plugins/reference/comfy)** (`@remoteclaw/comfy-provider`) - included in RemoteClaw. Adds ComfyUI model provider support to RemoteClaw.

- **[copilot-proxy](/plugins/reference/copilot-proxy)** (`@remoteclaw/copilot-proxy`) - included in RemoteClaw. Adds Copilot Proxy model provider support to RemoteClaw.

- **[deepgram](/plugins/reference/deepgram)** (`@remoteclaw/deepgram-provider`) - included in RemoteClaw. Adds media understanding provider support. Adds realtime transcription provider support.

- **[document-extract](/plugins/reference/document-extract)** (`@remoteclaw/document-extract-plugin`) - included in RemoteClaw. Extract text and fallback page images from local document attachments.

- **[duckduckgo](/plugins/reference/duckduckgo)** (`@remoteclaw/duckduckgo-plugin`) - included in RemoteClaw. Adds web search provider support.

- **[elevenlabs](/plugins/reference/elevenlabs)** (`@remoteclaw/elevenlabs-speech`) - included in RemoteClaw. Adds media understanding provider support. Adds realtime transcription provider support. Adds text-to-speech provider support.

- **[fal](/plugins/reference/fal)** (`@remoteclaw/fal-provider`) - included in RemoteClaw. Adds fal model provider support to RemoteClaw.

- **[file-transfer](/plugins/reference/file-transfer)** (`@remoteclaw/file-transfer`) - included in RemoteClaw. Fetch, list, and write files on paired nodes via dedicated node commands. Bypasses bash stdout truncation by using base64 over node.invoke for binaries up to 16 MB.

- **[github-copilot](/plugins/reference/github-copilot)** (`@remoteclaw/github-copilot-provider`) - included in RemoteClaw. Adds GitHub Copilot model provider support to RemoteClaw.

- **[google](/plugins/reference/google)** (`@remoteclaw/google-plugin`) - included in RemoteClaw. Adds Google, Google Gemini CLI, Google Vertex model provider support to RemoteClaw.

- **[huggingface](/plugins/reference/huggingface)** (`@remoteclaw/huggingface-provider`) - included in RemoteClaw. Adds Hugging Face model provider support to RemoteClaw.

- **[imessage](/plugins/reference/imessage)** (`@remoteclaw/imessage`) - included in RemoteClaw. Adds the iMessage channel surface for sending and receiving RemoteClaw messages.

- **[litellm](/plugins/reference/litellm)** (`@remoteclaw/litellm-provider`) - included in RemoteClaw. Adds LiteLLM model provider support to RemoteClaw.

- **[llm-task](/plugins/reference/llm-task)** (`@remoteclaw/llm-task`) - included in RemoteClaw. Generic JSON-only LLM tool for structured tasks callable from workflows.

- **[lmstudio](/plugins/reference/lmstudio)** (`@remoteclaw/lmstudio-provider`) - included in RemoteClaw. Adds LM Studio model provider support to RemoteClaw.

- **[memory-core](/plugins/reference/memory-core)** (`@remoteclaw/memory-core`) - included in RemoteClaw. Adds agent-callable tools.

- **[memory-wiki](/plugins/reference/memory-wiki)** (`@remoteclaw/memory-wiki`) - included in RemoteClaw. Persistent wiki compiler and Obsidian-friendly knowledge vault for RemoteClaw.

- **[microsoft](/plugins/reference/microsoft)** (`@remoteclaw/microsoft-speech`) - included in RemoteClaw. Adds text-to-speech provider support.

- **[microsoft-foundry](/plugins/reference/microsoft-foundry)** (`@remoteclaw/microsoft-foundry`) - included in RemoteClaw. Adds Microsoft Foundry model provider support to RemoteClaw.

- **[migrate-claude](/plugins/reference/migrate-claude)** (`@remoteclaw/migrate-claude`) - included in RemoteClaw. Imports Claude Code and Claude Desktop instructions, MCP servers, skills, and safe configuration into RemoteClaw.

- **[migrate-hermes](/plugins/reference/migrate-hermes)** (`@remoteclaw/migrate-hermes`) - included in RemoteClaw. Imports Hermes configuration, memories, skills, and supported credentials into RemoteClaw.

- **[minimax](/plugins/reference/minimax)** (`@remoteclaw/minimax-provider`) - included in RemoteClaw. Adds MiniMax, MiniMax Portal model provider support to RemoteClaw.

- **[mistral](/plugins/reference/mistral)** (`@remoteclaw/mistral-provider`) - included in RemoteClaw. Adds Mistral model provider support to RemoteClaw.

- **[novita](/plugins/reference/novita)** (`@remoteclaw/novita-provider`) - included in RemoteClaw. Adds Novita, Novita AI, Novitaai model provider support to RemoteClaw.

- **[nvidia](/plugins/reference/nvidia)** (`@remoteclaw/nvidia-provider`) - included in RemoteClaw. Adds NVIDIA model provider support to RemoteClaw.

- **[oc-path](/plugins/reference/oc-path)** (`@remoteclaw/oc-path`) - included in RemoteClaw. Adds the remoteclaw path CLI for oc:// workspace file addressing.

- **[ollama](/plugins/reference/ollama)** (`@remoteclaw/ollama-provider`) - included in RemoteClaw. Adds Ollama, Ollama Cloud model provider support to RemoteClaw.

- **[open-prose](/plugins/reference/open-prose)** (`@remoteclaw/open-prose`) - included in RemoteClaw. OpenProse VM skill pack with a /prose slash command.

- **[openai](/plugins/reference/openai)** (`@remoteclaw/openai-provider`) - included in RemoteClaw. Adds OpenAI model provider support to RemoteClaw.

- **[opencode](/plugins/reference/opencode)** (`@remoteclaw/opencode-provider`) - included in RemoteClaw. Adds OpenCode model provider support to RemoteClaw.

- **[opencode-go](/plugins/reference/opencode-go)** (`@remoteclaw/opencode-go-provider`) - included in RemoteClaw. Adds OpenCode Go model provider support to RemoteClaw.

- **[openrouter](/plugins/reference/openrouter)** (`@remoteclaw/openrouter-provider`) - included in RemoteClaw. Adds OpenRouter model provider support to RemoteClaw.

- **[policy](/plugins/reference/policy)** (`@remoteclaw/policy`) - included in RemoteClaw. Adds policy-backed doctor checks for workspace conformance.

- **[runway](/plugins/reference/runway)** (`@remoteclaw/runway-provider`) - included in RemoteClaw. Adds video generation provider support.

- **[senseaudio](/plugins/reference/senseaudio)** (`@remoteclaw/senseaudio-provider`) - included in RemoteClaw. Adds media understanding provider support.

- **[sglang](/plugins/reference/sglang)** (`@remoteclaw/sglang-provider`) - included in RemoteClaw. Adds SGLang model provider support to RemoteClaw.

- **[synthetic](/plugins/reference/synthetic)** (`@remoteclaw/synthetic-provider`) - included in RemoteClaw. Adds Synthetic model provider support to RemoteClaw.

- **[telegram](/plugins/reference/telegram)** (`@remoteclaw/telegram`) - included in RemoteClaw. Adds the Telegram channel surface for sending and receiving RemoteClaw messages.

- **[together](/plugins/reference/together)** (`@remoteclaw/together-provider`) - included in RemoteClaw. Adds Together model provider support to RemoteClaw.

- **[tts-local-cli](/plugins/reference/tts-local-cli)** (`@remoteclaw/tts-local-cli`) - included in RemoteClaw. Adds text-to-speech provider support.

- **[vllm](/plugins/reference/vllm)** (`@remoteclaw/vllm-provider`) - included in RemoteClaw. Adds vLLM model provider support to RemoteClaw.

- **[volcengine](/plugins/reference/volcengine)** (`@remoteclaw/volcengine-provider`) - included in RemoteClaw. Adds Volcengine, Volcengine Plan model provider support to RemoteClaw.

- **[voyage](/plugins/reference/voyage)** (`@remoteclaw/voyage-provider`) - included in RemoteClaw. Adds memory embedding provider support.

- **[vydra](/plugins/reference/vydra)** (`@remoteclaw/vydra-provider`) - included in RemoteClaw. Adds Vydra model provider support to RemoteClaw.

- **[web-readability](/plugins/reference/web-readability)** (`@remoteclaw/web-readability-plugin`) - included in RemoteClaw. Extract readable article content from local HTML web fetch responses.

- **[webhooks](/plugins/reference/webhooks)** (`@remoteclaw/webhooks`) - included in RemoteClaw. Authenticated inbound webhooks that bind external automation to RemoteClaw TaskFlows.

- **[workboard](/plugins/reference/workboard)** (`@remoteclaw/workboard`) - included in RemoteClaw. Dashboard workboard for agent-owned issues and sessions.

- **[xai](/plugins/reference/xai)** (`@remoteclaw/xai-plugin`) - included in RemoteClaw. Adds xAI model provider support to RemoteClaw.

- **[xiaomi](/plugins/reference/xiaomi)** (`@remoteclaw/xiaomi-provider`) - included in RemoteClaw. Adds Xiaomi, Xiaomi Token Plan model provider support to RemoteClaw.

## Official external packages

68 plugins

- **[acpx](/plugins/reference/acpx)** (`@remoteclaw/acpx`) - npm; ClawHub. RemoteClaw ACP runtime backend with plugin-owned session and transport management.

- **[amazon-bedrock](/plugins/reference/amazon-bedrock)** (`@remoteclaw/amazon-bedrock-provider`) - npm; ClawHub. RemoteClaw Amazon Bedrock provider plugin with model discovery, embeddings, and guardrail support.

- **[amazon-bedrock-mantle](/plugins/reference/amazon-bedrock-mantle)** (`@remoteclaw/amazon-bedrock-mantle-provider`) - npm; ClawHub. RemoteClaw Amazon Bedrock Mantle provider plugin for OpenAI-compatible model routing.

- **[anthropic-vertex](/plugins/reference/anthropic-vertex)** (`@remoteclaw/anthropic-vertex-provider`) - npm; ClawHub. RemoteClaw Anthropic Vertex provider plugin for Claude models on Google Vertex AI.

- **[arcee](/plugins/reference/arcee)** (`@remoteclaw/arcee-provider`) - npm; ClawHub: `clawhub:@remoteclaw/arcee-provider`. Adds Arcee model provider support to RemoteClaw.

- **[brave](/plugins/reference/brave)** (`@remoteclaw/brave-plugin`) - npm; ClawHub. RemoteClaw Brave Search provider plugin for web search.

- **[cerebras](/plugins/reference/cerebras)** (`@remoteclaw/cerebras-provider`) - npm; ClawHub: `clawhub:@remoteclaw/cerebras-provider`. Adds Cerebras model provider support to RemoteClaw.

- **[chutes](/plugins/reference/chutes)** (`@remoteclaw/chutes-provider`) - npm; ClawHub: `clawhub:@remoteclaw/chutes-provider`. Adds Chutes model provider support to RemoteClaw.

- **[clickclack](/plugins/reference/clickclack)** (`@remoteclaw/clickclack`) - npm; ClawHub: `clawhub:@remoteclaw/clickclack`. Adds the Clickclack channel surface for sending and receiving RemoteClaw messages.

- **[cloudflare-ai-gateway](/plugins/reference/cloudflare-ai-gateway)** (`@remoteclaw/cloudflare-ai-gateway-provider`) - npm; ClawHub: `clawhub:@remoteclaw/cloudflare-ai-gateway-provider`. Adds Cloudflare AI Gateway model provider support to RemoteClaw.

- **[codex](/plugins/reference/codex)** (`@remoteclaw/codex`) - npm; ClawHub. RemoteClaw Codex app-server harness and model provider plugin with a Codex-managed GPT catalog.

- **[copilot](/plugins/reference/copilot)** (`@remoteclaw/copilot`) - npm; ClawHub: `clawhub:@remoteclaw/copilot`. Registers the GitHub Copilot agent runtime.

- **[deepinfra](/plugins/reference/deepinfra)** (`@remoteclaw/deepinfra-provider`) - npm; ClawHub: `clawhub:@remoteclaw/deepinfra-provider`. Adds DeepInfra model provider support to RemoteClaw.

- **[deepseek](/plugins/reference/deepseek)** (`@remoteclaw/deepseek-provider`) - npm; ClawHub: `clawhub:@remoteclaw/deepseek-provider`. Adds DeepSeek model provider support to RemoteClaw.

- **[diagnostics-otel](/plugins/reference/diagnostics-otel)** (`@remoteclaw/diagnostics-otel`) - npm; ClawHub: `clawhub:@remoteclaw/diagnostics-otel`. RemoteClaw diagnostics OpenTelemetry exporter for metrics, traces, and logs.

- **[diagnostics-prometheus](/plugins/reference/diagnostics-prometheus)** (`@remoteclaw/diagnostics-prometheus`) - npm; ClawHub: `clawhub:@remoteclaw/diagnostics-prometheus`. RemoteClaw diagnostics Prometheus exporter for runtime metrics.

- **[diffs](/plugins/reference/diffs)** (`@remoteclaw/diffs`) - npm; ClawHub. RemoteClaw read-only diff viewer plugin and file renderer for agents.

- **[diffs-language-pack](/plugins/reference/diffs-language-pack)** (`@remoteclaw/diffs-language-pack`) - npm; ClawHub: `clawhub:@remoteclaw/diffs-language-pack`. Adds syntax highlighting for languages outside the default diffs viewer set.

- **[discord](/plugins/reference/discord)** (`@remoteclaw/discord`) - npm; ClawHub. RemoteClaw Discord channel plugin for channels, DMs, commands, and app events.

- **[exa](/plugins/reference/exa)** (`@remoteclaw/exa-plugin`) - npm; ClawHub: `clawhub:@remoteclaw/exa-plugin`. Adds web search provider support.

- **[feishu](/plugins/reference/feishu)** (`@remoteclaw/feishu`) - npm; ClawHub. RemoteClaw Feishu/Lark channel plugin for chats and workplace tools (community maintained by @m1heng).

- **[firecrawl](/plugins/reference/firecrawl)** (`@remoteclaw/firecrawl-plugin`) - npm; ClawHub: `clawhub:@remoteclaw/firecrawl-plugin`. Adds agent-callable tools. Adds web fetch provider support. Adds web search provider support.

- **[fireworks](/plugins/reference/fireworks)** (`@remoteclaw/fireworks-provider`) - npm; ClawHub: `clawhub:@remoteclaw/fireworks-provider`. Adds Fireworks model provider support to RemoteClaw.

- **[gmi](/plugins/reference/gmi)** (`@remoteclaw/gmi-provider`) - npm; ClawHub: `clawhub:@remoteclaw/gmi-provider`. RemoteClaw GMI Cloud provider plugin.

- **[google-meet](/plugins/reference/google-meet)** (`@remoteclaw/google-meet`) - npm; ClawHub. RemoteClaw Google Meet participant plugin for joining calls through Chrome or Twilio transports.

- **[googlechat](/plugins/reference/googlechat)** (`@remoteclaw/googlechat`) - npm; ClawHub. RemoteClaw Google Chat channel plugin for spaces and direct messages.

- **[gradium](/plugins/reference/gradium)** (`@remoteclaw/gradium-speech`) - npm; ClawHub: `clawhub:@remoteclaw/gradium-speech`. Adds text-to-speech provider support.

- **[groq](/plugins/reference/groq)** (`@remoteclaw/groq-provider`) - npm; ClawHub: `clawhub:@remoteclaw/groq-provider`. Adds Groq model provider support to RemoteClaw.

- **[inworld](/plugins/reference/inworld)** (`@remoteclaw/inworld-speech`) - npm; ClawHub: `clawhub:@remoteclaw/inworld-speech`. Inworld streaming text-to-speech (MP3, OGG_OPUS, PCM telephony).

- **[irc](/plugins/reference/irc)** (`@remoteclaw/irc`) - npm; ClawHub: `clawhub:@remoteclaw/irc`. Adds the IRC channel surface for sending and receiving RemoteClaw messages.

- **[kilocode](/plugins/reference/kilocode)** (`@remoteclaw/kilocode-provider`) - npm; ClawHub: `clawhub:@remoteclaw/kilocode-provider`. Adds Kilocode model provider support to RemoteClaw.

- **[kimi](/plugins/reference/kimi)** (`@remoteclaw/kimi-provider`) - npm; ClawHub: `clawhub:@remoteclaw/kimi-provider`. Adds Kimi, Kimi Coding model provider support to RemoteClaw.

- **[line](/plugins/reference/line)** (`@remoteclaw/line`) - npm; ClawHub. RemoteClaw LINE channel plugin for LINE Bot API chats.

- **[llama-cpp](/plugins/reference/llama-cpp)** (`@remoteclaw/llama-cpp-provider`) - npm; ClawHub. Local GGUF embeddings through node-llama-cpp.

- **[lobster](/plugins/reference/lobster)** (`@remoteclaw/lobster`) - npm; ClawHub. Lobster workflow tool plugin for typed pipelines and resumable approvals.

- **[matrix](/plugins/reference/matrix)** (`@remoteclaw/matrix`) - ClawHub: `clawhub:@remoteclaw/matrix`; npm. RemoteClaw Matrix channel plugin for rooms and direct messages.

- **[mattermost](/plugins/reference/mattermost)** (`@remoteclaw/mattermost`) - npm; ClawHub: `clawhub:@remoteclaw/mattermost`. Adds the Mattermost channel surface for sending and receiving RemoteClaw messages.

- **[memory-lancedb](/plugins/reference/memory-lancedb)** (`@remoteclaw/memory-lancedb`) - npm; ClawHub. RemoteClaw LanceDB-backed long-term memory plugin with auto-recall, auto-capture, and vector search.

- **[moonshot](/plugins/reference/moonshot)** (`@remoteclaw/moonshot-provider`) - npm; ClawHub: `clawhub:@remoteclaw/moonshot-provider`. Adds Moonshot model provider support to RemoteClaw.

- **[msteams](/plugins/reference/msteams)** (`@remoteclaw/msteams`) - npm; ClawHub. RemoteClaw Microsoft Teams channel plugin for bot conversations.

- **[nextcloud-talk](/plugins/reference/nextcloud-talk)** (`@remoteclaw/nextcloud-talk`) - npm; ClawHub. RemoteClaw Nextcloud Talk channel plugin for conversations.

- **[nostr](/plugins/reference/nostr)** (`@remoteclaw/nostr`) - npm; ClawHub. RemoteClaw Nostr channel plugin for NIP-04 encrypted direct messages.

- **[openshell](/plugins/reference/openshell)** (`@remoteclaw/openshell-sandbox`) - npm; ClawHub. RemoteClaw sandbox backend for the NVIDIA OpenShell CLI with mirrored local workspaces and SSH command execution.

- **[parallel](/tools/parallel-search)** (`@remoteclaw/parallel-plugin`) - npm; ClawHub: `clawhub:@remoteclaw/parallel-plugin`. Adds web search provider support.

- **[perplexity](/plugins/reference/perplexity)** (`@remoteclaw/perplexity-plugin`) - npm; ClawHub: `clawhub:@remoteclaw/perplexity-plugin`. Adds web search provider support.

- **[pixverse](/plugins/reference/pixverse)** (`@remoteclaw/pixverse-provider`) - npm; ClawHub: `clawhub:@remoteclaw/pixverse-provider`. RemoteClaw PixVerse video generation provider plugin.

- **[qianfan](/plugins/reference/qianfan)** (`@remoteclaw/qianfan-provider`) - npm; ClawHub: `clawhub:@remoteclaw/qianfan-provider`. Adds Qianfan model provider support to RemoteClaw.

- **[qqbot](/plugins/reference/qqbot)** (`@remoteclaw/qqbot`) - npm; ClawHub. RemoteClaw QQ Bot channel plugin for group and direct-message workflows.

- **[qwen](/plugins/reference/qwen)** (`@remoteclaw/qwen-provider`) - npm; ClawHub: `clawhub:@remoteclaw/qwen-provider`. Adds Qwen, Qwen Cloud, Model Studio, DashScope, Qwen Oauth, Qwen Portal, Qwen CLI model provider support to RemoteClaw.

- **[raft](/plugins/reference/raft)** (`@remoteclaw/raft`) - npm; ClawHub. RemoteClaw Raft channel plugin for secure CLI wake bridges.

- **[searxng](/plugins/reference/searxng)** (`@remoteclaw/searxng-plugin`) - npm; ClawHub: `clawhub:@remoteclaw/searxng-plugin`. Adds web search provider support.

- **[signal](/plugins/reference/signal)** (`@remoteclaw/signal`) - npm; ClawHub: `clawhub:@remoteclaw/signal`. Adds the Signal channel surface for sending and receiving RemoteClaw messages.

- **[slack](/plugins/reference/slack)** (`@remoteclaw/slack`) - npm; ClawHub. RemoteClaw Slack channel plugin for channels, DMs, commands, and app events.

- **[sms](/plugins/reference/sms)** (`@remoteclaw/sms`) - npm; ClawHub: `clawhub:@remoteclaw/sms`. Twilio SMS channel plugin for RemoteClaw text messages.

- **[stepfun](/plugins/reference/stepfun)** (`@remoteclaw/stepfun-provider`) - npm; ClawHub: `clawhub:@remoteclaw/stepfun-provider`. Adds StepFun, StepFun Plan model provider support to RemoteClaw.

- **[synology-chat](/plugins/reference/synology-chat)** (`@remoteclaw/synology-chat`) - npm; ClawHub. Synology Chat channel plugin for RemoteClaw channels and direct messages.

- **[tavily](/plugins/reference/tavily)** (`@remoteclaw/tavily-plugin`) - npm; ClawHub: `clawhub:@remoteclaw/tavily-plugin`. Adds agent-callable tools. Adds web search provider support.

- **[tencent](/plugins/reference/tencent)** (`@remoteclaw/tencent-provider`) - npm; ClawHub: `clawhub:@remoteclaw/tencent-provider`. Adds Tencent TokenHub model provider support to RemoteClaw.

- **[tlon](/plugins/reference/tlon)** (`@remoteclaw/tlon`) - npm; ClawHub. RemoteClaw Tlon/Urbit channel plugin for chat workflows.

- **[tokenjuice](/plugins/reference/tokenjuice)** (`@remoteclaw/tokenjuice`) - npm; ClawHub: `clawhub:@remoteclaw/tokenjuice`. Compacts exec and bash tool results with tokenjuice reducers.

- **[twitch](/plugins/reference/twitch)** (`@remoteclaw/twitch`) - npm; ClawHub. RemoteClaw Twitch channel plugin for chat and moderation workflows.

- **[venice](/plugins/reference/venice)** (`@remoteclaw/venice-provider`) - npm; ClawHub: `clawhub:@remoteclaw/venice-provider`. Adds Venice model provider support to RemoteClaw.

- **[vercel-ai-gateway](/plugins/reference/vercel-ai-gateway)** (`@remoteclaw/vercel-ai-gateway-provider`) - npm; ClawHub: `clawhub:@remoteclaw/vercel-ai-gateway-provider`. Adds Vercel AI Gateway model provider support to RemoteClaw.

- **[voice-call](/plugins/reference/voice-call)** (`@remoteclaw/voice-call`) - npm; ClawHub. RemoteClaw voice-call plugin for Twilio, Telnyx, and Plivo phone calls.

- **[whatsapp](/plugins/reference/whatsapp)** (`@remoteclaw/whatsapp`) - ClawHub: `clawhub:@remoteclaw/whatsapp`; npm. RemoteClaw WhatsApp channel plugin for WhatsApp Web chats.

- **[zai](/plugins/reference/zai)** (`@remoteclaw/zai-provider`) - npm; ClawHub: `clawhub:@remoteclaw/zai-provider`. Adds Z.AI model provider support to RemoteClaw.

- **[zalo](/plugins/reference/zalo)** (`@remoteclaw/zalo`) - npm; ClawHub. RemoteClaw Zalo channel plugin for bot and webhook chats.

- **[zalouser](/plugins/reference/zalouser)** (`@remoteclaw/zalouser`) - npm; ClawHub. RemoteClaw Zalo Personal Account plugin via native zca-js integration.

## Source checkout only

3 plugins

- **[qa-channel](/plugins/reference/qa-channel)** (`@remoteclaw/qa-channel`) - source checkout only. Adds the QA Channel surface for sending and receiving RemoteClaw messages.

- **[qa-lab](/plugins/reference/qa-lab)** (`@remoteclaw/qa-lab`) - source checkout only. RemoteClaw QA lab plugin with private debugger UI and scenario runner.

- **[qa-matrix](/plugins/reference/qa-matrix)** (`@remoteclaw/qa-matrix`) - source checkout only. Matrix QA transport runner and substrate.
