import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpSideEffectsWriter } from "../mcp-side-effects.js";
import type { McpHandlerContext } from "./context.js";

vi.mock("../../gateway/call.js", () => ({
  callGateway: vi.fn(),
}));
vi.mock("../../gateway/method-scopes.js", () => ({
  resolveLeastPrivilegeOperatorScopesForMethod: vi.fn().mockReturnValue(["operator.write"]),
}));
vi.mock("../../utils/message-channel.js", () => ({
  GATEWAY_CLIENT_NAMES: { GATEWAY_CLIENT: "agent-client" },
  GATEWAY_CLIENT_MODES: { BACKEND: "backend" },
}));

import { callGateway } from "../../gateway/call.js";
import { registerNodeTools } from "./nodes.js";

const mockCallGateway = vi.mocked(callGateway);

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

describe("registerNodeTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "mcp-nodes-"));
    mockServer = createMockServer();
    ctx = {
      gatewayUrl: "ws://127.0.0.1:18789",
      gatewayToken: "test-token",
      sessionKey: "agent:default:main",
      sideEffects: new McpSideEffectsWriter(join(dir, "effects.ndjson")),
      channel: "telegram",
      accountId: "acc-1",
      to: "chat-123",
      threadId: "",
      senderIsOwner: true,
      toolProfile: "full",
    };
    // oxlint-disable-next-line typescript/no-explicit-any
    registerNodeTools(mockServer as any, ctx);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers 7 node tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(7);
  });

  it("node_list calls node.list", async () => {
    mockCallGateway.mockResolvedValueOnce({ nodes: [] });

    const tool = mockServer.tools.get("node_list");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(expect.objectContaining({ method: "node.list" }));
  });

  it("node_describe calls node.describe with nodeId", async () => {
    mockCallGateway.mockResolvedValueOnce({ nodeId: "node-1" });

    const tool = mockServer.tools.get("node_describe");
    await tool!.handler({ nodeId: "node-1" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "node.describe",
        params: { nodeId: "node-1" },
      }),
    );
  });

  it("node_invoke calls node.invoke with command and params", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("node_invoke");
    await tool!.handler({ nodeId: "node-1", command: "system.run", params: { cmd: "ls" } });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "node.invoke",
        params: expect.objectContaining({
          nodeId: "node-1",
          command: "system.run",
          params: { cmd: "ls" },
          idempotencyKey: expect.any(String),
        }),
      }),
    );
  });

  it("node_rename calls node.rename with nodeId and displayName", async () => {
    mockCallGateway.mockResolvedValueOnce({ nodeId: "node-1", displayName: "My Node" });

    const tool = mockServer.tools.get("node_rename");
    await tool!.handler({ nodeId: "node-1", displayName: "My Node" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "node.rename",
        params: { nodeId: "node-1", displayName: "My Node" },
      }),
    );
  });

  it("node_pair_list calls node.pair.list", async () => {
    mockCallGateway.mockResolvedValueOnce({ requests: [] });

    const tool = mockServer.tools.get("node_pair_list");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "node.pair.list" }),
    );
  });

  it("node_pair_approve calls node.pair.approve with requestId", async () => {
    mockCallGateway.mockResolvedValueOnce({ approved: true });

    const tool = mockServer.tools.get("node_pair_approve");
    await tool!.handler({ requestId: "req-123" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "node.pair.approve",
        params: { requestId: "req-123" },
      }),
    );
  });

  it("node_pair_reject calls node.pair.reject with requestId", async () => {
    mockCallGateway.mockResolvedValueOnce({ rejected: true });

    const tool = mockServer.tools.get("node_pair_reject");
    await tool!.handler({ requestId: "req-456" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "node.pair.reject",
        params: { requestId: "req-456" },
      }),
    );
  });
});
