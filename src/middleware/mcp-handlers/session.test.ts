import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpSideEffectsWriter } from "../mcp-side-effects.js";
import type { McpHandlerContext } from "./context.js";

// Mock gateway modules
vi.mock("../../gateway/call.js", () => ({
  callGateway: vi.fn(),
}));
vi.mock("../../gateway/method-scopes.js", () => ({
  resolveLeastPrivilegeOperatorScopesForMethod: vi.fn().mockReturnValue(["operator.read"]),
}));
vi.mock("../../utils/message-channel.js", () => ({
  GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "agent-client" },
  GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
}));

import { callGateway } from "../../gateway/call.js";
import { callMcpGateway, registerSessionTools } from "./session.js";

const mockCallGateway = vi.mocked(callGateway);

function createMockContext(): McpHandlerContext {
  return {
    gatewayUrl: "ws://127.0.0.1:18789",
    gatewayToken: "test-token",
    sessionKey: "agent:default:main",
    sideEffects: new McpSideEffectsWriter("/dev/null"),
    channel: "telegram",
    accountId: "test-account",
    to: "test-target",
    threadId: "",
    senderIsOwner: true,
    toolProfile: "full",
  };
}

function createMockServer() {
  const tools = new Map<string, { handler: Function; config: Record<string, unknown> }>();
  return {
    tools,
    registerTool: vi.fn((name: string, config: Record<string, unknown>, handler: Function) => {
      tools.set(name, { handler, config });
      return { update: vi.fn(), remove: vi.fn(), disable: vi.fn(), enable: vi.fn() };
    }),
  };
}

describe("callMcpGateway", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls gateway with correct parameters", async () => {
    const ctx = createMockContext();
    mockCallGateway.mockResolvedValueOnce({ sessions: [] });

    const result = await callMcpGateway(ctx, "sessions.list", { limit: 10 });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "ws://127.0.0.1:18789",
        token: "test-token",
        method: "sessions.list",
        params: { limit: 10 },
        timeoutMs: 30_000,
      }),
    );
    expect(result).toEqual({ sessions: [] });
  });
});

describe("registerSessionTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    ctx = createMockContext();
    // oxlint-disable-next-line typescript/no-explicit-any
    registerSessionTools(mockServer as any, ctx);
  });

  it("registers 7 session tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(7);
  });

  it("sessions_list calls sessions.list gateway method", async () => {
    mockCallGateway.mockResolvedValueOnce({ sessions: [{ key: "main" }] });

    const tool = mockServer.tools.get("sessions_list");
    const result = await tool!.handler({ limit: 5 });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "sessions.list" }),
    );
    expect(result.content[0].type).toBe("text");
  });

  it("sessions_history calls chat.history gateway method", async () => {
    mockCallGateway.mockResolvedValueOnce({ messages: [] });

    const tool = mockServer.tools.get("sessions_history");
    await tool!.handler({ sessionKey: "agent:default:main", limit: 10 });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "chat.history",
        params: { sessionKey: "agent:default:main", limit: 10 },
      }),
    );
  });

  it("agents_list calls agents.list gateway method", async () => {
    mockCallGateway.mockResolvedValueOnce({ agents: [] });

    const tool = mockServer.tools.get("agents_list");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "agents.list" }),
    );
  });

  it("session_status defaults to current session key", async () => {
    mockCallGateway.mockResolvedValueOnce({ status: "active" });

    const tool = mockServer.tools.get("session_status");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "status",
        params: { sessionKey: "agent:default:main" },
      }),
    );
  });
});
