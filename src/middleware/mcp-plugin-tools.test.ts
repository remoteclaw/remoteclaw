import { describe, expect, it, vi } from "vitest";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { registerPluginTools } from "./mcp-plugin-tools.js";
import { McpSideEffectsWriter } from "./mcp-side-effects.js";

// Mock callMcpGateway to simulate gateway responses
vi.mock("./mcp-handlers/session.js", () => ({
  callMcpGateway: vi.fn(),
}));
import { callMcpGateway } from "./mcp-handlers/session.js";
const mockCallMcpGateway = vi.mocked(callMcpGateway);

function createMockServer() {
  const registeredTools = new Map<
    string,
    { description?: string; inputSchema?: unknown; handler?: unknown }
  >();
  return {
    registeredTools,
    registerTool: vi.fn(
      (name: string, config: { description?: string; inputSchema?: unknown }, handler: unknown) => {
        registeredTools.set(name, { ...config, handler });
        return { update: vi.fn(), remove: vi.fn(), disable: vi.fn(), enable: vi.fn() };
      },
    ),
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

describe("registerPluginTools", () => {
  it("registers plugin tools returned by gateway", async () => {
    mockCallMcpGateway.mockImplementation(async (_ctx, method) => {
      if (method === "plugin:tools:list") {
        return {
          agentId: "default",
          tools: [
            {
              name: "memory_search",
              description: "Search vector memory",
              inputSchema: {
                type: "object",
                properties: {
                  query: { type: "string" },
                  limit: { type: "number" },
                },
                required: ["query"],
              },
            },
            {
              name: "voice_call",
              description: "Initiate a voice call",
              inputSchema: {
                type: "object",
                properties: {
                  number: { type: "string" },
                },
                required: ["number"],
              },
            },
          ],
        };
      }
      return {};
    });

    const server = createMockServer();
    const ctx = createMockContext();
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerPluginTools(server as any, ctx);

    expect(server.registerTool).toHaveBeenCalledTimes(2);
    const names = [...server.registeredTools.keys()];
    expect(names).toContain("memory_search");
    expect(names).toContain("voice_call");
  });

  it("skips registration when gateway returns no tools", async () => {
    mockCallMcpGateway.mockResolvedValue({ agentId: "default", tools: [] });

    const server = createMockServer();
    const ctx = createMockContext();
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerPluginTools(server as any, ctx);

    expect(server.registerTool).not.toHaveBeenCalled();
  });

  it("silently skips when gateway call fails", async () => {
    mockCallMcpGateway.mockRejectedValue(new Error("connection refused"));

    const server = createMockServer();
    const ctx = createMockContext();
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerPluginTools(server as any, ctx);

    expect(server.registerTool).not.toHaveBeenCalled();
  });

  it("tool handler delegates to plugin:tools:invoke", async () => {
    mockCallMcpGateway.mockImplementation(async (_ctx, method, params) => {
      if (method === "plugin:tools:list") {
        return {
          agentId: "default",
          tools: [
            {
              name: "test_tool",
              description: "A test tool",
              inputSchema: {
                type: "object",
                properties: { input: { type: "string" } },
                required: ["input"],
              },
            },
          ],
        };
      }
      if (method === "plugin:tools:invoke") {
        const p = params as { toolName: string; params: Record<string, unknown> };
        return {
          content: [
            { type: "text", text: `invoked ${p.toolName} with ${JSON.stringify(p.params)}` },
          ],
        };
      }
      return {};
    });

    const server = createMockServer();
    const ctx = createMockContext();
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerPluginTools(server as any, ctx);

    // Call the registered handler
    const toolEntry = server.registeredTools.get("test_tool");
    expect(toolEntry?.handler).toBeDefined();
    // oxlint-disable-next-line typescript/no-explicit-any
    const handler = toolEntry!.handler as (args: Record<string, unknown>) => Promise<any>;
    const result = await handler({ input: "hello" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain("invoked test_tool");

    // Verify the invoke call was made with correct params
    expect(mockCallMcpGateway).toHaveBeenCalledWith(
      ctx,
      "plugin:tools:invoke",
      expect.objectContaining({
        toolName: "test_tool",
        params: { input: "hello" },
        sessionKey: "test-session",
      }),
    );
  });

  it("registered tools have correct descriptions", async () => {
    mockCallMcpGateway.mockResolvedValue({
      agentId: "default",
      tools: [
        {
          name: "custom_tool",
          description: "Custom tool description",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    });

    const server = createMockServer();
    const ctx = createMockContext();
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerPluginTools(server as any, ctx);

    expect(server.registerTool).toHaveBeenCalledWith(
      "custom_tool",
      expect.objectContaining({ description: "Custom tool description" }),
      expect.any(Function),
    );
  });
});
