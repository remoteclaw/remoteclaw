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
import { registerCronTools } from "./cron.js";

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

describe("registerCronTools", () => {
  let mockServer: ReturnType<typeof createMockServer>;
  let ctx: McpHandlerContext;
  let dir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), "mcp-cron-"));
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
    registerCronTools(mockServer as any, ctx);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("registers 7 cron tools", () => {
    expect(mockServer.registerTool).toHaveBeenCalledTimes(7);
  });

  it("cron_status calls cron.status", async () => {
    mockCallGateway.mockResolvedValueOnce({ running: true });

    const tool = mockServer.tools.get("cron_status");
    await tool!.handler({});

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({ method: "cron.status" }),
    );
  });

  it("cron_add calls cron.add and records side effect", async () => {
    mockCallGateway.mockResolvedValueOnce({ id: "job-123" });

    const tool = mockServer.tools.get("cron_add");
    await tool!.handler({ job: { name: "test", schedule: { kind: "cron", expr: "0 * * * *" } } });

    expect(mockCallGateway).toHaveBeenCalledWith(expect.objectContaining({ method: "cron.add" }));

    const effects = await readMcpSideEffects(join(dir, "effects.ndjson"));
    expect(effects.cronAdds).toBe(1);
  });

  it("cron_remove calls cron.remove with correct id", async () => {
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const tool = mockServer.tools.get("cron_remove");
    await tool!.handler({ jobId: "job-123" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "cron.remove",
        params: { id: "job-123" },
      }),
    );
  });

  it("cron_run calls cron.run with force mode", async () => {
    mockCallGateway.mockResolvedValueOnce({ triggered: true });

    const tool = mockServer.tools.get("cron_run");
    await tool!.handler({ jobId: "job-456" });

    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "cron.run",
        params: { id: "job-456", mode: "force" },
      }),
    );
  });
});
