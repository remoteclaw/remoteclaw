import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTempHome as withTempHomeBase } from "../../test/helpers/temp-home.js";

vi.mock("../middleware/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/index.js")>();
  return {
    ...actual,
    ChannelBridge: vi.fn(),
    createCliRuntime: vi.fn(),
  };
});
import type { RemoteClawConfig } from "../config/config.js";
import * as configModule from "../config/config.js";
import type { BridgeCallbacks } from "../middleware/index.js";
import { ChannelBridge } from "../middleware/index.js";
import type { RuntimeEnv } from "../runtime.js";
import { agentCommand } from "./agent.js";

const runtime: RuntimeEnv = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(() => {
    throw new Error("exit");
  }),
};

const configSpy = vi.spyOn(configModule, "loadConfig");
const mockHandle = vi.fn();

async function withTempHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  return withTempHomeBase(fn, { prefix: "remoteclaw-agent-stream-" });
}

function mockConfig(
  home: string,
  storePath: string,
  agentOverrides?: Partial<NonNullable<NonNullable<RemoteClawConfig["agents"]>["defaults"]>>,
) {
  configSpy.mockReturnValue({
    agents: {
      defaults: {
        model: { primary: "anthropic/claude-opus-4-5" },
        workspace: path.join(home, "remoteclaw"),
        ...agentOverrides,
      },
    },
    session: { store: storePath, mainKey: "main" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ChannelBridge).mockImplementation(function () {
    return { handle: mockHandle };
  } as never);
  mockHandle.mockResolvedValue({
    text: "ok",
    sessionId: "s",
    durationMs: 5,
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    aborted: false,
    error: undefined,
  });
});

describe("agentCommand streaming callbacks", () => {
  it("passes BridgeCallbacks to bridge.handle", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hello", to: "+1555" }, runtime);

      expect(mockHandle).toHaveBeenCalledOnce();
      const callArgs = mockHandle.mock.calls[0] as unknown[];
      const callbacks = callArgs[1] as BridgeCallbacks;
      expect(callbacks).toBeDefined();
      expect(callbacks.onPartialText).toBeTypeOf("function");
      expect(callbacks.onError).toBeTypeOf("function");
    });
  });

  it("onPartialText writes to stdout", async () => {
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    try {
      await withTempHome(async (home) => {
        const store = path.join(home, "sessions.json");
        mockConfig(home, store);

        await agentCommand({ message: "hello", to: "+1555" }, runtime);

        const callbacks = mockHandle.mock.calls[0][1] as BridgeCallbacks;
        await callbacks.onPartialText!("chunk");
        expect(stdoutSpy).toHaveBeenCalledWith("chunk");
      });
    } finally {
      stdoutSpy.mockRestore();
    }
  });

  it("onError writes to stderr", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await withTempHome(async (home) => {
        const store = path.join(home, "sessions.json");
        mockConfig(home, store);

        await agentCommand({ message: "hello", to: "+1555" }, runtime);

        const callbacks = mockHandle.mock.calls[0][1] as BridgeCallbacks;
        await callbacks.onError!("something broke", "fatal");
        expect(stderrSpy).toHaveBeenCalledWith("[error] something broke\n");
      });
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it("omits onToolUse when verbose is off", async () => {
    await withTempHome(async (home) => {
      const store = path.join(home, "sessions.json");
      mockConfig(home, store);

      await agentCommand({ message: "hello", to: "+1555" }, runtime);

      const callbacks = mockHandle.mock.calls[0][1] as BridgeCallbacks;
      expect(callbacks.onToolUse).toBeUndefined();
    });
  });

  it("provides onToolUse when verbose is on", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    try {
      await withTempHome(async (home) => {
        const store = path.join(home, "sessions.json");
        mockConfig(home, store);

        await agentCommand({ message: "hello", to: "+1555", verbose: "on" }, runtime);

        const callbacks = mockHandle.mock.calls[0][1] as BridgeCallbacks;
        expect(callbacks.onToolUse).toBeTypeOf("function");
        await callbacks.onToolUse!("Read", "t1");
        expect(stderrSpy).toHaveBeenCalledWith("[tool] Read\n");
      });
    } finally {
      stderrSpy.mockRestore();
    }
  });
});
