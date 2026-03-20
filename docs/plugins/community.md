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
by the community, published on npm, and installable with a single command.

```bash
remoteclaw plugins install <npm-spec>
```

## Listed plugins

<CardGroup cols={1}>
  <Card title="DingTalk" href="https://github.com/largezhou/remoteclaw-dingtalk">
    Enterprise robot integration using Stream mode. Supports text, images, and
    file messages via any DingTalk client.

    ```bash
    remoteclaw plugins install @largezhou/ddingtalk
    ```

  </Card>

  <Card title="QQbot" href="https://github.com/sliverp/qqbot">
    Connect to QQ via the QQ Bot API. Supports private chats, group mentions,
    channel messages, and rich media including voice, images, videos, and files.

    ```bash
    remoteclaw plugins install @sliverp/qqbot
    ```

  </Card>

  <Card title="WeChat" href="https://github.com/icesword0760/remoteclaw-wechat">
    Connect to WeChat personal accounts via WeChatPadPro (iPad protocol).
    Supports text, image, and file exchange with keyword-triggered conversations.

    ```bash
    remoteclaw plugins install @icesword760/remoteclaw-wechat
    ```

  </Card>
</CardGroup>

## Submit your plugin

We welcome community plugins that are useful, documented, and safe to operate.

<Steps>
  <Step title="Publish to npm">
    Your plugin must be installable via `remoteclaw plugins install \<npm-spec\>`.
    See [Building Plugins](/plugins/building-plugins) for the full guide.
  </Step>

  <Step title="Host on GitHub">
    Source code must be in a public repository with setup docs and an issue
    tracker.
  </Step>

  <Step title="Open a PR">
    Add your plugin to this page with:

    - Plugin name
    - npm package name
    - GitHub repository URL
    - One-line description
    - Install command

  </Step>
</Steps>

## Quality bar

| Requirement          | Why                                             |
| -------------------- | ----------------------------------------------- |
| Published on npm     | Users need `remoteclaw plugins install` to work |
| Public GitHub repo   | Source review, issue tracking, transparency     |
| Setup and usage docs | Users need to know how to configure it          |
| Active maintenance   | Recent updates or responsive issue handling     |

Low-effort wrappers, unclear ownership, or unmaintained packages may be declined.

## Related

- [Install and Configure Plugins](/tools/plugin) — how to install any plugin
- [Building Plugins](/plugins/building-plugins) — create your own
- [Plugin Manifest](/plugins/manifest) — manifest schema
