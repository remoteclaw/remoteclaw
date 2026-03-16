import { beforeEach, describe, expect, it, vi } from "vitest";
import { findRoutedCommand } from "./routes.js";

const runConfigGetMock = vi.hoisted(() => vi.fn(async () => {}));
const runConfigUnsetMock = vi.hoisted(() => vi.fn(async () => {}));
const runDaemonStatusMock = vi.hoisted(() => vi.fn(async () => {}));
const statusJsonCommandMock = vi.hoisted(() => vi.fn(async () => {}));

vi.mock("../config-cli.js", () => ({
  runConfigGet: runConfigGetMock,
  runConfigUnset: runConfigUnsetMock,
}));

vi.mock("../daemon-cli/status.js", () => ({
  runDaemonStatus: runDaemonStatusMock,
}));

vi.mock("../../commands/status-json.js", () => ({
  statusJsonCommand: statusJsonCommandMock,
}));

describe("program routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function expectRoute(path: string[]) {
    const route = findRoutedCommand(path);
    expect(route).not.toBeNull();
    return route;
  }

  async function expectRunFalse(path: string[], argv: string[]) {
    const route = expectRoute(path);
    await expect(route?.run(argv)).resolves.toBe(false);
  }

  it("matches status route and always loads plugins for security parity", () => {
    const route = expectRoute(["status"]);
    expect(route?.loadPlugins).toBe(true);
  });

  it("matches health route and preloads plugins only for text output", () => {
    const route = expectRoute(["health"]);
    expect(typeof route?.loadPlugins).toBe("function");
    const shouldLoad = route?.loadPlugins as (argv: string[]) => boolean;
    expect(shouldLoad(["node", "remoteclaw", "health"])).toBe(true);
    expect(shouldLoad(["node", "remoteclaw", "health", "--json"])).toBe(false);
  });

  it("matches gateway status route without plugin preload", () => {
    const route = expectRoute(["gateway", "status"]);
    expect(route?.loadPlugins).toBeUndefined();
  });

  it("returns false for gateway status route when option values are missing", async () => {
    await expectRunFalse(
      ["gateway", "status"],
      ["node", "remoteclaw", "gateway", "status", "--url"],
    );
    await expectRunFalse(
      ["gateway", "status"],
      ["node", "remoteclaw", "gateway", "status", "--token"],
    );
    await expectRunFalse(
      ["gateway", "status"],
      ["node", "remoteclaw", "gateway", "status", "--password"],
    );
  });

  it("returns false for gateway status route when probe-only flags are present", async () => {
    await expectRunFalse(
      ["gateway", "status"],
      ["node", "remoteclaw", "gateway", "status", "--ssh", "user@host"],
    );
    await expectRunFalse(
      ["gateway", "status"],
      ["node", "remoteclaw", "gateway", "status", "--ssh-identity", "~/.ssh/id_test"],
    );
    await expectRunFalse(
      ["gateway", "status"],
      ["node", "remoteclaw", "gateway", "status", "--ssh-auto"],
    );
  });

  it("passes parsed gateway status flags through to daemon status", async () => {
    const route = expectRoute(["gateway", "status"]);
    await expect(
      route?.run([
        "node",
        "remoteclaw",
        "--profile",
        "work",
        "gateway",
        "status",
        "--url",
        "ws://127.0.0.1:18789",
        "--token",
        "abc",
        "--password",
        "def",
        "--timeout",
        "5000",
        "--deep",
        "--require-rpc",
        "--json",
      ]),
    ).resolves.toBe(true);
    expect(runDaemonStatusMock).toHaveBeenCalledWith({
      rpc: {
        url: "ws://127.0.0.1:18789",
        token: "abc",
        password: "def",
        timeout: "5000",
      },
      probe: true,
      requireRpc: true,
      deep: true,
      json: true,
    });
  });

  it("passes --no-probe through to daemon status", async () => {
    const route = expectRoute(["gateway", "status"]);
    await expect(route?.run(["node", "openclaw", "gateway", "status", "--no-probe"])).resolves.toBe(
      true,
    );

    expect(runDaemonStatusMock).toHaveBeenCalledWith({
      rpc: {
        url: undefined,
        token: undefined,
        password: undefined,
        timeout: undefined,
      },
      probe: false,
      requireRpc: false,
      deep: false,
      json: false,
    });
  });

  it("returns false when status timeout flag value is missing", async () => {
    await expectRunFalse(["status"], ["node", "remoteclaw", "status", "--timeout"]);
  });

  it("routes status --json through the lean JSON command", async () => {
    const route = expectRoute(["status"]);
    await expect(
      route?.run([
        "node",
        "openclaw",
        "status",
        "--json",
        "--deep",
        "--usage",
        "--timeout",
        "5000",
      ]),
    ).resolves.toBe(true);
    expect(statusJsonCommandMock).toHaveBeenCalledWith(
      { deep: true, all: false, usage: true, timeoutMs: 5000 },
      expect.any(Object),
    );
  });

  it("returns false for sessions route when --store value is missing", async () => {
    await expectRunFalse(["sessions"], ["node", "remoteclaw", "sessions", "--store"]);
  });

  it("returns false for sessions route when --active value is missing", async () => {
    await expectRunFalse(["sessions"], ["node", "remoteclaw", "sessions", "--active"]);
  });

  it("returns false for sessions route when --agent value is missing", async () => {
    await expectRunFalse(["sessions"], ["node", "remoteclaw", "sessions", "--agent"]);
  });

  it("does not fast-route sessions subcommands", () => {
    expect(findRoutedCommand(["sessions", "cleanup"])).toBeNull();
  });

  it("does not match unknown routes", () => {
    expect(findRoutedCommand(["definitely-not-real"])).toBeNull();
  });

  it("returns false for config get route when path argument is missing", async () => {
    await expectRunFalse(["config", "get"], ["node", "remoteclaw", "config", "get", "--json"]);
  });

  it("returns false for config unset route when path argument is missing", async () => {
    await expectRunFalse(["config", "unset"], ["node", "remoteclaw", "config", "unset"]);
  });

  it("passes config get path correctly when root option values precede command", async () => {
    const route = expectRoute(["config", "get"]);
    await expect(
      route?.run([
        "node",
        "remoteclaw",
        "--log-level",
        "debug",
        "config",
        "get",
        "update.channel",
        "--json",
      ]),
    ).resolves.toBe(true);
    expect(runConfigGetMock).toHaveBeenCalledWith({ path: "update.channel", json: true });
  });

  it("passes config unset path correctly when root option values precede command", async () => {
    const route = expectRoute(["config", "unset"]);
    await expect(
      route?.run(["node", "remoteclaw", "--profile", "work", "config", "unset", "update.channel"]),
    ).resolves.toBe(true);
    expect(runConfigUnsetMock).toHaveBeenCalledWith({ path: "update.channel" });
  });

  it("passes config get path when root value options appear after subcommand", async () => {
    const route = expectRoute(["config", "get"]);
    await expect(
      route?.run([
        "node",
        "remoteclaw",
        "config",
        "get",
        "--log-level",
        "debug",
        "update.channel",
        "--json",
      ]),
    ).resolves.toBe(true);
    expect(runConfigGetMock).toHaveBeenCalledWith({ path: "update.channel", json: true });
  });

  it("passes config unset path when root value options appear after subcommand", async () => {
    const route = expectRoute(["config", "unset"]);
    await expect(
      route?.run(["node", "remoteclaw", "config", "unset", "--profile", "work", "update.channel"]),
    ).resolves.toBe(true);
    expect(runConfigUnsetMock).toHaveBeenCalledWith({ path: "update.channel" });
  });

  it("returns false for config get route when unknown option appears", async () => {
    await expectRunFalse(
      ["config", "get"],
      ["node", "remoteclaw", "config", "get", "--mystery", "value", "update.channel"],
    );
  });
});
