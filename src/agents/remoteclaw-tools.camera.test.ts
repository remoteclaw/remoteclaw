import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readFileUtf8AndCleanup,
  stubFetchTextResponse,
} from "../test-utils/camera-url-test-helpers.js";

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
const BASE_RUN_INPUT = { action: "run", node: NODE_ID, command: ["echo", "hi"] } as const;
const JPG_PAYLOAD = {
  format: "jpg",
  base64: "aGVsbG8=",
  width: 1,
  height: 1,
} as const;

function unexpectedGatewayMethod(method: unknown): never {
  throw new Error(`unexpected method: ${String(method)}`);
}

function getNodesTool(options?: { modelHasVision?: boolean }) {
  const tool = createRemoteClawTools(
    options?.modelHasVision !== undefined ? { modelHasVision: options.modelHasVision } : {},
  ).find((candidate) => candidate.name === "nodes");
  if (!tool) {
    throw new Error("missing nodes tool");
  }
  return tool;
}

async function executeNodes(
  input: Record<string, unknown>,
  options?: { modelHasVision?: boolean },
) {
  return getNodesTool(options).execute("call1", input as never);
}

type NodesToolResult = Awaited<ReturnType<typeof executeNodes>>;
type GatewayMockResult = Record<string, unknown> | null | undefined;
type GatewayCall = { method: string; params?: Record<string, unknown> };

function mockNodeList(params?: { commands?: string[]; remoteIp?: string }) {
  return {
    nodes: [
      {
        nodeId: NODE_ID,
        ...(params?.commands ? { commands: params.commands } : {}),
        ...(params?.remoteIp ? { remoteIp: params.remoteIp } : {}),
      },
    ],
  };
}

function expectSingleImage(result: NodesToolResult, params?: { mimeType?: string }) {
  const images = (result.content ?? []).filter((block) => block.type === "image");
  expect(images).toHaveLength(1);
  if (params?.mimeType) {
    expect(images[0]?.mimeType).toBe(params.mimeType);
  }
}

function expectNoImages(result: NodesToolResult) {
  const images = (result.content ?? []).filter((block) => block.type === "image");
  expect(images).toHaveLength(0);
}

function setupNodeInvokeMock(params: {
  commands?: string[];
  remoteIp?: string;
  onInvoke?: (invokeParams: unknown) => GatewayMockResult | Promise<GatewayMockResult>;
  invokePayload?: unknown;
}) {
  callGateway.mockImplementation(async ({ method, params: invokeParams }: GatewayCall) => {
    if (method === "node.list") {
      return mockNodeList({ commands: params.commands, remoteIp: params.remoteIp });
    }
    if (method === "node.invoke") {
      if (params.onInvoke) {
        return await params.onInvoke(invokeParams);
      }
      if (params.invokePayload !== undefined) {
        return { payload: params.invokePayload };
      }
      return { payload: {} };
    }
    return unexpectedGatewayMethod(method);
  });
}

beforeEach(() => {
  callGateway.mockClear();
  vi.unstubAllGlobals();
});

describe("nodes camera_snap", () => {
  it("uses front/high-quality defaults when params are omitted", async () => {
    setupNodeInvokeMock({
      onInvoke: (invokeParams) => {
        expect(invokeParams).toMatchObject({
          command: "camera.snap",
          params: {
            facing: "front",
            maxWidth: 1600,
            quality: 0.95,
          },
        });
        return { payload: JPG_PAYLOAD };
      },
    });

    const result = await executeNodes(
      {
        action: "camera_snap",
        node: NODE_ID,
      },
      { modelHasVision: true },
    );

    expectSingleImage(result);
  });

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

    const result = await executeNodes(
      {
        action: "camera_snap",
        node: NODE_ID,
        facing: "front",
      },
      { modelHasVision: true },
    );

    const images = (result.content ?? []).filter((block) => block.type === "image");
    expect(images).toHaveLength(1);
    expect(images[0]?.mimeType).toBe("image/jpeg");
  });

  it("omits inline base64 image blocks when model has no vision", async () => {
    setupNodeInvokeMock({
      invokePayload: JPG_PAYLOAD,
    });

    const result = await executeNodes(
      {
        action: "camera_snap",
        node: NODE_ID,
        facing: "front",
      },
      { modelHasVision: false },
    );

    expectNoImages(result);
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(/^MEDIA:/),
    });
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

  it("rejects facing both when deviceId is provided", async () => {
    await expect(
      executeNodes({
        action: "camera_snap",
        node: NODE_ID,
        facing: "both",
        deviceId: "cam-123",
      }),
    ).rejects.toThrow(/facing=both is not allowed when deviceId is set/i);
  });

  it("downloads camera_snap url payloads when node remoteIp is available", async () => {
    stubFetchTextResponse("url-image");
    setupNodeInvokeMock({
      remoteIp: "198.51.100.42",
      invokePayload: {
        format: "jpg",
        url: "https://198.51.100.42/snap.jpg",
        width: 1,
        height: 1,
      },
    });

    const result = await executeNodes({
      action: "camera_snap",
      node: NODE_ID,
      facing: "front",
    });

    expect(result.content?.[0]).toMatchObject({ type: "text" });
    const mediaPath = String((result.content?.[0] as { text?: string } | undefined)?.text ?? "")
      .replace(/^MEDIA:/, "")
      .trim();
    await expect(readFileUtf8AndCleanup(mediaPath)).resolves.toBe("url-image");
  });

  it("rejects camera_snap url payloads when node remoteIp is missing", async () => {
    stubFetchTextResponse("url-image");
    setupNodeInvokeMock({
      invokePayload: {
        format: "jpg",
        url: "https://198.51.100.42/snap.jpg",
        width: 1,
        height: 1,
      },
    });

    await expect(
      executeNodes({
        action: "camera_snap",
        node: NODE_ID,
        facing: "front",
      }),
    ).rejects.toThrow(/node remoteip/i);
  });
});

describe("nodes camera_clip", () => {
  it("downloads camera_clip url payloads when node remoteIp is available", async () => {
    stubFetchTextResponse("url-clip");
    setupNodeInvokeMock({
      remoteIp: "198.51.100.42",
      invokePayload: {
        format: "mp4",
        url: "https://198.51.100.42/clip.mp4",
        durationMs: 1200,
        hasAudio: false,
      },
    });

    const result = await executeNodes({
      action: "camera_clip",
      node: NODE_ID,
      facing: "front",
    });
    const filePath = String((result.content?.[0] as { text?: string } | undefined)?.text ?? "")
      .replace(/^FILE:/, "")
      .trim();
    await expect(readFileUtf8AndCleanup(filePath)).resolves.toBe("url-clip");
  });

  it("rejects camera_clip url payloads when node remoteIp is missing", async () => {
    stubFetchTextResponse("url-clip");
    setupNodeInvokeMock({
      invokePayload: {
        format: "mp4",
        url: "https://198.51.100.42/clip.mp4",
        durationMs: 1200,
        hasAudio: false,
      },
    });

    await expect(
      executeNodes({
        action: "camera_clip",
        node: NODE_ID,
        facing: "front",
      }),
    ).rejects.toThrow(/node remoteip/i);
  });
});

describe("nodes photos_latest", () => {
  it("returns empty content/details when no photos are available", async () => {
    setupNodeInvokeMock({
      onInvoke: (invokeParams) => {
        expect(invokeParams).toMatchObject({
          command: "photos.latest",
          params: {
            limit: 1,
            maxWidth: 1600,
            quality: 0.85,
          },
        });
        return {
          payload: {
            photos: [],
          },
        };
      },
    });

    const result = await executeNodes(
      {
        action: "photos_latest",
        node: NODE_ID,
      },
      { modelHasVision: false },
    );

    expect(result.content ?? []).toEqual([]);
    expect(result.details).toEqual([]);
  });

  it("returns MEDIA paths and no inline images when model has no vision", async () => {
    setupNodeInvokeMock({
      remoteIp: "198.51.100.42",
      onInvoke: (invokeParams) => {
        expect(invokeParams).toMatchObject({
          command: "photos.latest",
          params: {
            limit: 1,
            maxWidth: 1600,
            quality: 0.85,
          },
        });
        return {
          payload: {
            photos: [
              {
                format: "jpeg",
                base64: "aGVsbG8=",
                width: 1,
                height: 1,
                createdAt: "2026-03-04T00:00:00Z",
              },
            ],
          },
        };
      },
    });

    const result = await executeNodes(
      {
        action: "photos_latest",
        node: NODE_ID,
      },
      { modelHasVision: false },
    );

    expectNoImages(result);
    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(/^MEDIA:/),
    });
    const details = Array.isArray(result.details) ? result.details : [];
    expect(details[0]).toMatchObject({
      width: 1,
      height: 1,
      createdAt: "2026-03-04T00:00:00Z",
    });
  });

  it("includes inline image blocks when model has vision", async () => {
    setupNodeInvokeMock({
      onInvoke: (invokeParams) => {
        expect(invokeParams).toMatchObject({
          command: "photos.latest",
          params: {
            limit: 1,
            maxWidth: 1600,
            quality: 0.85,
          },
        });
        return {
          payload: {
            photos: [
              {
                format: "jpeg",
                base64: "aGVsbG8=",
                width: 1,
                height: 1,
                createdAt: "2026-03-04T00:00:00Z",
              },
            ],
          },
        };
      },
    });

    const result = await executeNodes(
      {
        action: "photos_latest",
        node: NODE_ID,
      },
      { modelHasVision: true },
    );

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringMatching(/^MEDIA:/),
    });
    expectSingleImage(result, { mimeType: "image/jpeg" });
  });
});

describe("nodes notifications_list", () => {
  it("invokes notifications.list and returns payload", async () => {
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["notifications.list"] });
      }
      if (method === "node.invoke") {
        expect(params).toMatchObject({
          nodeId: NODE_ID,
          command: "notifications.list",
          params: {},
        });
        return {
          payload: {
            enabled: true,
            connected: true,
            count: 1,
            notifications: [{ key: "n1", packageName: "com.example.app" }],
          },
        };
      }
      return unexpectedGatewayMethod(method);
    });

    const result = await executeNodes({
      action: "notifications_list",
      node: NODE_ID,
    });

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"notifications"'),
    });
  });
});

describe("nodes notifications_action", () => {
  it("invokes notifications.actions dismiss", async () => {
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["notifications.actions"] });
      }
      if (method === "node.invoke") {
        expect(params).toMatchObject({
          nodeId: NODE_ID,
          command: "notifications.actions",
          params: {
            key: "n1",
            action: "dismiss",
          },
        });
        return { payload: { ok: true, key: "n1", action: "dismiss" } };
      }
      return unexpectedGatewayMethod(method);
    });

    const result = await executeNodes({
      action: "notifications_action",
      node: NODE_ID,
      notificationKey: "n1",
      notificationAction: "dismiss",
    });

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"dismiss"'),
    });
  });
});

describe("nodes device_status and device_info", () => {
  it("invokes device.status and returns payload", async () => {
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["device.status", "device.info"] });
      }
      if (method === "node.invoke") {
        expect(params).toMatchObject({
          nodeId: NODE_ID,
          command: "device.status",
          params: {},
        });
        return {
          payload: {
            battery: { state: "charging", lowPowerModeEnabled: false },
          },
        };
      }
      return unexpectedGatewayMethod(method);
    });

    const result = await executeNodes({
      action: "device_status",
      node: NODE_ID,
    });

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"battery"'),
    });
  });

  it("invokes device.info and returns payload", async () => {
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["device.status", "device.info"] });
      }
      if (method === "node.invoke") {
        expect(params).toMatchObject({
          nodeId: NODE_ID,
          command: "device.info",
          params: {},
        });
        return {
          payload: {
            systemName: "Android",
            appVersion: "1.0.0",
          },
        };
      }
      return unexpectedGatewayMethod(method);
    });

    const result = await executeNodes({
      action: "device_info",
      node: NODE_ID,
    });

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"systemName"'),
    });
  });

  it("invokes device.permissions and returns payload", async () => {
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["device.permissions"] });
      }
      if (method === "node.invoke") {
        expect(params).toMatchObject({
          nodeId: NODE_ID,
          command: "device.permissions",
          params: {},
        });
        return {
          payload: {
            permissions: {
              camera: { status: "granted", promptable: false },
            },
          },
        };
      }
      return unexpectedGatewayMethod(method);
    });

    const result = await executeNodes({
      action: "device_permissions",
      node: NODE_ID,
    });

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"permissions"'),
    });
  });

  it("invokes device.health and returns payload", async () => {
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["device.health"] });
      }
      if (method === "node.invoke") {
        expect(params).toMatchObject({
          nodeId: NODE_ID,
          command: "device.health",
          params: {},
        });
        return {
          payload: {
            memory: { pressure: "normal" },
            battery: { chargingType: "usb" },
          },
        };
      }
      return unexpectedGatewayMethod(method);
    });

    const result = await executeNodes({
      action: "device_health",
      node: NODE_ID,
    });

    expect(result.content?.[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining('"memory"'),
    });
  });
});

describe("nodes run", () => {
  it("passes invoke and command timeouts", async () => {
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["system.run"] });
      }
      if (method === "node.invoke") {
        expect(params).toMatchObject({
          nodeId: NODE_ID,
          command: "system.run",
          timeoutMs: 45_000,
          params: {
            command: ["echo", "hi"],
            cwd: "/tmp",
            env: { FOO: "bar" },
            timeoutMs: 12_000,
          },
        });
        return {
          payload: { stdout: "", stderr: "", exitCode: 0, success: true },
        };
      }
      return unexpectedGatewayMethod(method);
    });

    await executeNodes({
      ...BASE_RUN_INPUT,
      cwd: "/tmp",
      env: ["FOO=bar"],
      commandTimeoutMs: 12_000,
      invokeTimeoutMs: 45_000,
    });
  });

  it("requests approval and retries with allow-once decision", async () => {
    let invokeCalls = 0;
    let approvalId: string | null = null;
    callGateway.mockImplementation(async ({ method, params }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["system.run"] });
      }
      if (method === "node.invoke") {
        invokeCalls += 1;
        if (invokeCalls === 1) {
          throw new Error("SYSTEM_RUN_DENIED: approval required");
        }
        expect(params).toMatchObject({
          nodeId: NODE_ID,
          command: "system.run",
          params: {
            command: ["echo", "hi"],
            runId: approvalId,
            approved: true,
            approvalDecision: "allow-once",
          },
        });
        return { payload: { stdout: "", stderr: "", exitCode: 0, success: true } };
      }
      if (method === "exec.approval.request") {
        expect(params).toMatchObject({
          id: expect.any(String),
          command: "echo hi",
          nodeId: NODE_ID,
          host: "node",
          timeoutMs: 120_000,
        });
        approvalId =
          typeof (params as { id?: unknown } | undefined)?.id === "string"
            ? ((params as { id: string }).id ?? null)
            : null;
        return { decision: "allow-once" };
      }
      return unexpectedGatewayMethod(method);
    });

    await executeNodes(BASE_RUN_INPUT);
    expect(invokeCalls).toBe(2);
  });

  it("fails with user denied when approval decision is deny", async () => {
    callGateway.mockImplementation(async ({ method }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["system.run"] });
      }
      if (method === "node.invoke") {
        throw new Error("SYSTEM_RUN_DENIED: approval required");
      }
      if (method === "exec.approval.request") {
        return { decision: "deny" };
      }
      return unexpectedGatewayMethod(method);
    });

    await expect(executeNodes(BASE_RUN_INPUT)).rejects.toThrow("exec denied: user denied");
  });

  it("fails closed for timeout and invalid approval decisions", async () => {
    callGateway.mockImplementation(async ({ method }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["system.run"] });
      }
      if (method === "node.invoke") {
        throw new Error("SYSTEM_RUN_DENIED: approval required");
      }
      if (method === "exec.approval.request") {
        return {};
      }
      return unexpectedGatewayMethod(method);
    });
    await expect(executeNodes(BASE_RUN_INPUT)).rejects.toThrow("exec denied: approval timed out");

    callGateway.mockImplementation(async ({ method }) => {
      if (method === "node.list") {
        return mockNodeList({ commands: ["system.run"] });
      }
      if (method === "node.invoke") {
        throw new Error("SYSTEM_RUN_DENIED: approval required");
      }
      if (method === "exec.approval.request") {
        return { decision: "allow-never" };
      }
      return unexpectedGatewayMethod(method);
    });
    await expect(executeNodes(BASE_RUN_INPUT)).rejects.toThrow(
      "exec denied: invalid approval decision",
    );
  });
});

describe("nodes invoke", () => {
  it("allows metadata-only camera.list via generic invoke", async () => {
    setupNodeInvokeMock({
      onInvoke: (invokeParams) => {
        expect(invokeParams).toMatchObject({
          command: "camera.list",
          params: {},
        });
        return {
          payload: {
            devices: [{ id: "cam-back", name: "Back Camera" }],
          },
        };
      },
    });

    const result = await executeNodes({
      action: "invoke",
      node: NODE_ID,
      invokeCommand: "camera.list",
    });

    expect(result.details).toMatchObject({
      payload: {
        devices: [{ id: "cam-back", name: "Back Camera" }],
      },
    });
  });

  it("blocks media invoke commands to avoid base64 context bloat", async () => {
    await expect(
      executeNodes({
        action: "invoke",
        node: NODE_ID,
        invokeCommand: "photos.latest",
        invokeParamsJson: '{"limit":1}',
      }),
    ).rejects.toThrow(/use action="photos_latest"/i);
  });
});
