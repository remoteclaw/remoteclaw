import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildProgram } from "./program.js";
import {
  configureCommand,
  ensureConfigReady,
  installBaseProgramMocks,
  installSmokeProgramMocks,
  runTui,
  runtime,
  setupCommand,
  setupWizardCommand,
} from "./program.test-mocks.js";

installBaseProgramMocks();
installSmokeProgramMocks();

vi.mock("./config-cli.js", () => ({
  registerConfigCli: (program: {
    command: (name: string) => { action: (fn: () => unknown) => void };
  }) => {
    program.command("config").action(() => configureCommand({}, runtime));
  },
  runConfigGet: vi.fn(),
  runConfigUnset: vi.fn(),
}));

describe("cli program (smoke)", () => {
  let program = createProgram();

  function createProgram() {
    return buildProgram();
  }

  async function runProgram(argv: string[]) {
    await program.parseAsync(argv, { from: "user" });
  }

  beforeEach(() => {
    program = createProgram();
    vi.clearAllMocks();
    runTui.mockResolvedValue(undefined);
    ensureConfigReady.mockResolvedValue(undefined);
  });

  it("registers message + status commands", () => {
    const names = program.commands.map((command) => command.name());
    expect(names).toContain("message");
    expect(names).toContain("status");
  });

  it("runs tui with explicit timeout override", async () => {
    await runProgram(["tui", "--timeout-ms", "45000"]);
    const options = runTui.mock.calls.at(0)?.[0] as { timeoutMs?: number } | undefined;
    expect(options?.timeoutMs).toBe(45000);
  });

  it("warns and ignores invalid tui timeout override", async () => {
    await runProgram(["tui", "--timeout-ms", "nope"]);
    expect(runtime.error).toHaveBeenCalledWith('warning: invalid --timeout-ms "nope"; ignoring');
    const options = runTui.mock.calls.at(0)?.[0] as { timeoutMs?: number } | undefined;
    expect(options?.timeoutMs).toBeUndefined();
  });

  it("rejects partial tui history limits", async () => {
    await expect(runProgram(["tui", "--history-limit", "10x"])).rejects.toThrow("exit");
    expect(runtime.error).toHaveBeenCalledWith(
      "Error: --history-limit must be a positive integer.",
    );
    expect(runTui).not.toHaveBeenCalled();
  });

  it("runs setup wizard when wizard flags are present", async () => {
    await runProgram(["setup", "--remote-url", "ws://example"]);

    expect(setupCommand).not.toHaveBeenCalled();
    expect(setupWizardCommand).toHaveBeenCalledTimes(1);
  });
});
