/**
 * Slack app manifest builder with configurable transport, scopes, and features.
 */

export type SlackManifestConfig = {
  /** Bot display name (default: "RemoteClaw") */
  botName: string;
  /** Connection mode (default: "socket") */
  transport: "socket" | "http";
  /** Slash command name, or false to omit (default: "remoteclaw") */
  slashCommand: string | false;
  /** Adds chat:write.customize scope for per-message bot name/avatar */
  customIdentity: boolean;
  /** Adds assistant:write scope for Slack native thread streaming */
  streaming: boolean;
};

export const defaultManifestConfig: SlackManifestConfig = {
  botName: "RemoteClaw",
  transport: "socket",
  slashCommand: "remoteclaw",
  customIdentity: false,
  streaming: false,
};

export function buildSlackManifest(config: Partial<SlackManifestConfig> = {}): string {
  const resolved: SlackManifestConfig = { ...defaultManifestConfig, ...config };
  const safeName = resolved.botName.trim() || "RemoteClaw";

  const botScopes: string[] = [
    "chat:write",
    "channels:history",
    "channels:read",
    "groups:history",
    "im:history",
    "mpim:history",
    "users:read",
    "app_mentions:read",
    "reactions:read",
    "reactions:write",
    "pins:read",
    "pins:write",
    "emoji:read",
    "files:read",
    "files:write",
  ];

  if (resolved.slashCommand !== false) {
    botScopes.push("commands");
  }
  if (resolved.customIdentity) {
    botScopes.push("chat:write.customize");
  }
  if (resolved.streaming) {
    botScopes.push("assistant:write");
  }

  const features: Record<string, unknown> = {
    bot_user: {
      display_name: safeName,
      always_online: false,
    },
    app_home: {
      messages_tab_enabled: true,
      messages_tab_read_only_enabled: false,
    },
  };

  if (resolved.slashCommand !== false) {
    features.slash_commands = [
      {
        command: `/${resolved.slashCommand}`,
        description: `Send a message to ${safeName}`,
        should_escape: false,
      },
    ];
  }

  const eventSubscriptions: Record<string, unknown> = {
    bot_events: [
      "app_mention",
      "message.channels",
      "message.groups",
      "message.im",
      "message.mpim",
      "reaction_added",
      "reaction_removed",
      "member_joined_channel",
      "member_left_channel",
      "channel_rename",
      "pin_added",
      "pin_removed",
    ],
  };

  if (resolved.transport === "http") {
    eventSubscriptions.request_url = "https://example.com/slack/events";
  }

  const manifest = {
    display_information: {
      name: safeName,
      description: `${safeName} connector for RemoteClaw`,
    },
    features,
    oauth_config: {
      scopes: {
        bot: botScopes,
      },
    },
    settings: {
      socket_mode_enabled: resolved.transport === "socket",
      event_subscriptions: eventSubscriptions,
    },
  };

  return JSON.stringify(manifest, null, 2);
}
