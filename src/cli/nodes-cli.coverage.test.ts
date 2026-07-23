// Nodes CLI coverage tests cover node command branches and output formatting.
import { Command } from "commander";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildSystemRunPreparePayload } from "../test-utils/system-run-prepare-payload.js";
import { createCliRuntimeCapture } from "./test-runtime-capture.js";

type ExecApprovalsFile = Record<string, unknown>;

type NodeInvokeCall = {
  method?: string;
  params?: {
    idempotencyKey?: string;
    command?: string;
    params?: unknown;
    timeoutMs?: number;
  };
};

let lastNodeInvokeCall: NodeInvokeCall | null = null;
let _lastApprovalRequestCall: { params?: Record<string, unknown> } | null = null;
let nodeExecApprovalsFile: ExecApprovalsFile = {
  version: 1,
  defaults: {
    security: "allowlist",
    ask: "on-miss",
    askFallback: "deny",
  },
  agents: {},
};

const callGateway = vi.fn(async (opts: NodeInvokeCall) => {
  if (opts.method === "node.list") {
    return {
      nodes: [
        {
          nodeId: "mac-1",
          displayName: "Mac",
          platform: "macos",
          caps: ["canvas"],
          connected: true,
          permissions: { screenRecording: true },
        },
      ],
    };
  }
  if (opts.method === "node.invoke") {
    lastNodeInvokeCall = opts;
    const command = opts.params?.command;
    if (command === "system.run.prepare") {
      const params = (opts.params?.params ?? {}) as {
        command?: unknown[];
        rawCommand?: unknown;
        cwd?: unknown;
        agentId?: unknown;
      };
      return buildSystemRunPreparePayload(params);
    }
    return {
      payload: {
        stdout: "",
        stderr: "",
        exitCode: 0,
        success: true,
        timedOut: false,
      },
    };
  }
  if (opts.method === "exec.approvals.node.get") {
    return {
      path: "/tmp/exec-approvals.json",
      exists: true,
      hash: "hash",
      file: nodeExecApprovalsFile,
    };
  }
  if (opts.method === "exec.approval.request") {
    _lastApprovalRequestCall = opts as { params?: Record<string, unknown> };
    return { decision: "allow-once" };
  }
  return { ok: true };
});

const randomIdempotencyKey = vi.fn(() => "rk_test");

const { defaultRuntime, resetRuntimeCapture, runtimeErrors } = createCliRuntimeCapture();

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGateway(opts as NodeInvokeCall),
  randomIdempotencyKey: () => randomIdempotencyKey(),
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime,
}));

vi.mock("../config/config.js", () => ({
  loadConfig: () => ({ agents: { list: [{ id: "test-agent" }] } }),
}));

describe("nodes-cli coverage", () => {
  let registerNodesCli: (program: Command) => void;
  let sharedProgram: Command;

  const getNodeInvokeCall = () => {
    const last = lastNodeInvokeCall;
    if (!last) {
      throw new Error("expected node.invoke call");
    }
    return last;
  };

  const runNodesCommand = async (args: string[]) => {
    await sharedProgram.parseAsync(args, { from: "user" });
    return getNodeInvokeCall();
  };

  beforeAll(async () => {
    ({ registerNodesCli } = await import("./nodes-cli.js"));
    sharedProgram = new Command();
    sharedProgram.exitOverride();
    registerNodesCli(sharedProgram);
  });

  beforeEach(() => {
    resetRuntimeCapture();
    callGateway.mockClear();
    randomIdempotencyKey.mockClear();
    lastNodeInvokeCall = null;
    _lastApprovalRequestCall = null;
    nodeExecApprovalsFile = {
      version: 1,
      defaults: {
        security: "allowlist",
        ask: "on-miss",
        askFallback: "deny",
      },
      agents: {},
    };
  });

  // FORK-SYNC: `nodes run` was removed upstream in favor of `nodes invoke`;
  // the 3 tests that exercised the legacy command have been dropped.

  it("invokes system.notify with provided fields", async () => {
    const invoke = await runNodesCommand([
      "nodes",
      "notify",
      "--node",
      "mac-1",
      "--title",
      "Ping",
      "--body",
      "Gateway ready",
      "--delivery",
      "overlay",
    ]);

    if (!invoke) {
      throw new Error("expected system.notify invocation");
    }
    expect(invoke.params?.command).toBe("system.notify");
    expect(invoke.params?.params).toEqual({
      title: "Ping",
      body: "Gateway ready",
      sound: undefined,
      priority: undefined,
      delivery: "overlay",
    });
  });

  it("invokes location.get with params", async () => {
    const invoke = await runNodesCommand([
      "nodes",
      "location",
      "get",
      "--node",
      "mac-1",
      "--accuracy",
      "precise",
      "--max-age",
      "1000",
      "--location-timeout",
      "5000",
      "--invoke-timeout",
      "6000",
    ]);

    if (!invoke) {
      throw new Error("expected location.get invocation");
    }
    expect(invoke.params?.command).toBe("location.get");
    expect(invoke.params?.params).toEqual({
      maxAgeMs: 1000,
      desiredAccuracy: "precise",
      timeoutMs: 5000,
    });
    expect(invoke.params?.timeoutMs).toBe(6000);
  });

  it.each([
    {
      args: ["nodes", "location", "get", "--node", "mac-1", "--max-age", "1000ms"],
      flag: "--max-age",
    },
    {
      args: ["nodes", "location", "get", "--node", "mac-1", "--location-timeout", "5s"],
      flag: "--location-timeout",
    },
    {
      args: ["nodes", "location", "get", "--node", "mac-1", "--invoke-timeout", "6s"],
      flag: "--invoke-timeout",
    },
    {
      args: ["nodes", "camera", "snap", "--node", "mac-1", "--max-width", "1024px"],
      flag: "--max-width",
    },
    {
      args: ["nodes", "camera", "snap", "--node", "mac-1", "--delay-ms", "20ms"],
      flag: "--delay-ms",
    },
    {
      args: ["nodes", "camera", "snap", "--node", "mac-1", "--invoke-timeout", "20s"],
      flag: "--invoke-timeout",
    },
    {
      args: ["nodes", "camera", "snap", "--node", "mac-1", "--quality", "0.8jpg"],
      flag: "--quality",
    },
    {
      args: ["nodes", "camera", "snap", "--node", "mac-1", "--quality", "1.1"],
      flag: "--quality",
    },
    {
      args: ["nodes", "camera", "clip", "--node", "mac-1", "--invoke-timeout", "90s"],
      flag: "--invoke-timeout",
    },
    {
      args: ["nodes", "screen", "record", "--node", "mac-1", "--screen", "1x"],
      flag: "--screen",
    },
    {
      args: ["nodes", "screen", "record", "--node", "mac-1", "--invoke-timeout", "120s"],
      flag: "--invoke-timeout",
    },
    {
      args: ["nodes", "screen", "record", "--node", "mac-1", "--fps", "10fps"],
      flag: "--fps",
    },
    {
      args: ["nodes", "screen", "record", "--node", "mac-1", "--fps", "0"],
      flag: "--fps",
    },
    {
      args: ["nodes", "notify", "--node", "mac-1", "--title", "Ping", "--invoke-timeout", "15s"],
      flag: "--invoke-timeout",
    },
    {
      args: [
        "nodes",
        "invoke",
        "--node",
        "mac-1",
        "--command",
        "canvas.eval",
        "--invoke-timeout",
        "15s",
      ],
      flag: "--invoke-timeout",
    },
  ])("rejects partial numeric option for $args", async ({ args, flag }) => {
    await expect(sharedProgram.parseAsync(args, { from: "user" })).rejects.toThrow("__exit__:1");
    expect(runtimeErrors.at(-1)).toContain(`${flag} must be`);
    expect(lastNodeInvokeCall).toBeNull();
  });
});
