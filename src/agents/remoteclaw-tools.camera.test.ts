import { beforeEach, describe, expect, it, vi } from "vitest";

const { callGateway } = vi.hoisted(() => ({
  callGateway: vi.fn(),
}));

vi.mock("../gateway/call.js", () => ({ callGateway }));
vi.mock("../media/image-ops.js", () => ({
  getImageMetadata: vi.fn(async () => ({ width: 1, height: 1 })),
  resizeToJpeg: vi.fn(async () => Buffer.from("jpeg")),
}));

import "./test-helpers/fast-core-tools.js";
import { createRemoteClawTools } from "./remoteclaw-tools.js";

const NODE_ID = "mac-1";

function unexpectedGatewayMethod(method: unknown): never {
  throw new Error(`unexpected method: ${String(method)}`);
}

function getNodesTool() {
  const tool = createRemoteClawTools().find((candidate) => candidate.name === "nodes");
  if (!tool) {
    throw new Error("missing nodes tool");
  }
  return tool;
}

async function executeNodes(input: Record<string, unknown>) {
  return getNodesTool().execute("call1", input as never);
}

function mockNodeList(commands?: string[]) {
  return {
    nodes: [{ nodeId: NODE_ID, ...(commands ? { commands } : {}) }],
  };
}

beforeEach(() => {
  callGateway.mockClear();
});

describe("nodes camera_snap", () => {
  it("maps jpg payloads to image/jpeg", async () => {
    callGateway.mockImplementation(async ({ method }) => {
      if (method === "node.list") {
        return mockNodeList();
      }
      if (method === "node.invoke") {
        return {
          payload: {
            format: "jpg",
            base64: "aGVsbG8=",
            width: 1,
            height: 1,
          },
        };
      }
      return unexpectedGatewayMethod(method);
    });

    const result = await executeNodes({
      action: "camera_snap",
      node: NODE_ID,
      facing: "front",
    });

    const images = (result.content ?? []).filter((block) => block.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe("image/jpeg");
  });

  it("passes deviceId when provided", async () => {
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList();
      }
      if (method === "node.invoke") {
        expect(params).toMatchObject({
          command: "camera.snap",
          params: { deviceId: "cam-123" },
        });
        return {
          payload: {
            format: "jpg",
            base64: "aGVsbG8=",
            width: 1,
            height: 1,
          },
        };
      }
      return unexpectedGatewayMethod(method);
    });

    await executeNodes({
      action: "camera_snap",
      node: NODE_ID,
      facing: "front",
      deviceId: "cam-123",
    });
  });
});
