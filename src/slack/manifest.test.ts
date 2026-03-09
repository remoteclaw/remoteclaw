import { describe, expect, it } from "vitest";
import { buildSlackManifest, defaultManifestConfig } from "./manifest.js";

describe("buildSlackManifest", () => {
  it("produces valid JSON with defaults", () => {
    const json = buildSlackManifest();
    const manifest = JSON.parse(json);
    expect(manifest.display_information.name).toBe("RemoteClaw");
    expect(manifest.settings.socket_mode_enabled).toBe(true);
    expect(manifest.features.slash_commands).toHaveLength(1);
    expect(manifest.features.slash_commands[0].command).toBe("/remoteclaw");
    expect(manifest.oauth_config.scopes.bot).toContain("commands");
  });

  it("uses custom bot name", () => {
    const manifest = JSON.parse(buildSlackManifest({ botName: "MyBot" }));
    expect(manifest.display_information.name).toBe("MyBot");
    expect(manifest.features.bot_user.display_name).toBe("MyBot");
    expect(manifest.display_information.description).toBe("MyBot connector for RemoteClaw");
  });

  it("falls back to RemoteClaw for empty bot name", () => {
    const manifest = JSON.parse(buildSlackManifest({ botName: "  " }));
    expect(manifest.display_information.name).toBe("RemoteClaw");
  });

  describe("transport modes", () => {
    it("enables socket mode by default", () => {
      const manifest = JSON.parse(buildSlackManifest({ transport: "socket" }));
      expect(manifest.settings.socket_mode_enabled).toBe(true);
      expect(manifest.settings.event_subscriptions.request_url).toBeUndefined();
    });

    it("disables socket mode and adds request_url for http", () => {
      const manifest = JSON.parse(buildSlackManifest({ transport: "http" }));
      expect(manifest.settings.socket_mode_enabled).toBe(false);
      expect(manifest.settings.event_subscriptions.request_url).toBe(
        "https://example.com/slack/events",
      );
    });
  });

  describe("slash command", () => {
    it("includes slash command and commands scope by default", () => {
      const manifest = JSON.parse(buildSlackManifest());
      expect(manifest.features.slash_commands).toBeDefined();
      expect(manifest.oauth_config.scopes.bot).toContain("commands");
    });

    it("uses custom slash command name", () => {
      const manifest = JSON.parse(buildSlackManifest({ slashCommand: "mybot" }));
      expect(manifest.features.slash_commands[0].command).toBe("/mybot");
    });

    it("omits slash command and commands scope when false", () => {
      const manifest = JSON.parse(buildSlackManifest({ slashCommand: false }));
      expect(manifest.features.slash_commands).toBeUndefined();
      expect(manifest.oauth_config.scopes.bot).not.toContain("commands");
    });
  });

  describe("optional scopes", () => {
    it("adds chat:write.customize when customIdentity is true", () => {
      const manifest = JSON.parse(buildSlackManifest({ customIdentity: true }));
      expect(manifest.oauth_config.scopes.bot).toContain("chat:write.customize");
    });

    it("omits chat:write.customize by default", () => {
      const manifest = JSON.parse(buildSlackManifest());
      expect(manifest.oauth_config.scopes.bot).not.toContain("chat:write.customize");
    });

    it("adds assistant:write when streaming is true", () => {
      const manifest = JSON.parse(buildSlackManifest({ streaming: true }));
      expect(manifest.oauth_config.scopes.bot).toContain("assistant:write");
    });

    it("omits assistant:write by default", () => {
      const manifest = JSON.parse(buildSlackManifest());
      expect(manifest.oauth_config.scopes.bot).not.toContain("assistant:write");
    });
  });

  it("combines all options", () => {
    const manifest = JSON.parse(
      buildSlackManifest({
        botName: "CustomBot",
        transport: "http",
        slashCommand: "custom",
        customIdentity: true,
        streaming: true,
      }),
    );
    expect(manifest.display_information.name).toBe("CustomBot");
    expect(manifest.settings.socket_mode_enabled).toBe(false);
    expect(manifest.features.slash_commands[0].command).toBe("/custom");
    expect(manifest.oauth_config.scopes.bot).toContain("chat:write.customize");
    expect(manifest.oauth_config.scopes.bot).toContain("assistant:write");
    expect(manifest.oauth_config.scopes.bot).toContain("commands");
  });

  it("always includes core bot events", () => {
    const manifest = JSON.parse(buildSlackManifest());
    const events = manifest.settings.event_subscriptions.bot_events;
    expect(events).toContain("app_mention");
    expect(events).toContain("message.im");
    expect(events).toContain("reaction_added");
    expect(events).toContain("pin_added");
  });

  it("defaultManifestConfig has expected values", () => {
    expect(defaultManifestConfig).toEqual({
      botName: "RemoteClaw",
      transport: "socket",
      slashCommand: "remoteclaw",
      customIdentity: false,
      streaming: false,
    });
  });
});
