import { describe, expect, test } from "vitest";
import {
  getFreePort,
  installGatewayTestHooks,
  startGatewayServer,
  testState,
} from "./test-helpers.js";

installGatewayTestHooks({ scope: "test" });

async function expectStartupFailure(port: number): Promise<{
  thrown: unknown;
  server: Awaited<ReturnType<typeof startGatewayServer>> | undefined;
}> {
  let server: Awaited<ReturnType<typeof startGatewayServer>> | undefined;
  let thrown: unknown;
  try {
    server = await startGatewayServer(port);
  } catch (err) {
    thrown = err;
  }
  if (server) {
    await server.close();
  }
  return { thrown, server };
}

describe("gateway startup agent validation — regression for #2308", () => {
  test("starts with a single agent whose id is not 'main'", async () => {
    testState.agentsConfig = {
      list: [{ id: "assistant", workspace: "/tmp/assistant" }],
    };
    const port = await getFreePort();
    const server = await startGatewayServer(port);
    try {
      expect(server).toBeDefined();
      expect(typeof server.close).toBe("function");
    } finally {
      await server.close();
    }
  });

  test("starts with multiple agents — neither named 'main' — when defaults.workspace is absent", async () => {
    // Clear the harness-injected defaults.workspace so the runtime falls
    // through to the first agents.list entry. This is the exact scenario
    // the phantom-agent fallback was hitting: multi-agent config without
    // an agent called "main" and without a default workspace.
    testState.agentConfig = { workspace: undefined };
    testState.agentsConfig = {
      list: [
        { id: "alpha", workspace: "/tmp/alpha" },
        { id: "ops", workspace: "/tmp/ops" },
      ],
    };
    const port = await getFreePort();
    const server = await startGatewayServer(port);
    try {
      expect(server).toBeDefined();
      expect(typeof server.close).toBe("function");
    } finally {
      await server.close();
    }
  });

  test("throws 'No agents configured' when agents.list is empty", async () => {
    testState.agentConfig = { workspace: undefined };
    testState.agentsConfig = { list: [] };
    const { thrown } = await expectStartupFailure(await getFreePort());
    expect(thrown).toBeInstanceOf(Error);
    const message = String((thrown as Error).message);
    expect(message).toContain("No agents configured");
    expect(message).toContain("agents.list");
  });

  // NOTE: the "agents.list is absent" scenario is unreachable in the gateway
  // test harness — when `testState.agentsConfig` is undefined, the harness
  // (test-helpers.mocks.ts, #2672) injects a default `main` agent so
  // session-key resolution works, so startup legitimately succeeds. The
  // "agents.list is empty" case above (explicit `{ list: [] }`, which the
  // harness does NOT override) provides the real coverage of the
  // `resolveFirstAgentWorkspace` startup guard.

  test("throws 'No agents configured' when the sole agent has a whitespace-only workspace", async () => {
    // resolveFirstAgentWorkspace trims before evaluating; a non-empty-string
    // workspace that becomes empty after trim must still trigger the startup
    // guard (schema validation is stubbed in the gateway test harness, so this
    // pins the runtime defense at src/gateway/server.impl.ts:318).
    testState.agentConfig = { workspace: undefined };
    testState.agentsConfig = {
      list: [{ id: "assistant", workspace: "   " }],
    };
    const { thrown } = await expectStartupFailure(await getFreePort());
    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toContain("No agents configured");
  });

  test("'No agents configured' error message points operators to remoteclaw.json", async () => {
    testState.agentConfig = { workspace: undefined };
    testState.agentsConfig = { list: [] };
    const { thrown } = await expectStartupFailure(await getFreePort());
    expect(thrown).toBeInstanceOf(Error);
    const message = String((thrown as Error).message);
    expect(message).toContain("agents.list");
    expect(message).toContain("remoteclaw.json");
  });
});
