import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { McpSideEffectsWriter } from "./mcp-side-effects.js";
import { registerAllTools } from "./mcp-tools.js";

// Mock registerPluginTools so it doesn't call the real gateway
vi.mock("./mcp-plugin-tools.js", () => ({
  registerPluginTools: vi.fn().mockResolvedValue(undefined),
}));

// Create a minimal mock McpServer that also captures handler callbacks
function createMockServer() {
  const registeredTools = new Map<string, { description?: string }>();
  // oxlint-disable-next-line typescript/no-explicit-any
  const registeredHandlers = new Map<string, (...args: any[]) => Promise<unknown>>();
  return {
    registeredTools,
    registeredHandlers,
    // oxlint-disable-next-line typescript/no-explicit-any
    registerTool: vi.fn((...args: any[]) => {
      const name = args[0] as string;
      const config = args[1] as { description?: string };
      registeredTools.set(name, config);
      // Capture the handler (last argument) if it's a function
      const last = args[args.length - 1];
      if (typeof last === "function") {
        registeredHandlers.set(name, last);
      }
      return { update: vi.fn(), remove: vi.fn(), disable: vi.fn(), enable: vi.fn() };
    }),
  };
}

function createMockContext(overrides?: Partial<McpHandlerContext>): McpHandlerContext {
  return {
    gatewayUrl: "ws://127.0.0.1:18789",
    gatewayToken: "test-token",
    sessionKey: "test-session",
    sideEffects: new McpSideEffectsWriter("/dev/null"),
    channel: "telegram",
    accountId: "test-account",
    to: "test-target",
    threadId: "test-thread",
    senderIsOwner: true,
    toolProfile: "full",
    ...overrides,
  };
}

describe("registerAllTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;

  beforeEach(() => {
    mockServer = createMockServer();
    ctx = createMockContext();
  });

  it("registers exactly 51 core tools", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    expect(mockServer.registerTool).toHaveBeenCalledTimes(51);
  });

  it("registers all session management tools", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("sessions_list");
    expect(names).toContain("sessions_history");
    expect(names).toContain("sessions_send");
    expect(names).toContain("sessions_spawn");
    expect(names).toContain("session_status");
    expect(names).toContain("agents_list");
    expect(names).toContain("subagents");
  });

  it("registers all channel messaging tools", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("message_send");
    expect(names).toContain("message_reply");
    expect(names).toContain("message_thread_reply");
    expect(names).toContain("message_broadcast");
    expect(names).toContain("message_react");
    expect(names).toContain("message_delete");
    expect(names).toContain("message_send_attachment");
    expect(names).toContain("message_send_with_effect");
    expect(names).toContain("message_pin");
    expect(names).toContain("message_read");
  });

  it("registers all cron scheduling tools", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("cron_status");
    expect(names).toContain("cron_list");
    expect(names).toContain("cron_add");
    expect(names).toContain("cron_update");
    expect(names).toContain("cron_remove");
    expect(names).toContain("cron_run");
    expect(names).toContain("cron_runs");
  });

  it("registers all gateway admin tools", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("gateway_restart");
    expect(names).toContain("gateway_config_get");
    expect(names).toContain("gateway_config_apply");
    expect(names).toContain("gateway_config_patch");
    expect(names).toContain("gateway_config_schema");
  });

  it("registers no duplicate tool names", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = mockServer.registerTool.mock.calls.map((call: unknown[]) => call[0]);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("every tool has a description", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    for (const [name, config] of mockServer.registeredTools) {
      expect(config.description, `tool "${name}" should have a description`).toBeTruthy();
    }
  });

  describe("owner-only tool gating", () => {
    it("registers only 18 tools for non-owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      // 7 session + 10 message + 1 heartbeat = 18 (no cron or gateway)
      expect(mockServer.registerTool).toHaveBeenCalledTimes(18);
    });

    it("does NOT register cron tools for non-owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      expect(names).not.toContain("cron_status");
      expect(names).not.toContain("cron_list");
      expect(names).not.toContain("cron_add");
      expect(names).not.toContain("cron_update");
      expect(names).not.toContain("cron_remove");
      expect(names).not.toContain("cron_run");
      expect(names).not.toContain("cron_runs");
    });

    it("does NOT register gateway tools for non-owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      expect(names).not.toContain("gateway_restart");
      expect(names).not.toContain("gateway_config_get");
      expect(names).not.toContain("gateway_config_apply");
      expect(names).not.toContain("gateway_config_patch");
      expect(names).not.toContain("gateway_config_schema");
    });

    it("still registers session and message tools for non-owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      // Session tools
      expect(names).toContain("sessions_list");
      expect(names).toContain("sessions_history");
      expect(names).toContain("sessions_send");
      // Message tools
      expect(names).toContain("message_send");
      expect(names).toContain("message_reply");
      expect(names).toContain("message_broadcast");
    });

    it("registers all 51 core tools for owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: true });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      expect(mockServer.registerTool).toHaveBeenCalledTimes(51);
    });

    it("does NOT register node tools for non-owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      expect(names).not.toContain("node_list");
      expect(names).not.toContain("node_invoke");
    });

    it("does NOT register canvas tools for non-owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      expect(names).not.toContain("canvas_present");
      expect(names).not.toContain("canvas_snapshot");
    });

    it("does NOT register browser tools for non-owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      expect(names).not.toContain("browser_request");
    });

    it("does NOT register TTS tools for non-owner senders", async () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      expect(names).not.toContain("tts_status");
      expect(names).not.toContain("tts_convert");
    });
  });

  it("registers all node management tools", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("node_list");
    expect(names).toContain("node_describe");
    expect(names).toContain("node_invoke");
    expect(names).toContain("node_rename");
    expect(names).toContain("node_pair_list");
    expect(names).toContain("node_pair_approve");
    expect(names).toContain("node_pair_reject");
  });

  it("registers all canvas tools", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("canvas_present");
    expect(names).toContain("canvas_hide");
    expect(names).toContain("canvas_navigate");
    expect(names).toContain("canvas_eval");
    expect(names).toContain("canvas_snapshot");
    expect(names).toContain("canvas_a2ui_push");
    expect(names).toContain("canvas_a2ui_reset");
  });

  it("registers browser request tool", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("browser_request");
  });

  it("registers all TTS tools", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("tts_status");
    expect(names).toContain("tts_convert");
    expect(names).toContain("tts_providers");
    expect(names).toContain("tts_set_provider");
    expect(names).toContain("tts_enable");
    expect(names).toContain("tts_disable");
  });

  describe("centralized error handling", () => {
    it("returns MCP error response instead of throwing when handler fails", async () => {
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);

      // Pick any registered handler and invoke it — the proxy wrapper
      // calls callMcpGateway which will throw because the gateway mock
      // isn't wired up. This exercises the catch path.
      const handler = mockServer.registeredHandlers.get("sessions_list");
      expect(handler).toBeDefined();

      const result = await handler!({});
      // Should return an MCP-compliant error instead of throwing
      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: expect.stringContaining("Tool error (sessions_list):") }],
      });
    });

    it("includes error message from Error instances", async () => {
      // oxlint-disable-next-line typescript/no-explicit-any
      await registerAllTools(mockServer as any, ctx);
      const handler = mockServer.registeredHandlers.get("gateway_restart");
      expect(handler).toBeDefined();

      const result = await handler!({});
      expect(result).toMatchObject({
        isError: true,
        content: [{ type: "text", text: expect.stringMatching(/Tool error \(gateway_restart\):/) }],
      });
    });
  });
});
