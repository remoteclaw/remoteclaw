import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChannelPlugin } from "../channels/plugins/types.js";
import { setActivePluginRegistry } from "../plugins/runtime.js";
import {
  createChannelTestPluginBase,
  createMSTeamsTestPluginBase,
  createTestRegistry,
} from "../test-utils/channel-plugins.js";
import {
  isMarkdownCapableMessageChannel,
  resolveGatewayMessageChannel,
} from "./message-channel.js";

const emptyRegistry = createTestRegistry([]);
const msteamsPlugin: ChannelPlugin = {
  ...createMSTeamsTestPluginBase(),
};

describe("message-channel", () => {
  beforeEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  afterEach(() => {
    setActivePluginRegistry(emptyRegistry);
  });

  it("normalizes gateway message channels and rejects unknown values", () => {
    expect(resolveGatewayMessageChannel("discord")).toBe("discord");
    expect(resolveGatewayMessageChannel(" imsg ")).toBe("imessage");
    expect(resolveGatewayMessageChannel("web")).toBeUndefined();
    expect(resolveGatewayMessageChannel("nope")).toBeUndefined();
  });

  it("normalizes plugin aliases when registered", () => {
    setActivePluginRegistry(
      createTestRegistry([{ pluginId: "msteams", plugin: msteamsPlugin, source: "test" }]),
    );
    expect(resolveGatewayMessageChannel("teams")).toBe("msteams");
  });

  it("reads Matrix markdown capability from bundled channel catalog metadata", async () => {
    const previousBundledPluginsDir = process.env.REMOTECLAW_BUNDLED_PLUGINS_DIR;
    process.env.REMOTECLAW_BUNDLED_PLUGINS_DIR = path.resolve("extensions");
    vi.resetModules();
    try {
      const module = await import("./message-channel.js");
      expect(module.isMarkdownCapableMessageChannel("matrix")).toBe(true);
    } finally {
      if (previousBundledPluginsDir === undefined) {
        delete process.env.REMOTECLAW_BUNDLED_PLUGINS_DIR;
      } else {
        process.env.REMOTECLAW_BUNDLED_PLUGINS_DIR = previousBundledPluginsDir;
      }
      vi.resetModules();
    }
  });

  it("treats registered plugin channels without markdown metadata as plain text", () => {
    setActivePluginRegistry(
      createTestRegistry([
        {
          pluginId: "qa-channel",
          plugin: createChannelTestPluginBase({
            id: "qa-channel",
            label: "QA Channel",
            docsPath: "/channels/qa-channel",
          }),
          source: "test",
        },
      ]),
    );

    expect(isMarkdownCapableMessageChannel("qa-channel")).toBe(false);
  });
});
