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
import { registerTtsTools } from "./tts.js";

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

describe("registerTtsTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "mcp-tts-"));
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
    registerTtsTools(mockServer as any, ctx);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers 6 TTS tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(6);
  });

  it("tts_status calls tts.status", async () => {
    mockCallGateway.mockResolvedValueOnce({ enabled: true, provider: "openai" });

    const tool = mockServer.tools.get("tts_status");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(expect.objectContaining({ method: "tts.status" }));
  });

  it("tts_convert calls tts.convert with text", async () => {
    mockCallGateway.mockResolvedValueOnce({ audioPath: "/tmp/audio.mp3" });

    const tool = mockServer.tools.get("tts_convert");
    await tool!.handler({ text: "Hello world" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "tts.convert",
        params: { text: "Hello world" },
      }),
    );
  });

  it("tts_convert passes channel when provided", async () => {
    mockCallGateway.mockResolvedValueOnce({ audioPath: "/tmp/audio.mp3" });

    const tool = mockServer.tools.get("tts_convert");
    await tool!.handler({ text: "Hello", channel: "telegram" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "tts.convert",
        params: { text: "Hello", channel: "telegram" },
      }),
    );
  });

  it("tts_providers calls tts.providers", async () => {
    mockCallGateway.mockResolvedValueOnce({ providers: [] });

    const tool = mockServer.tools.get("tts_providers");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "tts.providers" }),
    );
  });

  it("tts_set_provider calls tts.setProvider with provider", async () => {
    mockCallGateway.mockResolvedValueOnce({ provider: "elevenlabs" });

    const tool = mockServer.tools.get("tts_set_provider");
    await tool!.handler({ provider: "elevenlabs" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "tts.setProvider",
        params: { provider: "elevenlabs" },
      }),
    );
  });

  it("tts_enable calls tts.enable", async () => {
    mockCallGateway.mockResolvedValueOnce({ enabled: true });

    const tool = mockServer.tools.get("tts_enable");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(expect.objectContaining({ method: "tts.enable" }));
  });

  it("tts_disable calls tts.disable", async () => {
    mockCallGateway.mockResolvedValueOnce({ enabled: false });

    const tool = mockServer.tools.get("tts_disable");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "tts.disable" }),
    );
  });
});
