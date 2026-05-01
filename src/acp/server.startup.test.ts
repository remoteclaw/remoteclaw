import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

type GatewayClientCallbacks = {
  onHelloOk?: () => void;
  onConnectError?: (err: Error) => void;
  onClose?: (code: number, reason: string) => void;
};

type GatewayClientAuth = {
  token?: string;
  password?: string;
};
const mockState = {
  gateways: [] as MockGatewayClient[],
  gatewayAuth: [] as GatewayClientAuth[],
  agentSideConnectionCtor: vi.fn(),
  agentStart: vi.fn(),
};

class MockGatewayClient {
  private callbacks: GatewayClientCallbacks;

  constructor(opts: GatewayClientCallbacks & GatewayClientAuth) {
    this.callbacks = opts;
    mockState.gatewayAuth.push({ token: opts.token, password: opts.password });
    mockState.gateways.push(this);
  }

  start(): void {}

  stop(): void {
    this.callbacks.onClose?.(1000, "gateway stopped");
  }

  emitHello(): void {
    this.callbacks.onHelloOk?.();
  }

  emitConnectError(message: string): void {
    this.callbacks.onConnectError?.(new Error(message));
  }
}

vi.mock("@agentclientprotocol/sdk", () => ({
  AgentSideConnection: class {
    constructor(factory: (conn: unknown) => unknown, stream: unknown) {
      mockState.agentSideConnectionCtor(factory, stream);
      factory({});
    }
  },
  ndJsonStream: vi.fn(() => ({ type: "mock-stream" })),
}));

vi.mock("../config/config.js", () => ({
  loadConfig: () => ({
    gateway: {
      mode: "local",
    },
  }),
}));

vi.mock("../gateway/auth.js", () => ({
  resolveGatewayAuth: () => ({}),
}));

vi.mock("../gateway/call.js", () => ({
  buildGatewayConnectionDetails: ({ url }: { url?: string }) => {
    if (typeof url === "string" && url.trim().length > 0) {
      return {
        url: url.trim(),
        urlSource: "cli --url",
      };
    }
    return {
      url: "ws://127.0.0.1:18789",
      urlSource: "local loopback",
    };
  },
}));

vi.mock("../gateway/client.js", () => ({
  GatewayClient: MockGatewayClient,
}));

vi.mock("./translator.js", () => ({
  AcpGatewayAgent: class {
    start(): void {
      mockState.agentStart();
    }

    handleGatewayReconnect(): void {}

    handleGatewayDisconnect(): void {}

    async handleGatewayEvent(): Promise<void> {}
  },
}));

describe("serveAcpGateway startup", () => {
  let serveAcpGateway: typeof import("./server.js").serveAcpGateway;

  function getMockGateway() {
    const gateway = mockState.gateways[0];
    if (!gateway) {
      throw new Error("Expected mocked gateway instance");
    }
    return gateway;
  }

  function captureProcessSignalHandlers() {
    const signalHandlers = new Map<NodeJS.Signals, () => void>();
    const onceSpy = vi.spyOn(process, "once").mockImplementation(((signal: NodeJS.Signals, handler: () => void) => {
      signalHandlers.set(signal, handler);
      return process;
    }) as typeof process.once);
    return { signalHandlers, onceSpy };
  }

  beforeAll(async () => {
    ({ serveAcpGateway } = await import("./server.js"));
  });

  beforeEach(() => {
    mockState.gateways.length = 0;
    mockState.gatewayAuth.length = 0;
    mockState.agentSideConnectionCtor.mockReset();
    mockState.agentStart.mockReset();
  });

  it("waits for gateway hello before creating AgentSideConnection", async () => {
    const { signalHandlers, onceSpy } = captureProcessSignalHandlers();

    try {
      const servePromise = serveAcpGateway({});
      await Promise.resolve();

      expect(mockState.agentSideConnectionCtor).not.toHaveBeenCalled();
      const gateway = getMockGateway();
      gateway.emitHello();
      await vi.waitFor(() => {
        expect(mockState.agentSideConnectionCtor).toHaveBeenCalledTimes(1);
      });

      signalHandlers.get("SIGINT")?.();
      await servePromise;
    } finally {
      onceSpy.mockRestore();
    }
  });

  it("rejects startup when gateway connect fails before hello", async () => {
    const onceSpy = vi
      .spyOn(process, "once")
      .mockImplementation(((_signal: NodeJS.Signals, _handler: () => void) => process) as typeof process.once);

    try {
      const servePromise = serveAcpGateway({});
      await Promise.resolve();

      const gateway = getMockGateway();
      gateway.emitConnectError("connect failed");
      await expect(servePromise).rejects.toThrow("connect failed");
      expect(mockState.agentSideConnectionCtor).not.toHaveBeenCalled();
    } finally {
      onceSpy.mockRestore();
    }
  });

  it("passes explicit gateway credentials from opts to the ACP gateway client", async () => {
    const { signalHandlers, onceSpy } = captureProcessSignalHandlers();

    try {
      const servePromise = serveAcpGateway({
        gatewayPassword: "explicit-password", // pragma: allowlist secret
      });
      await Promise.resolve();

      expect(mockState.gatewayAuth[0]).toEqual({
        token: undefined,
        password: "explicit-password", // pragma: allowlist secret
      });

      const gateway = getMockGateway();
      gateway.emitHello();
      await vi.waitFor(() => {
        expect(mockState.agentSideConnectionCtor).toHaveBeenCalledTimes(1);
      });
      signalHandlers.get("SIGINT")?.();
      await servePromise;
    } finally {
      onceSpy.mockRestore();
    }
  });
});
