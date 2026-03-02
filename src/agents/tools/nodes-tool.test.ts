import { beforeEach, describe, expect, it, vi } from "vitest";

type MockFn = (...args: never[]) => unknown;

const gatewayMocks = vi.hoisted(() => ({
  callGatewayTool: vi.fn<MockFn>(),
  readGatewayCallOptions: vi.fn<MockFn>(() => ({})),
}));

const nodeUtilsMocks = vi.hoisted(() => ({
  resolveNodeId: vi.fn<MockFn>(async () => "node-1"),
  listNodes: vi.fn<MockFn>(async () => []),
  resolveNodeIdFromList: vi.fn<MockFn>(() => "node-1"),
}));

const screenMocks = vi.hoisted(() => ({
  parseScreenRecordPayload: vi.fn<MockFn>(() => ({
    base64: "ZmFrZQ==",
    format: "mp4",
    durationMs: 300_000,
    fps: 10,
    screenIndex: 0,
    hasAudio: true,
  })),
  screenRecordTempPath: vi.fn<MockFn>(() => "/tmp/screen-record.mp4"),
  writeScreenRecordToFile: vi.fn<MockFn>(async () => ({ path: "/tmp/screen-record.mp4" })),
}));

vi.mock("./gateway.js", () => ({
  callGatewayTool: (...args: unknown[]) => gatewayMocks.callGatewayTool(...args),
  readGatewayCallOptions: (...args: unknown[]) => gatewayMocks.readGatewayCallOptions(...args),
}));

vi.mock("./nodes-utils.js", () => ({
  resolveNodeId: (...args: unknown[]) => nodeUtilsMocks.resolveNodeId(...args),
  listNodes: (...args: unknown[]) => nodeUtilsMocks.listNodes(...args),
  resolveNodeIdFromList: (...args: unknown[]) => nodeUtilsMocks.resolveNodeIdFromList(...args),
}));

vi.mock("../../cli/nodes-screen.js", () => ({
  parseScreenRecordPayload: (...args: unknown[]) => screenMocks.parseScreenRecordPayload(...args),
  screenRecordTempPath: (...args: unknown[]) => screenMocks.screenRecordTempPath(...args),
  writeScreenRecordToFile: (...args: unknown[]) => screenMocks.writeScreenRecordToFile(...args),
}));

import { createNodesTool } from "./nodes-tool.js";

describe("createNodesTool screen_record duration guardrails", () => {
  beforeEach(() => {
    gatewayMocks.callGatewayTool.mockReset();
    gatewayMocks.readGatewayCallOptions.mockReset();
    gatewayMocks.readGatewayCallOptions.mockReturnValue({});
    nodeUtilsMocks.resolveNodeId.mockClear();
    screenMocks.parseScreenRecordPayload.mockClear();
    screenMocks.writeScreenRecordToFile.mockClear();
  });

  it("caps durationMs schema at 300000", () => {
    const tool = createNodesTool();
    const schema = tool.parameters as {
      properties?: {
        durationMs?: {
          maximum?: number;
        };
      };
    };
    expect(schema.properties?.durationMs?.maximum).toBe(300_000);
  });

  it("clamps screen_record durationMs argument to 300000 before gateway invoke", async () => {
    gatewayMocks.callGatewayTool.mockResolvedValue({ payload: { ok: true } });
    const tool = createNodesTool();

    await tool.execute("call-1", {
      action: "screen_record",
      node: "macbook",
      durationMs: 900_000,
    });

    expect(gatewayMocks.callGatewayTool).toHaveBeenCalledWith(
      "node.invoke",
      {},
      expect.objectContaining({
        params: expect.objectContaining({
          durationMs: 300_000,
        }),
      }),
    );
  });
});
