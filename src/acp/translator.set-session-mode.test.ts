import type { SetSessionModeRequest } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";
import type { GatewayClient } from "../gateway/client.js";
import { createInMemorySessionStore } from "./session.js";
import { AcpGatewayAgent } from "./translator.js";
import { createAcpConnection, createAcpGateway } from "./translator.test-helpers.js";

function createSetSessionModeRequest(modeId: string): SetSessionModeRequest {
  return {
    sessionId: "session-1",
    modeId,
  } as unknown as SetSessionModeRequest;
}

function createAgentWithSession(request: GatewayClient["request"]) {
  const sessionStore = createInMemorySessionStore();
  sessionStore.createSession({
    sessionId: "session-1",
    sessionKey: "agent:main:main",
    cwd: "/tmp",
  });
  return new AcpGatewayAgent(createAcpConnection(), createAcpGateway(request), {
    sessionStore,
  });
}

// ACP bridge exposes no modes after thought-level removal (#2464 / #2336 Area 3).
// setSessionMode is now a no-op — it never touches the gateway.
describe("acp setSessionMode", () => {
  it("setSessionMode is a no-op and never calls the gateway", async () => {
    const request = vi.fn(async () => ({ ok: true })) as GatewayClient["request"];
    const agent = createAgentWithSession(request);

    await expect(agent.setSessionMode(createSetSessionModeRequest("high"))).resolves.toEqual({});
    expect(request).not.toHaveBeenCalled();
  });

  it("setSessionMode returns empty response for any modeId", async () => {
    const request = vi.fn(async () => ({ ok: true })) as GatewayClient["request"];
    const agent = createAgentWithSession(request);

    await expect(agent.setSessionMode(createSetSessionModeRequest("low"))).resolves.toEqual({});
    expect(request).not.toHaveBeenCalled();
  });

  it("setSessionMode returns early for empty modeId", async () => {
    const request = vi.fn(async () => ({ ok: true })) as GatewayClient["request"];
    const agent = createAgentWithSession(request);

    await expect(agent.setSessionMode(createSetSessionModeRequest(""))).resolves.toEqual({});
    expect(request).not.toHaveBeenCalled();
  });
});
