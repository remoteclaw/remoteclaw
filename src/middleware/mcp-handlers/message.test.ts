import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { McpSideEffectsWriter } from "../mcp-side-effects.js";
import { readMcpSideEffects } from "../mcp-side-effects.js";
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
import { registerMessageTools } from "./message.js";

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

describe("registerMessageTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "mcp-msg-"));
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
    registerMessageTools(mockServer as any, ctx);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers 10 message tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(10);
  });

  it("message_send calls message:send and records side effect", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("message_send");
    await tool!.handler({ target: "user-1", message: "Hello" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "message:send",
        params: expect.objectContaining({ target: "user-1", message: "Hello" }),
      }),
    );

    const effects = await readMcpSideEffects(join(dir, "effects.ndjson"));
    expect(effects.sentTexts).toEqual(["Hello"]);
    expect(effects.sentTargets[0]).toEqual(
      expect.objectContaining({ tool: "message_send", provider: "telegram", to: "user-1" }),
    );
  });

  it("message_reply calls message:reply and records side effect", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("message_reply");
    await tool!.handler({ message: "Reply text" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "message:reply",
        params: expect.objectContaining({ message: "Reply text", to: "chat-123" }),
      }),
    );

    const effects = await readMcpSideEffects(join(dir, "effects.ndjson"));
    expect(effects.sentTexts).toEqual(["Reply text"]);
  });

  it("message_react does not record side effect", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("message_react");
    await tool!.handler({ emoji: "\u{1F44D}", messageId: "msg-1" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "message:react" }),
    );

    const effects = await readMcpSideEffects(join(dir, "effects.ndjson"));
    expect(effects.sentTexts).toEqual([]);
  });

  it("message_read calls message:readMessages", async () => {
    mockCallGateway.mockResolvedValueOnce({ messages: [] });

    const tool = mockServer.tools.get("message_read");
    await tool!.handler({ limit: 10 });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "message:readMessages",
        params: expect.objectContaining({ channelId: "chat-123", limit: 10 }),
      }),
    );
  });
});
