import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpHandlerContext } from "./mcp-handlers/context.js";
import { McpSideEffectsWriter } from "./mcp-side-effects.js";
import { registerAllTools } from "./mcp-tools.js";

// Mock callGateway — all callMcpGateway calls delegate here
vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn().mockResolvedValue({}),
}));

// Import after mock setup so the mock is in place
const { callGateway } = await import("../gateway/call.js");
const mockCallGateway = vi.mocked(callGateway);

// ── Helpers ──────────────────────────────────────────────────────────

function createMockServer() {
  // oxlint-disable-next-line typescript/no-explicit-any
  const registeredTools = new Map<string, { handler: (...args: any[]) => any }>();
  return {
    registeredTools,
    // oxlint-disable-next-line typescript/no-explicit-any
    registerTool: vi.fn((name: string, _config: any, handler?: (...args: any[]) => any) => {
      if (handler) {
        registeredTools.set(name, { handler });
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

// oxlint-disable-next-line typescript/no-explicit-any
function getCallMethods(): string[] {
  // oxlint-disable-next-line typescript/no-explicit-any
  return mockCallGateway.mock.calls.map((c: any[]) => c[0]?.method as string);
}

// ── Tests ────────────────────────────────────────────────────────────

describe("tool hook wrapping", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = createMockServer();
    ctx = createMockContext();
  });

  it("fires hooks.tool.before when an MCP tool is invoked", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);

    const { handler } = mockServer.registeredTools.get("sessions_list")!;
    await handler({ limit: 10 });

    expect(getCallMethods()).toContain("hooks.tool.before");

    const beforeCall = mockCallGateway.mock.calls.find(
      // oxlint-disable-next-line typescript/no-explicit-any
      (c: any[]) => c[0]?.method === "hooks.tool.before",
    );
    expect(beforeCall).toBeDefined();
    // oxlint-disable-next-line typescript/no-explicit-any
    expect((beforeCall![0] as any).params).toEqual(
      expect.objectContaining({ toolName: "sessions_list" }),
    );
  });

  it("fires hooks.tool.after with durationMs after tool execution", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);

    const { handler } = mockServer.registeredTools.get("sessions_list")!;
    await handler({ limit: 10 });

    const afterCall = mockCallGateway.mock.calls.find(
      // oxlint-disable-next-line typescript/no-explicit-any
      (c: any[]) => c[0]?.method === "hooks.tool.after",
    );
    expect(afterCall).toBeDefined();
    // oxlint-disable-next-line typescript/no-explicit-any
    const afterParams = (afterCall![0] as any).params;
    expect(afterParams.toolName).toBe("sessions_list");
    expect(typeof afterParams.durationMs).toBe("number");
    expect(afterParams.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("fires hooks in order: before, tool, after", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);

    const { handler } = mockServer.registeredTools.get("sessions_list")!;
    await handler({ limit: 10 });

    const methods = getCallMethods();
    const beforeIdx = methods.indexOf("hooks.tool.before");
    const toolIdx = methods.indexOf("sessions.list");
    const afterIdx = methods.indexOf("hooks.tool.after");

    expect(beforeIdx).toBeLessThan(toolIdx);
    expect(toolIdx).toBeLessThan(afterIdx);
  });

  it("hook failures do not block tool execution", async () => {
    // oxlint-disable-next-line typescript/no-explicit-any
    mockCallGateway.mockImplementation(async (opts: any) => {
      if (opts.method === "hooks.tool.before" || opts.method === "hooks.tool.after") {
        throw new Error("hook gateway error");
      }
      return {};
    });

    // oxlint-disable-next-line typescript/no-explicit-any
    await registerAllTools(mockServer as any, ctx);

    const { handler } = mockServer.registeredTools.get("sessions_list")!;
    const result = await handler({ limit: 10 });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
  });
});
