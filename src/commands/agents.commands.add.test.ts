// Regression coverage for #2311: the `"main"` agent-name reservation was
// removed from `agentsAddCommand`. These tests exercise the non-interactive
// flag path (CLI form) and pin the post-#2311 behavior so nothing silently
// re-introduces a reservation check.
//
// The existing `agents.add.test.ts` covers the interactive wizard path and
// validator; this file focuses on the non-interactive command-level semantics
// that `"main"` is now a normal agent name.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteClawConfig } from "../config/config.js";
import { baseConfigSnapshot, createTestRuntime } from "./test-runtime-config-helpers.js";

const readConfigFileSnapshotMock = vi.hoisted(() => vi.fn());
const writeConfigFileMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

const wizardMocks = vi.hoisted(() => ({
  createClackPrompter: vi.fn(),
}));

const setupChannelsMock = vi.hoisted(() => vi.fn());
const ensureWorkspaceAndSessionsMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../config/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/config.js")>()),
  readConfigFileSnapshot: readConfigFileSnapshotMock,
  writeConfigFile: writeConfigFileMock,
}));

vi.mock("../wizard/clack-prompter.js", () => ({
  createClackPrompter: wizardMocks.createClackPrompter,
}));

vi.mock("./onboard-channels.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./onboard-channels.js")>()),
  setupChannels: setupChannelsMock,
}));

vi.mock("./onboard-helpers.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./onboard-helpers.js")>()),
  ensureWorkspaceAndSessions: ensureWorkspaceAndSessionsMock,
}));

import { agentsAddCommand } from "./agents.commands.add.js";

const runtime = createTestRuntime();

function lastWrittenConfig(): RemoteClawConfig {
  const calls = writeConfigFileMock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1]?.[0] as RemoteClawConfig;
}

describe("agents add command (non-interactive) — 'main' reservation removal", () => {
  beforeEach(() => {
    readConfigFileSnapshotMock.mockClear();
    writeConfigFileMock.mockClear();
    wizardMocks.createClackPrompter.mockClear();
    setupChannelsMock.mockClear();
    ensureWorkspaceAndSessionsMock.mockClear();
    ensureWorkspaceAndSessionsMock.mockResolvedValue(undefined);
    runtime.log.mockClear();
    runtime.error.mockClear();
    runtime.exit.mockClear();
  });

  it("accepts an agent named 'main' without a 'reserved' error", async () => {
    readConfigFileSnapshotMock.mockResolvedValue({ ...baseConfigSnapshot });

    await agentsAddCommand({ name: "main", workspace: "/tmp/ws-main" }, runtime, {
      hasFlags: true,
    });

    // No error path: the command must not reject "main" as reserved.
    expect(runtime.error).not.toHaveBeenCalled();
    expect(runtime.exit).not.toHaveBeenCalled();
    expect(writeConfigFileMock).toHaveBeenCalledTimes(1);
  });

  it("writes a config entry with id 'main' when --name main is used", async () => {
    readConfigFileSnapshotMock.mockResolvedValue({ ...baseConfigSnapshot });

    await agentsAddCommand({ name: "main", workspace: "/tmp/ws-main" }, runtime, {
      hasFlags: true,
    });

    const written = lastWrittenConfig();
    const list = written.agents?.list ?? [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("main");
    expect(list[0]?.name).toBe("main");
  });

  it("adds 'main' alongside an existing agent without special-casing", async () => {
    // Simulate a pre-existing config with one non-"main" agent. Adding
    // "main" as a second agent must produce a valid multi-agent config
    // with both entries — no reservation or collision logic for "main".
    const preExistingConfig: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "assistant",
            name: "Assistant",
            workspace: "/tmp/ws-assistant",
          },
        ],
      },
    };
    readConfigFileSnapshotMock.mockResolvedValue({
      ...baseConfigSnapshot,
      config: preExistingConfig,
    });

    await agentsAddCommand({ name: "main", workspace: "/tmp/ws-main" }, runtime, {
      hasFlags: true,
    });

    expect(runtime.error).not.toHaveBeenCalled();
    expect(runtime.exit).not.toHaveBeenCalled();
    const written = lastWrittenConfig();
    const list = written.agents?.list ?? [];
    const ids = list.map((entry) => entry?.id);
    expect(ids).toContain("assistant");
    expect(ids).toContain("main");
    expect(list).toHaveLength(2);
  });

  it("rejects adding 'main' when an agent with id 'main' already exists", async () => {
    // This is the normal duplicate-id rejection path — not a reservation.
    // Covered here to show the rejection is about duplication, not about
    // the name "main" itself being special.
    const preExistingConfig: RemoteClawConfig = {
      agents: {
        list: [
          {
            id: "main",
            name: "main",
            workspace: "/tmp/ws-main-original",
          },
        ],
      },
    };
    readConfigFileSnapshotMock.mockResolvedValue({
      ...baseConfigSnapshot,
      config: preExistingConfig,
    });

    await agentsAddCommand({ name: "main", workspace: "/tmp/ws-main-duplicate" }, runtime, {
      hasFlags: true,
    });

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("already exists"));
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(writeConfigFileMock).not.toHaveBeenCalled();
  });

  it("accepts any other valid agent name (regression baseline)", async () => {
    readConfigFileSnapshotMock.mockResolvedValue({ ...baseConfigSnapshot });

    await agentsAddCommand({ name: "ops", workspace: "/tmp/ws-ops" }, runtime, { hasFlags: true });

    expect(runtime.error).not.toHaveBeenCalled();
    expect(runtime.exit).not.toHaveBeenCalled();
    const written = lastWrittenConfig();
    const list = written.agents?.list ?? [];
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("ops");
    expect(list[0]?.name).toBe("ops");
  });
});
