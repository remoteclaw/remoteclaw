import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { discordPlugin } from "../../extensions/discord/src/channel.js";
import { createTestRegistry } from "../test-utils/channel-plugins.js";
import {
  clearPluginCommands,
  getPluginCommandSpecs,
  listPluginCommands,
  registerPluginCommand,
} from "./commands.js";
import { setActivePluginRegistry } from "./runtime.js";

beforeEach(() => {
  setActivePluginRegistry(
    createTestRegistry([{ pluginId: "discord", source: "test", plugin: discordPlugin }]),
  );
});

afterEach(() => {
  clearPluginCommands();
});

describe("registerPluginCommand", () => {
  it("rejects malformed runtime command shapes", () => {
    const invalidName = registerPluginCommand(
      "demo-plugin",
      // Runtime plugin payloads are untyped; guard at boundary.
      {
        name: undefined as unknown as string,
        description: "Demo",
        handler: async () => ({ text: "ok" }),
      },
    );
    expect(invalidName).toEqual({
      ok: false,
      error: "Command name must be a string",
    });

    const invalidDescription = registerPluginCommand("demo-plugin", {
      name: "demo",
      description: undefined as unknown as string,
      handler: async () => ({ text: "ok" }),
    });
    expect(invalidDescription).toEqual({
      ok: false,
      error: "Command description must be a string",
    });
  });

  it("normalizes command metadata for downstream consumers", () => {
    const result = registerPluginCommand("demo-plugin", {
      name: "  demo_cmd  ",
      description: "  Demo command  ",
      handler: async () => ({ text: "ok" }),
    });
    expect(result).toEqual({ ok: true });
    expect(listPluginCommands()).toEqual([
      {
        name: "demo_cmd",
        description: "Demo command",
        pluginId: "demo-plugin",
      },
    ]);
    expect(getPluginCommandSpecs()).toEqual([
      {
        acceptsArgs: false,
        name: "demo_cmd",
        description: "Demo command",
      },
    ]);
  });

  it("supports provider-specific native command aliases", () => {
    const result = registerPluginCommand("demo-plugin", {
      name: "voice",
      nativeNames: {
        default: "talkvoice",
        discord: "discordvoice",
      },
      description: "Demo command",
      handler: async () => ({ text: "ok" }),
    });

    expect(result).toEqual({ ok: true });
    expect(getPluginCommandSpecs()).toEqual([
      {
        name: "talkvoice",
        description: "Demo command",
        acceptsArgs: false,
      },
    ]);
    expect(getPluginCommandSpecs("discord")).toEqual([
      {
        name: "discordvoice",
        description: "Demo command",
        acceptsArgs: false,
      },
    ]);
    expect(getPluginCommandSpecs("telegram")).toEqual([
      {
        name: "talkvoice",
        description: "Demo command",
        acceptsArgs: false,
      },
    ]);
  });
});
