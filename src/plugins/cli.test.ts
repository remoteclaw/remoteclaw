import { Command } from "commander";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conflictingRegister: vi.fn(),
  otherRegister: vi.fn(),
}));

vi.mock("./loader.js", () => ({
  loadRemoteClawPlugins: () => ({
    cliRegistrars: [
      {
        pluginId: "conflicting-plugin",
        register: mocks.conflictingRegister,
        commands: ["conflict-cmd"],
        source: "bundled",
      },
      {
        pluginId: "other",
        register: mocks.otherRegister,
        commands: ["other"],
        source: "bundled",
      },
    ],
  }),
}));

import { registerPluginCliCommands } from "./cli.js";

describe("registerPluginCliCommands", () => {
  beforeEach(() => {
    mocks.conflictingRegister.mockClear();
    mocks.otherRegister.mockClear();
  });

  it("skips plugin CLI registrars when commands already exist", () => {
    const program = new Command();
    program.command("conflict-cmd");

    registerPluginCliCommands(
      program,
      // oxlint-disable-next-line typescript/no-explicit-any
      { agents: { list: [{ id: "main", workspace: "/tmp/test-workspace" }] } } as any,
    );

    expect(mocks.conflictingRegister).not.toHaveBeenCalled();
    expect(mocks.otherRegister).toHaveBeenCalledTimes(1);
  });
});
