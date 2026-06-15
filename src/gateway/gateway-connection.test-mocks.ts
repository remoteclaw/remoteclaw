import { vi, type Mock } from "vitest";

type TestMock<TArgs extends unknown[] = unknown[], TResult = unknown> = Mock<
  (...args: TArgs) => TResult
>;

export const loadConfigMock: TestMock = vi.fn();
export const resolveGatewayPortMock: TestMock = vi.fn();
export const resolveStateDirMock: TestMock<[NodeJS.ProcessEnv], string> = vi.fn(
  (env: NodeJS.ProcessEnv) => env.REMOTECLAW_STATE_DIR ?? "/tmp/remoteclaw",
);
export const resolveConfigPathMock: TestMock<[NodeJS.ProcessEnv, string], string> = vi.fn(
  (env: NodeJS.ProcessEnv, stateDir: string) =>
    env.REMOTECLAW_CONFIG_PATH ?? `${stateDir}/remoteclaw.json`,
);
export const pickPrimaryTailnetIPv4Mock: TestMock = vi.fn();
export const pickPrimaryLanIPv4Mock: TestMock = vi.fn();
export const isLoopbackHostMock: TestMock<[string], boolean> = vi.fn((host: string) =>
  /^(localhost|127(?:\.\d{1,3}){3}|::1|\[::1\]|::ffff:127(?:\.\d{1,3}){3})$/i.test(
    host.trim().replace(/\.+$/, ""),
  ),
);
export const isSecureWebSocketUrlMock: TestMock<
  [string, { allowPrivateWs?: boolean } | undefined],
  boolean
> = vi.fn((url: string, opts?: { allowPrivateWs?: boolean }) => {
  const parsed = new URL(url);
  if (parsed.protocol === "wss:") {
    return true;
  }
  if (parsed.protocol !== "ws:") {
    return false;
  }
  return opts?.allowPrivateWs === true || isLoopbackHostMock(parsed.hostname);
});

vi.mock("../config/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/config.js")>()),
  loadConfig: loadConfigMock,
  resolveGatewayPort: resolveGatewayPortMock,
  resolveStateDir: resolveStateDirMock,
  resolveConfigPath: resolveConfigPathMock,
}));

vi.mock("../infra/tailnet.js", () => ({
  pickPrimaryTailnetIPv4: pickPrimaryTailnetIPv4Mock,
}));

vi.mock("./net.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./net.js")>();
  return {
    ...actual,
    pickPrimaryLanIPv4: pickPrimaryLanIPv4Mock,
    isLoopbackHost: isLoopbackHostMock,
    isSecureWebSocketUrl: isSecureWebSocketUrlMock,
  };
});
