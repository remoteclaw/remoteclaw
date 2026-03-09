import os from "node:os";
import path from "node:path";
import type { PromptRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GatewayClient } from "../gateway/client.js";
import { createInMemorySessionStore } from "./session.js";
import { AcpGatewayAgent } from "./translator.js";
import { createAcpConnection, createAcpGateway } from "./translator.test-helpers.js";

describe("acp prompt cwd prefix", () => {
  async function runPromptWithCwd(cwd: string) {
    const pinnedHome = os.homedir();
    const previousRemoteClawHome = process.env.REMOTECLAW_HOME;
    const previousHome = process.env.HOME;
    delete process.env.REMOTECLAW_HOME;
    process.env.HOME = pinnedHome;

    const sessionStore = createInMemorySessionStore();
    sessionStore.createSession({
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      cwd,
    });

    const requestSpy = vi.fn(async (method: string) => {
      if (method === "chat.send") {
        throw new Error("stop-after-send");
      }
      return {};
    });
    const agent = new AcpGatewayAgent(
      createAcpConnection(),
      createAcpGateway(requestSpy as unknown as GatewayClient["request"]),
      {
        sessionStore,
        prefixCwd: true,
      },
    );

    try {
      await expect(
        agent.prompt({
          sessionId: "session-1",
          prompt: [{ type: "text", text: "hello" }],
          _meta: {},
        } as unknown as PromptRequest),
      ).rejects.toThrow("stop-after-send");
      return requestSpy;
    } finally {
      if (previousRemoteClawHome === undefined) {
        delete process.env.REMOTECLAW_HOME;
      } else {
        process.env.REMOTECLAW_HOME = previousRemoteClawHome;
      }
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
    }
  }

  it("redacts home directory in prompt prefix", async () => {
    const requestSpy = await runPromptWithCwd(path.join(os.homedir(), "remoteclaw-test"));
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        message: expect.stringMatching(/\[Working directory: ~[\\/]remoteclaw-test\]/),
      }),
      { expectFinal: true },
    );
  });

  it("keeps backslash separators when cwd uses them", async () => {
    const requestSpy = await runPromptWithCwd(`${os.homedir()}\\remoteclaw-test`);
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        message: expect.stringContaining("[Working directory: ~\\remoteclaw-test]"),
      }),
      { expectFinal: true },
    );
  });

  it("injects system provenance metadata when enabled", async () => {
    const sessionStore = createInMemorySessionStore();
    sessionStore.createSession({
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      cwd: path.join(os.homedir(), "remoteclaw-test"),
    });

    const requestSpy = vi.fn(async (method: string) => {
      if (method === "chat.send") {
        throw new Error("stop-after-send");
      }
      return {};
    });
    const agent = new AcpGatewayAgent(
      createAcpConnection(),
      createAcpGateway(requestSpy as unknown as GatewayClient["request"]),
      {
        sessionStore,
        provenanceMode: "meta",
      },
    );

    await expect(
      agent.prompt({
        sessionId: "session-1",
        prompt: [{ type: "text", text: "hello" }],
        _meta: {},
      } as unknown as PromptRequest),
    ).rejects.toThrow("stop-after-send");

    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemInputProvenance: {
          kind: "external_user",
          originSessionId: "session-1",
          sourceChannel: "acp",
          sourceTool: "remoteclaw_acp",
        },
        systemProvenanceReceipt: undefined,
      }),
      { expectFinal: true },
    );
  });

  it("injects a system provenance receipt when requested", async () => {
    const sessionStore = createInMemorySessionStore();
    sessionStore.createSession({
      sessionId: "session-1",
      sessionKey: "agent:main:main",
      cwd: path.join(os.homedir(), "remoteclaw-test"),
    });

    const requestSpy = vi.fn(async (method: string) => {
      if (method === "chat.send") {
        throw new Error("stop-after-send");
      }
      return {};
    });
    const agent = new AcpGatewayAgent(
      createAcpConnection(),
      createAcpGateway(requestSpy as unknown as GatewayClient["request"]),
      {
        sessionStore,
        provenanceMode: "meta+receipt",
      },
    );

    await expect(
      agent.prompt({
        sessionId: "session-1",
        prompt: [{ type: "text", text: "hello" }],
        _meta: {},
      } as unknown as PromptRequest),
    ).rejects.toThrow("stop-after-send");

    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemInputProvenance: {
          kind: "external_user",
          originSessionId: "session-1",
          sourceChannel: "acp",
          sourceTool: "remoteclaw_acp",
        },
        systemProvenanceReceipt: expect.stringContaining("[Source Receipt]"),
      }),
      { expectFinal: true },
    );
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemProvenanceReceipt: expect.stringContaining("bridge=remoteclaw-acp"),
      }),
      { expectFinal: true },
    );
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemProvenanceReceipt: expect.stringContaining("originSessionId=session-1"),
      }),
      { expectFinal: true },
    );
    expect(requestSpy).toHaveBeenCalledWith(
      "chat.send",
      expect.objectContaining({
        systemProvenanceReceipt: expect.stringContaining("targetSession=agent:main:main"),
      }),
      { expectFinal: true },
    );
  });
});
