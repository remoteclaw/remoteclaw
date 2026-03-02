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
import { registerBrowserTools } from "./browser.js";

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

describe("registerBrowserTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "mcp-browser-"));
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
    registerBrowserTools(mockServer as any, ctx);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers 1 browser tool", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(1);
  });

  it("browser_request calls browser.request with method and path", async () => {
    mockCallGateway.mockResolvedValueOnce({ status: 200, body: {} });

    const tool = mockServer.tools.get("browser_request");
    await tool!.handler({ method: "GET", path: "/api/tabs" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "browser.request",
        params: expect.objectContaining({
          method: "GET",
          path: "/api/tabs",
        }),
      }),
    );
  });

  it("browser_request passes query, body, and timeoutMs", async () => {
    mockCallGateway.mockResolvedValueOnce({ status: 200 });

    const tool = mockServer.tools.get("browser_request");
    await tool!.handler({
      method: "POST",
      path: "/api/action",
      query: { tab: "1" },
      body: { action: "click" },
      timeoutMs: 5000,
    });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "browser.request",
        params: {
          method: "POST",
          path: "/api/action",
          query: { tab: "1" },
          body: { action: "click" },
          timeoutMs: 5000,
        },
      }),
    );
  });
});
