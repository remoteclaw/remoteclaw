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
import { registerCanvasTools } from "./canvas.js";

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

describe("registerCanvasTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "mcp-canvas-"));
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
    registerCanvasTools(mockServer as any, ctx);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers 7 canvas tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(7);
  });

  it("canvas_present calls node.invoke with canvas.present command", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("canvas_present");
    await tool!.handler({ nodeId: "node-1", url: "https://example.com" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "node.invoke",
        params: expect.objectContaining({
          nodeId: "node-1",
          command: "canvas.present",
          params: { url: "https://example.com" },
          idempotencyKey: expect.any(String),
        }),
      }),
    );
  });

  it("canvas_present includes placement when coordinates are provided", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("canvas_present");
    await tool!.handler({ nodeId: "node-1", x: 0, y: 0, width: 800, height: 600 });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          command: "canvas.present",
          params: {
            placement: { x: 0, y: 0, width: 800, height: 600 },
          },
        }),
      }),
    );
  });

  it("canvas_hide calls node.invoke with canvas.hide command", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("canvas_hide");
    await tool!.handler({ nodeId: "node-1" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "node.invoke",
        params: expect.objectContaining({
          nodeId: "node-1",
          command: "canvas.hide",
        }),
      }),
    );
  });

  it("canvas_navigate calls node.invoke with canvas.navigate and url", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("canvas_navigate");
    await tool!.handler({ nodeId: "node-1", url: "https://example.com/page" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          command: "canvas.navigate",
          params: { url: "https://example.com/page" },
        }),
      }),
    );
  });

  it("canvas_eval calls node.invoke with canvas.eval and javaScript", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("canvas_eval");
    await tool!.handler({ nodeId: "node-1", javaScript: "document.title" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          command: "canvas.eval",
          params: { javaScript: "document.title" },
        }),
      }),
    );
  });

  it("canvas_snapshot calls node.invoke with canvas.snapshot and format options", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("canvas_snapshot");
    await tool!.handler({ nodeId: "node-1", format: "png", maxWidth: 1024 });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          command: "canvas.snapshot",
          params: { format: "png", maxWidth: 1024, quality: undefined },
        }),
      }),
    );
  });

  it("canvas_a2ui_push calls node.invoke with canvas.a2ui.pushJSONL", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("canvas_a2ui_push");
    await tool!.handler({ nodeId: "node-1", jsonl: '{"type":"text","text":"hello"}' });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          command: "canvas.a2ui.pushJSONL",
          params: { jsonl: '{"type":"text","text":"hello"}' },
        }),
      }),
    );
  });

  it("canvas_a2ui_reset calls node.invoke with canvas.a2ui.reset", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("canvas_a2ui_reset");
    await tool!.handler({ nodeId: "node-1" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          command: "canvas.a2ui.reset",
        }),
      }),
    );
  });
});
