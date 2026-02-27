import { describe, it, expect, vi, beforeEach } from "vitest";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { McpSideEffectsWriter } from "./mcp-side-effects.js";
import { registerAllTools } from "./mcp-tools.js";

// Create a minimal mock McpServer
function createMockServer() {
  const registeredTools = new Map<string, { description?: string }>();
  return {
    registeredTools,
    registerTool: vi.fn((name: string, config: { description?: string }) => {
      registeredTools.set(name, config);
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

  it("registers exactly 29 tools", () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    registerAllTools(mockServer as any, ctx);
    expect(mockServer.registerTool).toHaveBeenCalledTimes(29);
  });

  it("registers all session management tools", () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("sessions_list");
    expect(names).toContain("sessions_history");
    expect(names).toContain("sessions_send");
    expect(names).toContain("sessions_spawn");
    expect(names).toContain("session_status");
    expect(names).toContain("agents_list");
    expect(names).toContain("subagents");
  });

  it("registers all channel messaging tools", () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    registerAllTools(mockServer as any, ctx);
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

  it("registers all cron scheduling tools", () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("cron_status");
    expect(names).toContain("cron_list");
    expect(names).toContain("cron_add");
    expect(names).toContain("cron_update");
    expect(names).toContain("cron_remove");
    expect(names).toContain("cron_run");
    expect(names).toContain("cron_runs");
  });

  it("registers all gateway admin tools", () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    registerAllTools(mockServer as any, ctx);
    const names = [...mockServer.registeredTools.keys()];
    expect(names).toContain("gateway_restart");
    expect(names).toContain("gateway_config_get");
    expect(names).toContain("gateway_config_apply");
    expect(names).toContain("gateway_config_patch");
    expect(names).toContain("gateway_config_schema");
  });

  it("registers no duplicate tool names", () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    registerAllTools(mockServer as any, ctx);
    const names = mockServer.registerTool.mock.calls.map((call: unknown[]) => call[0]);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it("every tool has a description", () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    registerAllTools(mockServer as any, ctx);
    for (const [name, config] of mockServer.registeredTools) {
      expect(config.description, `tool "${name}" should have a description`).toBeTruthy();
    }
  });

  describe("owner-only tool gating", () => {
    it("registers only 17 tools for non-owner senders", () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      registerAllTools(mockServer as any, ctx);
      // 7 session + 10 message = 17 (no cron or gateway)
      expect(mockServer.registerTool).toHaveBeenCalledTimes(17);
    });

    it("does NOT register cron tools for non-owner senders", () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      expect(names).not.toContain("cron_status");
      expect(names).not.toContain("cron_list");
      expect(names).not.toContain("cron_add");
      expect(names).not.toContain("cron_update");
      expect(names).not.toContain("cron_remove");
      expect(names).not.toContain("cron_run");
      expect(names).not.toContain("cron_runs");
    });

    it("does NOT register gateway tools for non-owner senders", () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      registerAllTools(mockServer as any, ctx);
      const names = [...mockServer.registeredTools.keys()];
      expect(names).not.toContain("gateway_restart");
      expect(names).not.toContain("gateway_config_get");
      expect(names).not.toContain("gateway_config_apply");
      expect(names).not.toContain("gateway_config_patch");
      expect(names).not.toContain("gateway_config_schema");
    });

    it("still registers session and message tools for non-owner senders", () => {
      ctx = createMockContext({ senderIsOwner: false });
      // oxlint-disable-next-line typescript/no-explicit-any
      registerAllTools(mockServer as any, ctx);
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

    it("registers all 29 tools for owner senders", () => {
      ctx = createMockContext({ senderIsOwner: true });
      // oxlint-disable-next-line typescript/no-explicit-any
      registerAllTools(mockServer as any, ctx);
      expect(mockServer.registerTool).toHaveBeenCalledTimes(29);
    });
  });
});
