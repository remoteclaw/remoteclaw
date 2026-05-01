import { afterEach, beforeEach, vi } from "vitest";
import type { MockFn } from "../test-utils/vitest-mock-fn.js";
import { installChromeUserDataDirHooks } from "./chrome-user-data-dir.test-harness.js";
import { getFreePort } from "./test-port.js";

export { getFreePort } from "./test-port.js";

type HarnessState = {
  testPort: number;
  cdpBaseUrl: string;
  reachable: boolean;
  cfgAttachOnly: boolean;
  cfgEvaluateEnabled: boolean;
  createTargetId: string | null;
  prevGatewayPort: string | undefined;
  prevGatewayToken: string | undefined;
  prevGatewayPassword: string | undefined;
};

const state: HarnessState = {
  testPort: 0,
  cdpBaseUrl: "",
  reachable: false,
  cfgAttachOnly: false,
  cfgEvaluateEnabled: true,
  createTargetId: null,
  prevGatewayPort: undefined,
  prevGatewayToken: undefined,
  prevGatewayPassword: undefined,
};

export function getBrowserControlServerTestState(): HarnessState {
  return state;
}

export function getBrowserControlServerBaseUrl(): string {
  return `http://127.0.0.1:${state.testPort}`;
}

export function restoreGatewayPortEnv(prevGatewayPort: string | undefined): void {
  if (prevGatewayPort === undefined) {
    delete process.env.REMOTECLAW_GATEWAY_PORT;
    return;
  }
  process.env.REMOTECLAW_GATEWAY_PORT = prevGatewayPort;
}

export function setBrowserControlServerCreateTargetId(targetId: string | null): void {
  state.createTargetId = targetId;
}

export function setBrowserControlServerAttachOnly(attachOnly: boolean): void {
  state.cfgAttachOnly = attachOnly;
}

export function setBrowserControlServerEvaluateEnabled(enabled: boolean): void {
  state.cfgEvaluateEnabled = enabled;
}

export function setBrowserControlServerReachable(reachable: boolean): void {
  state.reachable = reachable;
}

const cdpMocks = vi.hoisted(() => ({
  createTargetViaCdp: vi.fn<() => Promise<{ targetId: string }>>(async () => {
    throw new Error("cdp disabled");
  }),
}));

export function getCdpMocks(): { createTargetViaCdp: MockFn } {
  return cdpMocks as unknown as { createTargetViaCdp: MockFn };
}

const chromeUserDataDir = vi.hoisted(() => ({ dir: "/tmp/remoteclaw" }));
installChromeUserDataDirHooks(chromeUserDataDir);

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => ({
      browser: {
        enabled: true,
        evaluateEnabled: state.cfgEvaluateEnabled,
        color: "#FF4500",
        attachOnly: state.cfgAttachOnly,
        headless: true,
        defaultProfile: "remoteclaw",
        profiles: {
          remoteclaw: { cdpPort: state.testPort + 1, color: "#FF4500" },
        },
      },
    }),
    writeConfigFile: vi.fn(async () => {}),
  };
});

vi.mock("./cdp-reachability.js", () => ({
  isCdpHttpReachable: vi.fn(async () => state.reachable),
  isCdpReady: vi.fn(async () => state.reachable),
  getCdpWebSocketUrl: vi.fn(async () => null),
}));

vi.mock("./profile-paths.js", () => ({
  resolveRemoteClawUserDataDir: vi.fn(() => chromeUserDataDir.dir),
}));

vi.mock("../infra/trash.js", () => ({
  movePathToTrash: vi.fn(async (targetPath: string) => targetPath),
}));

vi.mock("./cdp.js", () => ({
  createTargetViaCdp: cdpMocks.createTargetViaCdp,
  normalizeCdpWsUrl: vi.fn((wsUrl: string) => wsUrl),
  getHeadersWithAuth: vi.fn(() => ({})),
  appendCdpPath: vi.fn((cdpUrl: string, cdpPath: string) => {
    const base = cdpUrl.replace(/\/$/, "");
    const suffix = cdpPath.startsWith("/") ? cdpPath : `/${cdpPath}`;
    return `${base}${suffix}`;
  }),
}));

const server = await import("./server.js");
export const startBrowserControlServerFromConfig = server.startBrowserControlServerFromConfig;
export const stopBrowserControlServer = server.stopBrowserControlServer;

export function makeResponse(
  body: unknown,
  init?: { ok?: boolean; status?: number; text?: string },
): Response {
  const ok = init?.ok ?? true;
  const status = init?.status ?? 200;
  const text = init?.text ?? "";
  return {
    ok,
    status,
    json: async () => body,
    text: async () => text,
  } as unknown as Response;
}

function mockClearAll(obj: Record<string, { mockClear: () => unknown }>) {
  for (const fn of Object.values(obj)) {
    fn.mockClear();
  }
}

export async function resetBrowserControlServerTestContext(): Promise<void> {
  state.reachable = false;
  state.cfgAttachOnly = false;
  state.createTargetId = null;

  mockClearAll(cdpMocks);

  state.testPort = await getFreePort();
  state.cdpBaseUrl = `http://127.0.0.1:${state.testPort + 1}`;
  state.prevGatewayPort = process.env.REMOTECLAW_GATEWAY_PORT;
  process.env.REMOTECLAW_GATEWAY_PORT = String(state.testPort - 2);
  // Avoid flaky auth coupling: some suites temporarily set gateway env auth
  // which would make the browser control server require auth.
  state.prevGatewayToken = process.env.REMOTECLAW_GATEWAY_TOKEN;
  state.prevGatewayPassword = process.env.REMOTECLAW_GATEWAY_PASSWORD;
  delete process.env.REMOTECLAW_GATEWAY_TOKEN;
  delete process.env.REMOTECLAW_GATEWAY_PASSWORD;
}

export function restoreGatewayAuthEnv(
  prevGatewayToken: string | undefined,
  prevGatewayPassword: string | undefined,
): void {
  if (prevGatewayToken === undefined) {
    delete process.env.REMOTECLAW_GATEWAY_TOKEN;
  } else {
    process.env.REMOTECLAW_GATEWAY_TOKEN = prevGatewayToken;
  }
  if (prevGatewayPassword === undefined) {
    delete process.env.REMOTECLAW_GATEWAY_PASSWORD;
  } else {
    process.env.REMOTECLAW_GATEWAY_PASSWORD = prevGatewayPassword;
  }
}

export async function cleanupBrowserControlServerTestContext(): Promise<void> {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  restoreGatewayPortEnv(state.prevGatewayPort);
  restoreGatewayAuthEnv(state.prevGatewayToken, state.prevGatewayPassword);
  await stopBrowserControlServer();
}

export function installBrowserControlServerHooks() {
  beforeEach(async () => {
    cdpMocks.createTargetViaCdp.mockImplementation(async () => {
      if (state.createTargetId) {
        return { targetId: state.createTargetId };
      }
      throw new Error("cdp disabled");
    });

    await resetBrowserControlServerTestContext();

    // Minimal CDP JSON endpoints used by the server.
    let putNewCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/json/list")) {
          if (!state.reachable) {
            return makeResponse([]);
          }
          return makeResponse([
            {
              id: "abcd1234",
              title: "Tab",
              url: "https://example.com",
              webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/abcd1234",
              type: "page",
            },
            {
              id: "abce9999",
              title: "Other",
              url: "https://other",
              webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/abce9999",
              type: "page",
            },
          ]);
        }
        if (u.includes("/json/new?")) {
          if (init?.method === "PUT") {
            putNewCalls += 1;
            if (putNewCalls === 1) {
              return makeResponse({}, { ok: false, status: 405, text: "" });
            }
          }
          return makeResponse({
            id: "newtab1",
            title: "",
            url: "about:blank",
            webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/newtab1",
            type: "page",
          });
        }
        if (u.includes("/json/activate/")) {
          return makeResponse("ok");
        }
        if (u.includes("/json/close/")) {
          return makeResponse("ok");
        }
        return makeResponse({}, { ok: false, status: 500, text: "unexpected" });
      }),
    );
  });

  afterEach(async () => {
    await cleanupBrowserControlServerTestContext();
  });
}
