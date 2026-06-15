---
summary: "Community-maintained RemoteClaw plugins: browse, install, and submit your own"
read_when:
  - You want to find third-party RemoteClaw plugins
  - You want to publish or list your own plugin
title: "Community Plugins"
---

# Community Plugins

Community plugins are third-party packages that extend RemoteClaw with new
channels, tools, providers, or other capabilities. They are built and maintained
by the community, published on [ClawHub](/tools/clawhub) or npm, and
installable with a single command.

ClawHub is the canonical discovery surface for community plugins. Do not open
docs-only PRs just to add your plugin here for discoverability; publish it on
ClawHub instead.

```bash
remoteclaw plugins install <package-name>
```

RemoteClaw checks ClawHub first and falls back to npm automatically.

## Listed plugins

### Apify

Scrape data from any website with 20,000+ ready-made scrapers. Let your agent
extract data from Instagram, Facebook, TikTok, YouTube, Google Maps, Google
Search, e-commerce sites, and more — just by asking.

- **npm:** `@apify/apify-remoteclaw-plugin`
- **repo:** [github.com/apify/apify-remoteclaw-plugin](https://github.com/apify/apify-remoteclaw-plugin)

```bash
remoteclaw plugins install @apify/apify-remoteclaw-plugin
```

### Codex App Server Bridge

Independent RemoteClaw bridge for Codex App Server conversations. Bind a chat to
a Codex thread, talk to it with plain text, and control it with chat-native
commands for resume, planning, review, model selection, compaction, and more.

- **npm:** `remoteclaw-codex-app-server`
- **repo:** [github.com/pwrdrvr/remoteclaw-codex-app-server](https://github.com/pwrdrvr/remoteclaw-codex-app-server)

```bash
remoteclaw plugins install remoteclaw-codex-app-server
```

### DingTalk

Enterprise robot integration using Stream mode. Supports text, images, and
file messages via any DingTalk client.

- **npm:** `@largezhou/ddingtalk`
- **repo:** [github.com/largezhou/remoteclaw-dingtalk](https://github.com/largezhou/remoteclaw-dingtalk)

```bash
remoteclaw plugins install @largezhou/ddingtalk
```

### Lossless Claw (LCM)

Lossless Context Management plugin for RemoteClaw. DAG-based conversation
summarization with incremental compaction — preserves full context fidelity
while reducing token usage.

- **npm:** `@martian-engineering/lossless-claw`
- **repo:** [github.com/Martian-Engineering/lossless-claw](https://github.com/Martian-Engineering/lossless-claw)

```bash
remoteclaw plugins install @martian-engineering/lossless-claw
```

### Opik

Official plugin that exports agent traces to Opik. Monitor agent behavior,
cost, tokens, errors, and more.

- **npm:** `@opik/opik-remoteclaw`
- **repo:** [github.com/comet-ml/opik-remoteclaw](https://github.com/comet-ml/opik-remoteclaw)

```bash
remoteclaw plugins install @opik/opik-remoteclaw
```

### Prometheus Avatar

Give your RemoteClaw agent a Live2D avatar with real-time lip-sync, emotion
expressions, and text-to-speech. Includes creator tools for AI asset generation
and one-click deployment to the Prometheus Marketplace. Currently in alpha.

- **npm:** `@prometheusavatar/remoteclaw-plugin`
- **repo:** [github.com/myths-labs/prometheus-avatar](https://github.com/myths-labs/prometheus-avatar)

```bash
remoteclaw plugins install @prometheusavatar/remoteclaw-plugin
```

### QQbot

Connect RemoteClaw to QQ via the QQ Bot API. Supports private chats, group
mentions, channel messages, and rich media including voice, images, videos,
and files.

- **npm:** `@tencent-connect/remoteclaw-qqbot`
- **repo:** [github.com/tencent-connect/remoteclaw-qqbot](https://github.com/tencent-connect/remoteclaw-qqbot)

```bash
remoteclaw plugins install @tencent-connect/remoteclaw-qqbot
```

### wecom

WeCom channel plugin for RemoteClaw by the Tencent WeCom team. Powered by
WeCom Bot WebSocket persistent connections, it supports direct messages & group
chats, streaming replies, proactive messaging, image/file processing, Markdown
formatting, built-in access control, and document/meeting/messaging skills.

- **npm:** `@wecom/wecom-remoteclaw-plugin`
- **repo:** [github.com/WecomTeam/wecom-remoteclaw-plugin](https://github.com/WecomTeam/wecom-remoteclaw-plugin)

```bash
remoteclaw plugins install @wecom/wecom-remoteclaw-plugin
```

## Submit your plugin

We welcome community plugins that are useful, documented, and safe to operate.

<Steps>
  <Step title="Publish to ClawHub or npm">
    Your plugin must be installable via `remoteclaw plugins install \<package-name\>`.
    Publish to [ClawHub](/tools/clawhub) (preferred) or npm.
    See [Building Plugins](/plugins/building-plugins) for the full guide.

  </Step>

  <Step title="Host on GitHub">
    Source code must be in a public repository with setup docs and an issue
    tracker.

  </Step>

  <Step title="Use docs PRs only for source-doc changes">
    You do not need a docs PR just to make your plugin discoverable. Publish it
    on ClawHub instead.

    Open a docs PR only when RemoteClaw's source docs need an actual content
    change, such as correcting install guidance or adding cross-repo
    documentation that belongs in the main docs set.

  </Step>
</Steps>

## Quality bar

| Requirement                 | Why                                             |
| --------------------------- | ----------------------------------------------- |
| Published on ClawHub or npm | Users need `remoteclaw plugins install` to work |
| Public GitHub repo          | Source review, issue tracking, transparency     |
| Setup and usage docs        | Users need to know how to configure it          |
| Active maintenance          | Recent updates or responsive issue handling     |

Low-effort wrappers, unclear ownership, or unmaintained packages may be declined.

## Related

- [Install and Configure Plugins](/tools/plugin) — how to install any plugin
- [Building Plugins](/plugins/building-plugins) — create your own
- [Plugin Manifest](/plugins/manifest) — manifest schema
