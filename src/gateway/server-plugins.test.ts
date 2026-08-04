import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PluginRegistry } from "../plugins/registry.js";
import type { PluginRuntime, SubagentGetSessionMessagesParams } from "../plugins/runtime/types.js";
import type { PluginDiagnostic } from "../plugins/types.js";
import type { GatewayRequestContext, GatewayRequestOptions } from "./server-methods/types.js";

const loadRemoteClawPlugins = vi.hoisted(() => vi.fn());
type HandleGatewayRequestOptions = GatewayRequestOptions & {
  extraHandlers?: Record<string, unknown>;
};
const handleGatewayRequest = vi.hoisted(() =>
  vi.fn(async (_opts: HandleGatewayRequestOptions) => {}),
);

vi.mock("../plugins/loader.js", () => ({
  loadRemoteClawPlugins,
}));

vi.mock("./server-methods.js", () => ({
  handleGatewayRequest,
}));

const createRegistry = (diagnostics: PluginDiagnostic[]): PluginRegistry => ({
  plugins: [],
  tools: [],
  hooks: [],
  typedHooks: [],
  channels: [],
  commands: [],
  providers: [],
  gatewayHandlers: {},
  httpRoutes: [],
  cliRegistrars: [],
  services: [],
  diagnostics,
});

type ServerPluginsModule = typeof import("./server-plugins.js");

function createTestContext(label: string): GatewayRequestContext {
  return { label } as unknown as GatewayRequestContext;
}

function getLastDispatchedContext(): GatewayRequestContext | undefined {
  const call = handleGatewayRequest.mock.calls.at(-1)?.[0];
  return call?.context;
}

function getLastDispatchedParams(method: string): Record<string, unknown> {
  const call = handleGatewayRequest.mock.calls.at(-1)?.[0];
  if (call?.req.method !== method) {
    throw new Error(
      `Expected the last gateway dispatch to be ${method}, got ${String(call?.req.method)}`,
    );
  }
  const params = call.req.params;
  if (!params || typeof params !== "object") {
    throw new Error(`Expected the ${method} dispatch to carry params`);
  }
  return params as Record<string, unknown>;
}

async function importServerPluginsModule(): Promise<ServerPluginsModule> {
  return import("./server-plugins.js");
}

function createSubagentRuntime(serverPlugins: ServerPluginsModule): PluginRuntime["subagent"] {
  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  loadRemoteClawPlugins.mockReturnValue(createRegistry([]));
  serverPlugins.loadGatewayPlugins({
    cfg: {},
    workspaceDir: "/tmp",
    log,
    coreGatewayHandlers: {},
    baseMethods: [],
  });
  const call = loadRemoteClawPlugins.mock.calls.at(-1)?.[0] as
    | { runtimeOptions?: { subagent?: PluginRuntime["subagent"] } }
    | undefined;
  if (!call?.runtimeOptions?.subagent) {
    throw new Error("Expected loadGatewayPlugins to provide subagent runtime");
  }
  return call.runtimeOptions.subagent;
}

async function createSubagentRuntimeWithFallbackContext(): Promise<PluginRuntime["subagent"]> {
  const serverPlugins = await importServerPluginsModule();
  const runtime = createSubagentRuntime(serverPlugins);
  serverPlugins.setFallbackGatewayContext(createTestContext("subagent-limit-clamp"));
  return runtime;
}

beforeEach(() => {
  loadRemoteClawPlugins.mockReset();
  handleGatewayRequest.mockReset();
  handleGatewayRequest.mockImplementation(async (opts: HandleGatewayRequestOptions) => {
    switch (opts.req.method) {
      case "agent":
        opts.respond(true, { runId: "run-1" });
        return;
      case "agent.wait":
        opts.respond(true, { status: "ok" });
        return;
      case "sessions.get":
        opts.respond(true, { messages: [] });
        return;
      case "sessions.delete":
        opts.respond(true, {});
        return;
      default:
        opts.respond(true, {});
    }
  });
});

afterEach(() => {
  vi.resetModules();
});

describe("loadGatewayPlugins", () => {
  test("logs plugin errors with details", async () => {
    const { loadGatewayPlugins } = await importServerPluginsModule();
    const diagnostics: PluginDiagnostic[] = [
      {
        level: "error",
        pluginId: "telegram",
        source: "/tmp/telegram/index.ts",
        message: "failed to load plugin: boom",
      },
    ];
    loadRemoteClawPlugins.mockReturnValue(createRegistry(diagnostics));

    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    loadGatewayPlugins({
      cfg: {},
      workspaceDir: "/tmp",
      log,
      coreGatewayHandlers: {},
      baseMethods: [],
    });

    expect(log.error).toHaveBeenCalledWith(
      "[plugins] failed to load plugin: boom (plugin=telegram, source=/tmp/telegram/index.ts)",
    );
    expect(log.warn).not.toHaveBeenCalled();
  });

  test("provides subagent runtime with sessions.get method aliases", async () => {
    const { loadGatewayPlugins } = await importServerPluginsModule();
    loadRemoteClawPlugins.mockReturnValue(createRegistry([]));

    const log = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    loadGatewayPlugins({
      cfg: {},
      workspaceDir: "/tmp",
      log,
      coreGatewayHandlers: {},
      baseMethods: [],
    });

    const call = loadRemoteClawPlugins.mock.calls.at(-1)?.[0];
    const subagent = call?.runtimeOptions?.subagent;
    expect(typeof subagent?.getSessionMessages).toBe("function");
    expect(typeof subagent?.getSession).toBe("function");
  });

  test("shares fallback context across module reloads for existing runtimes", async () => {
    const first = await importServerPluginsModule();
    const runtime = createSubagentRuntime(first);

    const staleContext = createTestContext("stale");
    first.setFallbackGatewayContext(staleContext);
    await runtime.run({ sessionKey: "s-1", message: "hello" });
    expect(getLastDispatchedContext()).toBe(staleContext);

    vi.resetModules();
    const reloaded = await importServerPluginsModule();
    const freshContext = createTestContext("fresh");
    reloaded.setFallbackGatewayContext(freshContext);

    await runtime.run({ sessionKey: "s-1", message: "hello again" });
    expect(getLastDispatchedContext()).toBe(freshContext);
  });

  test("uses updated fallback context after context replacement", async () => {
    const serverPlugins = await importServerPluginsModule();
    const runtime = createSubagentRuntime(serverPlugins);
    const firstContext = createTestContext("before-restart");
    const secondContext = createTestContext("after-restart");

    serverPlugins.setFallbackGatewayContext(firstContext);
    await runtime.run({ sessionKey: "s-2", message: "before restart" });
    expect(getLastDispatchedContext()).toBe(firstContext);

    serverPlugins.setFallbackGatewayContext(secondContext);
    await runtime.run({ sessionKey: "s-2", message: "after restart" });
    expect(getLastDispatchedContext()).toBe(secondContext);
  });

  test("reflects fallback context object mutation at dispatch time", async () => {
    const serverPlugins = await importServerPluginsModule();
    const runtime = createSubagentRuntime(serverPlugins);
    const context = { marker: "before-mutation" } as GatewayRequestContext & {
      marker: string;
    };

    serverPlugins.setFallbackGatewayContext(context);
    context.marker = "after-mutation";

    await runtime.run({ sessionKey: "s-3", message: "mutated context" });
    const dispatched = getLastDispatchedContext() as
      | (GatewayRequestContext & { marker: string })
      | undefined;
    expect(dispatched?.marker).toBe("after-mutation");
  });

  // The clamp is reachable only through loadGatewayPlugins —
  // createGatewaySubagentRuntime is deliberately private — so these cases assert
  // on the params the mocked server-methods dispatch receives for "sessions.get".
  describe("subagent getSessionMessages limit clamp", () => {
    test.each([
      {
        name: "clamps an over-max limit down to the 1000 maximum",
        limit: 5_000,
        expected: 1_000,
      },
      {
        name: "floors a zero limit up to 1",
        limit: 0,
        expected: 1,
      },
      {
        name: "floors a negative limit up to 1",
        limit: -10,
        expected: 1,
      },
      {
        name: "truncates a fractional limit toward zero",
        limit: 10.7,
        expected: 10,
      },
      {
        name: "passes an in-range limit through unchanged",
        limit: 50,
        expected: 50,
      },
    ])("$name", async ({ limit, expected }) => {
      const runtime = await createSubagentRuntimeWithFallbackContext();

      await runtime.getSessionMessages({ sessionKey: "s-limit", limit });

      const params = getLastDispatchedParams("sessions.get");
      expect(params.key).toBe("s-limit");
      expect(params.limit).toBe(expected);
    });

    test.each([
      {
        name: "omits the limit key when limit is explicitly undefined",
        params: { sessionKey: "s-limit", limit: undefined },
      },
      {
        name: "omits the limit key when limit is absent",
        params: { sessionKey: "s-limit" },
      },
      {
        name: "omits the limit key when limit is NaN",
        params: { sessionKey: "s-limit", limit: Number.NaN },
      },
      {
        name: "omits the limit key when limit is Infinity",
        params: { sessionKey: "s-limit", limit: Number.POSITIVE_INFINITY },
      },
    ] satisfies { name: string; params: SubagentGetSessionMessagesParams }[])(
      "$name",
      async ({ params }) => {
        const runtime = await createSubagentRuntimeWithFallbackContext();

        await runtime.getSessionMessages(params);

        const dispatched = getLastDispatchedParams("sessions.get");
        expect(dispatched.key).toBe("s-limit");
        // Key absence, not `undefined`: `toBeUndefined()` would also pass for a
        // forwarded `limit: undefined`, which is what the clamp avoids emitting.
        expect("limit" in dispatched).toBe(false);
      },
    );
  });
});
