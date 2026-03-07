import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTempWorkspace } from "../test-helpers/workspace.js";
import { baseConfigSnapshot, createTestRuntime } from "./test-runtime-config-helpers.js";

const configMocks = vi.hoisted(() => ({
  readConfigFileSnapshot: vi.fn(),
  writeConfigFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../config/config.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../config/config.js")>()),
  readConfigFileSnapshot: configMocks.readConfigFileSnapshot,
  writeConfigFile: configMocks.writeConfigFile,
}));

import { agentsSetIdentityCommand } from "./agents.js";

const runtime = createTestRuntime();
type ConfigWritePayload = {
  agents?: { list?: Array<{ id: string; identity?: Record<string, string> }> };
};

async function createIdentityWorkspace(subdir = "work") {
  const root = await makeTempWorkspace("remoteclaw-identity-");
  const workspace = path.join(root, subdir);
  return { root, workspace };
}

function getWrittenMainIdentity() {
  const written = configMocks.writeConfigFile.mock.calls[0]?.[0] as ConfigWritePayload;
  return written.agents?.list?.find((entry) => entry.id === "main")?.identity;
}

describe("agents set-identity command", () => {
  beforeEach(() => {
    configMocks.readConfigFileSnapshot.mockClear();
    configMocks.writeConfigFile.mockClear();
    runtime.log.mockClear();
    runtime.error.mockClear();
    runtime.exit.mockClear();
  });

  it("sets identity via explicit flags", async () => {
    configMocks.readConfigFileSnapshot.mockResolvedValue({
      ...baseConfigSnapshot,
      config: { agents: { list: [{ id: "main" }] } },
    });

    await agentsSetIdentityCommand(
      {
        agent: "main",
        name: "RemoteClaw",
        emoji: "🦀",
        theme: "space crab",
        avatar: "avatars/remoteclaw.png",
      },
      runtime,
    );

    expect(configMocks.writeConfigFile).toHaveBeenCalledTimes(1);
    expect(getWrittenMainIdentity()).toEqual({
      name: "RemoteClaw",
      theme: "space crab",
      emoji: "🦀",
      avatar: "avatars/remoteclaw.png",
    });
  });

  it("errors when multiple agents match the same workspace", async () => {
    const { workspace } = await createIdentityWorkspace("shared");

    configMocks.readConfigFileSnapshot.mockResolvedValue({
      ...baseConfigSnapshot,
      config: {
        agents: {
          list: [
            { id: "main", workspace },
            { id: "ops", workspace },
          ],
        },
      },
    });

    await agentsSetIdentityCommand({ workspace, name: "Echo" }, runtime);

    expect(runtime.error).toHaveBeenCalledWith(expect.stringContaining("Multiple agents match"));
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(configMocks.writeConfigFile).not.toHaveBeenCalled();
  });

  it("accepts avatar-only updates via flags", async () => {
    configMocks.readConfigFileSnapshot.mockResolvedValue({
      ...baseConfigSnapshot,
      config: { agents: { list: [{ id: "main" }] } },
    });

    await agentsSetIdentityCommand(
      { agent: "main", avatar: "https://example.com/avatar.png" },
      runtime,
    );

    expect(getWrittenMainIdentity()).toEqual({
      avatar: "https://example.com/avatar.png",
    });
  });

  it("errors when no identity fields provided", async () => {
    configMocks.readConfigFileSnapshot.mockResolvedValue({
      ...baseConfigSnapshot,
      config: { agents: { list: [{ id: "main" }] } },
    });

    await agentsSetIdentityCommand({ agent: "main" }, runtime);

    expect(runtime.error).toHaveBeenCalledWith(
      expect.stringContaining("No identity fields provided"),
    );
    expect(runtime.exit).toHaveBeenCalledWith(1);
    expect(configMocks.writeConfigFile).not.toHaveBeenCalled();
  });
});
