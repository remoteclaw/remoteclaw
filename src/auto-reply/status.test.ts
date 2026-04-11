import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeTestText } from "../../test/helpers/normalize-text.js";
import type { RemoteClawConfig } from "../config/config.js";
import {
  buildCommandsMessage,
  buildCommandsMessagePaginated,
  buildHelpMessage,
  buildStatusMessage,
} from "./status.js";

const { listPluginCommands } = vi.hoisted(() => ({
  listPluginCommands: vi.fn(
    (): Array<{ name: string; description: string; pluginId: string }> => [],
  ),
}));

vi.mock("../plugins/commands.js", () => ({
  listPluginCommands,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildStatusMessage", () => {
  it("falls back to sessionEntry levels when resolved levels are not passed", () => {
    const text = buildStatusMessage({
      agent: {
        model: "anthropic/pi:opus",
      } as Record<string, unknown>,
      sessionEntry: {
        sessionId: "abc",
        updatedAt: 0,
        thinkingLevel: "high",
        verboseLevel: "full",
        reasoningLevel: "on",
      },
      sessionKey: "agent:main:main",
      queue: { mode: "collect", depth: 0 },
    });
    const normalized = normalizeTestText(text);

    expect(normalized).toContain("Think: high");
    expect(normalized).toContain("verbose:full");
    expect(normalized).toContain("Reasoning: on");
  });

  it("shows verbose label when enabled", () => {
    const text = buildStatusMessage({
      agent: { model: "anthropic/claude-opus-4-5" } as Record<string, unknown>,
      sessionEntry: { sessionId: "v1", updatedAt: 0 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      resolvedVerbose: "on",
      queue: { mode: "collect", depth: 0 },
    });

    expect(text).toContain("verbose");
  });

  it("does not show verbose label when off", () => {
    const text = buildStatusMessage({
      agent: { model: "anthropic/claude-opus-4-5" } as Record<string, unknown>,
      sessionEntry: { sessionId: "v1", updatedAt: 0 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      resolvedVerbose: "off",
      queue: { mode: "collect", depth: 0 },
    });

    const optionsLine = text.split("\n").find((line) => line.trim().startsWith("⚙️"));
    expect(optionsLine).toBeTruthy();
    expect(optionsLine).not.toContain("verbose");
  });

  it("handles missing agent config gracefully", () => {
    const text = buildStatusMessage({
      agent: {},
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
      modelAuth: "api-key",
    });

    const normalized = normalizeTestText(text);
    expect(normalized).toContain("Model:");
    expect(normalized).toContain("Tokens:");
    expect(normalized).toContain("Queue: collect");
  });

  it("includes group activation for group sessions", () => {
    const text = buildStatusMessage({
      agent: {},
      sessionEntry: {
        sessionId: "g1",
        updatedAt: 0,
        groupActivation: "always",
        chatType: "group",
      },
      sessionKey: "agent:main:whatsapp:group:123@g.us",
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
      modelAuth: "api-key",
    });

    expect(text).toContain("Activation: always");
  });

  it("shows queue details when overridden", () => {
    const text = buildStatusMessage({
      agent: {},
      sessionEntry: { sessionId: "q1", updatedAt: 0 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      queue: {
        mode: "collect",
        depth: 3,
        debounceMs: 2000,
        cap: 5,
        dropPolicy: "old",
        showDetails: true,
      },
      modelAuth: "api-key",
    });

    expect(text).toContain("Queue: collect (depth 3 · debounce 2s · cap 5 · drop old)");
  });

  it("inserts usage summary beneath context line", () => {
    const text = buildStatusMessage({
      agent: { model: "anthropic/claude-opus-4-5" } as Record<string, unknown>,
      sessionEntry: { sessionId: "u1", updatedAt: 0, totalTokens: 1000 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
      usageLine: "📊 Usage: Claude 80% left (5h)",
      modelAuth: "api-key",
    });

    const lines = normalizeTestText(text).split("\n");
    const tokensIndex = lines.findIndex((line) => line.includes("Tokens:"));
    expect(tokensIndex).toBeGreaterThan(-1);
    expect(lines[tokensIndex + 1]).toContain("Usage: Claude 80% left (5h)");
  });

  it("never shows cost line — cost calculation removed", () => {
    const text = buildStatusMessage({
      agent: { model: "anthropic/claude-opus-4-5" } as Record<string, unknown>,
      sessionEntry: { sessionId: "c1", updatedAt: 0, inputTokens: 10 },
      sessionKey: "agent:main:main",
      sessionScope: "per-sender",
      queue: { mode: "collect", depth: 0 },
      modelAuth: "api-key",
    });

    expect(text).not.toContain("💵 Cost:");
  });
});

describe("buildCommandsMessage", () => {
  it("lists commands with aliases and hints", () => {
    const text = buildCommandsMessage({
      commands: { config: false, debug: false },
    } as unknown as RemoteClawConfig);
    expect(text).toContain("ℹ️ Slash commands");
    expect(text).toContain("Status");
    expect(text).toContain("/commands - List all slash commands.");
    expect(text).not.toContain("/config");
    expect(text).not.toContain("/debug");
  });
});

describe("buildHelpMessage", () => {
  it("hides config/debug when disabled", () => {
    const text = buildHelpMessage({
      commands: { config: false, debug: false },
    } as unknown as RemoteClawConfig);
    expect(text).toContain("Session");
    expect(text).toContain("/skill <name> [input]");
    expect(text).not.toContain("/config");
    expect(text).not.toContain("/debug");
  });
});

describe("buildCommandsMessagePaginated", () => {
  it("formats telegram output with pages", () => {
    const result = buildCommandsMessagePaginated(
      {
        commands: { config: false, debug: false },
      } as unknown as RemoteClawConfig,
      { surface: "telegram", page: 1 },
    );
    expect(result.text).toContain("ℹ️ Commands (1/");
    expect(result.text).toContain("Session");
    expect(result.text).toContain("/stop - Stop the current run.");
  });

  it("includes plugin commands in the paginated list", () => {
    listPluginCommands.mockReturnValue([
      { name: "plugin_cmd", description: "Plugin command", pluginId: "demo-plugin" },
    ]);
    const result = buildCommandsMessagePaginated(
      {
        commands: { config: false, debug: false },
      } as unknown as RemoteClawConfig,
      { surface: "telegram", page: 99 },
    );
    expect(result.text).toContain("Plugins");
    expect(result.text).toContain("/plugin_cmd (demo-plugin) - Plugin command");
  });
});
