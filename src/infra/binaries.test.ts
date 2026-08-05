// Tests bundled binary discovery and version command helpers.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { runExec } from "../process/exec.js";
import type { RuntimeEnv } from "../runtime.js";
import { ensureBinary } from "./binaries.js";

// The lookup command is platform-resolved, so both branches are forced here rather
// than left to whichever host runs the suite — a hardcoded `which` reported every
// binary as missing on Windows.
const realPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

function stubPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
}

afterEach(() => {
  if (realPlatformDescriptor) {
    Object.defineProperty(process, "platform", realPlatformDescriptor);
  }
});

function stubExec(): typeof runExec {
  return vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
}

describe("ensureBinary", () => {
  it("passes through when the binary exists", async () => {
    stubPlatform("linux");
    const exec = stubExec();
    const runtime: RuntimeEnv = {
      log: vi.fn(),
      error: vi.fn(),
      exit: vi.fn(),
    };

    await ensureBinary("node", exec, runtime);

    expect(exec).toHaveBeenCalledWith("which", ["node"]);
    expect(runtime.error).not.toHaveBeenCalled();
    expect(runtime.exit).not.toHaveBeenCalled();
  });

  it("looks the binary up with a pinned where.exe on Windows", async () => {
    stubPlatform("win32");
    vi.stubEnv("SystemRoot", "D:\\WinNT");
    const exec = stubExec();
    const runtime: RuntimeEnv = { log: vi.fn(), error: vi.fn(), exit: vi.fn() };

    await ensureBinary("node", exec, runtime);

    // Literal, not re-derived from the resolver: re-deriving would assert nothing.
    expect(exec).toHaveBeenCalledWith("D:\\WinNT\\System32\\where.exe", ["node"]);
    expect(runtime.error).not.toHaveBeenCalled();
  });

  it("logs and exits when the binary is missing", async () => {
    const exec: typeof runExec = vi.fn().mockRejectedValue(new Error("missing"));
    const error = vi.fn();
    const exit = vi.fn(() => {
      throw new Error("exit");
    });

    await expect(ensureBinary("ghost", exec, { log: vi.fn(), error, exit })).rejects.toThrow(
      "exit",
    );
    expect(error).toHaveBeenCalledWith("Missing required binary: ghost. Please install it.");
    expect(exit).toHaveBeenCalledWith(1);
  });
});
