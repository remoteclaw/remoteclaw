import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { WizardCancelledError } from "../wizard/prompts.js";
import { agentsAddCommand } from "./agents.js";

const runtime = createTestRuntime();

describe("agents add command", () => {
  beforeEach(() => {
    readConfigFileSnapshotMock.mockClear();
    writeConfigFileMock.mockClear();
    wizardMocks.createClackPrompter.mockClear();
    setupChannelsMock.mockClear();
    ensureWorkspaceAndSessionsMock.mockClear();
    runtime.log.mockClear();
    runtime.error.mockClear();
    runtime.exit.mockClear();
  });

  it("requires --workspace when flags are present", async () => {
    readConfigFileSnapshotMock.mockResolvedValue({ ...baseConfigSnapshot });

    await agentsAddCommand({ name: "Work" }, runtime, { hasFlags: true });

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("--workspace"));
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(writeConfigFileMock).not.toHaveBeenCalled();
  });

  it("requires --workspace in non-interactive mode", async () => {
    readConfigFileSnapshotMock.mockResolvedValue({ ...baseConfigSnapshot });

    await agentsAddCommand({ name: "Work", nonInteractive: true }, runtime, {
      hasFlags: false,
    });

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("--workspace"));
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(writeConfigFileMock).not.toHaveBeenCalled();
  });

  it("exits with code 1 when the interactive wizard is cancelled", async () => {
    readConfigFileSnapshotMock.mockResolvedValue({ ...baseConfigSnapshot });
    wizardMocks.createClackPrompter.mockReturnValue({
      intro: vi.fn().mockRejectedValue(new WizardCancelledError()),
      text: vi.fn(),
      confirm: vi.fn(),
      note: vi.fn(),
      outro: vi.fn(),
    });

    await agentsAddCommand({}, runtime);

    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(writeConfigFileMock).not.toHaveBeenCalled();
  });

  it("completes interactive wizard for a new agent without crashing", async () => {
    const cfg = { ...baseConfigSnapshot };
    readConfigFileSnapshotMock.mockResolvedValue(cfg);
    setupChannelsMock.mockImplementation((c: unknown) => Promise.resolve(c));

    const textMock = vi
      .fn()
      .mockResolvedValueOnce("My Agent") // agent name
      .mockResolvedValueOnce("/tmp/workspace"); // workspace directory
    const confirmMock = vi.fn().mockResolvedValue(false);
    const outroMock = vi.fn();

    wizardMocks.createClackPrompter.mockReturnValue({
      intro: vi.fn(),
      text: textMock,
      confirm: confirmMock,
      select: vi.fn(),
      note: vi.fn(),
      outro: outroMock,
    });

    await agentsAddCommand({}, runtime);

    expect(textMock).toHaveBeenCalledTimes(2);
    expect(textMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ message: "Workspace directory" }),
    );
    expect(writeConfigFileMock).toHaveBeenCalled();
    expect(outroMock).toHaveBeenCalledWith(expect.stringContaining("my-agent"));
    expect(runtime.exit).not.toHaveBeenCalled();
  });
});
