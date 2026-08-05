// Covers Windows scheduled-task gateway restart script generation.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { captureFullEnv } from "../test-utils/env.js";
import { resolveWindowsCmdExePath } from "./windows-system-paths.js";

const spawnMock = vi.hoisted(() => vi.fn());
const resolvePreferredRemoteClawTmpDirMock = vi.hoisted(() => vi.fn(() => os.tmpdir()));
const resolveTaskScriptPathMock = vi.hoisted(() =>
  vi.fn((env: Record<string, string | undefined>) => {
    const home = env.USERPROFILE || env.HOME || os.homedir();
    return path.join(home, ".remoteclaw", "gateway.cmd");
  }),
);

vi.mock("node:child_process", async () => {
  const { mockNodeBuiltinModule } = await import("../../test/helpers/node-builtin-mocks.js");
  return mockNodeBuiltinModule(
    () => vi.importActual<typeof import("node:child_process")>("node:child_process"),
    {
      spawn: (...args: unknown[]) => spawnMock(...args),
    },
  );
});
vi.mock("./tmp-remoteclaw-dir.js", () => ({
  resolvePreferredRemoteClawTmpDir: () => resolvePreferredRemoteClawTmpDirMock(),
}));
vi.mock("../daemon/schtasks.js", () => ({
  resolveTaskScriptPath: (env: Record<string, string | undefined>) =>
    resolveTaskScriptPathMock(env),
}));

// A non-default install root, so the literal `schtasks.exe` paths asserted below cannot be
// satisfied by the `C:\Windows` fallback — the emission has to actually read this env. Same
// rationale as `TEST_ENV` in `windows-system-paths.call-sites.test.ts`.
const TEST_SYSTEM_ROOT = "D:\\WinNT";
const PINNED_SCHTASKS = "D:\\WinNT\\System32\\schtasks.exe";

/**
 * Every `schtasks` line in the emitted script, so the pinning can be asserted as "these
 * exact lines" rather than "the pinned path appears somewhere". A `toContain` on the pinned
 * path alone stays green if an unpinned invocation is added next to it.
 */
function schtasksLines(script: string): string[] {
  return script.split(/\r?\n/u).filter((line) => /schtasks/iu.test(line));
}

type WindowsTaskRestartModule = typeof import("./windows-task-restart.js");

let relaunchGatewayScheduledTask: WindowsTaskRestartModule["relaunchGatewayScheduledTask"];

const envSnapshot = captureFullEnv();
const createdScriptPaths = new Set<string>();
const createdTmpDirs = new Set<string>();

function decodeCmdPathArg(value: string): string {
  const trimmed = value.trim();
  const withoutQuotes =
    trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
  return withoutQuotes.replace(/\^!/g, "!").replace(/%%/g, "%");
}

function requireFirstMockCall<T>(mock: { mock: { calls: T[][] } }, label: string): T[] {
  const call = mock.mock.calls[0];
  if (!call) {
    throw new Error(`expected ${label} call`);
  }
  return call;
}

afterEach(() => {
  envSnapshot.restore();
  for (const scriptPath of createdScriptPaths) {
    try {
      fs.unlinkSync(scriptPath);
    } catch {
      // Best-effort cleanup for temp helper scripts created in tests.
    }
  }
  createdScriptPaths.clear();
  for (const tmpDir of createdTmpDirs) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for test temp roots.
    }
  }
  createdTmpDirs.clear();
});

describe("relaunchGatewayScheduledTask", () => {
  beforeAll(async () => {
    ({ relaunchGatewayScheduledTask } = await import("./windows-task-restart.js"));
  });

  beforeEach(() => {
    spawnMock.mockReset();
    resolvePreferredRemoteClawTmpDirMock.mockReset();
    resolvePreferredRemoteClawTmpDirMock.mockReturnValue(os.tmpdir());
    resolveTaskScriptPathMock.mockReset();
    resolveTaskScriptPathMock.mockImplementation((env: Record<string, string | undefined>) => {
      const home = env.USERPROFILE || env.HOME || os.homedir();
      return path.join(home, ".remoteclaw", "gateway.cmd");
    });
  });

  it("writes a detached schtasks relaunch helper", () => {
    const unref = vi.fn();
    let seenCommandArg = "";
    spawnMock.mockImplementation((_file: string, args: string[]) => {
      seenCommandArg = args[3];
      createdScriptPaths.add(decodeCmdPathArg(args[3]));
      return { unref };
    });

    const result = relaunchGatewayScheduledTask({
      REMOTECLAW_PROFILE: "work",
      SystemRoot: TEST_SYSTEM_ROOT,
    });

    expect(result.ok).toBe(true);
    expect(result.method).toBe("schtasks");
    expect(result.tried).toContain(`${PINNED_SCHTASKS} /Run /TN "RemoteClaw Gateway (work)"`);
    expect(result.tried).toContain(`cmd.exe /d /s /c ${seenCommandArg}`);
    const spawnCall = requireFirstMockCall(spawnMock, "restart helper spawn");
    expect(spawnCall[0]).toBe(resolveWindowsCmdExePath());
    expect(spawnCall[1]).toStrictEqual(["/d", "/s", "/c", seenCommandArg]);
    expect(spawnCall[2]).toStrictEqual({
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    expect(unref).toHaveBeenCalledOnce();

    const scriptPath = [...createdScriptPaths][0];
    if (scriptPath === undefined) {
      throw new Error("expected restart helper script path");
    }
    expect(fs.statSync(scriptPath).isFile()).toBe(true);
    const script = fs.readFileSync(scriptPath, "utf8");
    expect(script).toContain("timeout /t 1 /nobreak >nul");
    expect(script).toContain("gateway-restart.log");
    expect(script).toContain(
      'remoteclaw restart attempt source=windows-task-handoff target="RemoteClaw Gateway (work)"',
    );
    expect(script).toContain(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "(Get-ScheduledTask -TaskName 'RemoteClaw Gateway (work)' -ErrorAction SilentlyContinue).State" 2>nul | findstr /I /C:"Running" >nul 2>&1`,
    );
    expect(script).toContain(`${PINNED_SCHTASKS} /Run /TN "RemoteClaw Gateway (work)" >>`);
    expect(script.indexOf("powershell.exe -NoProfile")).toBeLessThan(
      script.indexOf(`${PINNED_SCHTASKS} /Run /TN "RemoteClaw Gateway (work)"`),
    );
    // EVERY emitted `schtasks` invocation, not just one: a bare name resolves through the
    // detached script's inherited %PATH% and cwd (CWE-426, #3112 §4). Asserting the whole
    // set is what makes removing the pinning fail, rather than leaving one occurrence
    // pinned and the other bare — which is exactly the state #3116 found.
    expect(schtasksLines(script).map((line) => line.split(" /TN ")[0])).toStrictEqual([
      `${PINNED_SCHTASKS} /Query`,
      `${PINNED_SCHTASKS} /Run`,
    ]);
    expect(script).toContain('del "%~f0" >nul 2>&1');
  });

  it("prefers REMOTECLAW_WINDOWS_TASK_NAME overrides", () => {
    spawnMock.mockImplementation((_file: string, args: string[]) => {
      createdScriptPaths.add(decodeCmdPathArg(args[3]));
      return { unref: vi.fn() };
    });

    relaunchGatewayScheduledTask({
      REMOTECLAW_PROFILE: "work",
      REMOTECLAW_WINDOWS_TASK_NAME: "RemoteClaw Gateway (custom)",
      SystemRoot: TEST_SYSTEM_ROOT,
    });

    const scriptPath = [...createdScriptPaths][0];
    const script = fs.readFileSync(scriptPath, "utf8");
    expect(script).toContain(`${PINNED_SCHTASKS} /Run /TN "RemoteClaw Gateway (custom)" >>`);
  });

  // The pinned path is interpolated into a cmd script, where an unquoted space would split
  // it into a command plus an argument. `%SystemRoot%` is operator-supplied and the shape
  // gate accepts spaces, so this is reachable rather than theoretical.
  it("quotes the pinned schtasks path when SystemRoot contains a space", () => {
    spawnMock.mockImplementation((_file: string, args: string[]) => {
      createdScriptPaths.add(decodeCmdPathArg(args[3]));
      return { unref: vi.fn() };
    });

    relaunchGatewayScheduledTask({
      REMOTECLAW_PROFILE: "work",
      SystemRoot: "D:\\Win NT",
    });

    const scriptPath = [...createdScriptPaths][0];
    const script = fs.readFileSync(scriptPath, "utf8");
    expect(schtasksLines(script).map((line) => line.split(" /TN ")[0])).toStrictEqual([
      '"D:\\Win NT\\System32\\schtasks.exe" /Query',
      '"D:\\Win NT\\System32\\schtasks.exe" /Run',
    ]);
  });

  it("escapes custom task names in the PowerShell running-task probe", () => {
    spawnMock.mockImplementation((_file: string, args: string[]) => {
      createdScriptPaths.add(decodeCmdPathArg(args[3]));
      return { unref: vi.fn() };
    });

    relaunchGatewayScheduledTask({
      REMOTECLAW_WINDOWS_TASK_NAME: "RemoteClaw Gateway (Bob's work)",
    });

    const scriptPath = [...createdScriptPaths][0];
    const script = fs.readFileSync(scriptPath, "utf8");
    expect(script).toContain(
      "-Command \"(Get-ScheduledTask -TaskName 'RemoteClaw Gateway (Bob''s work)' -ErrorAction SilentlyContinue).State\"",
    );
  });

  it("returns failed when the helper cannot be spawned", () => {
    spawnMock.mockImplementation(() => {
      throw new Error("spawn failed");
    });

    const result = relaunchGatewayScheduledTask({ REMOTECLAW_PROFILE: "work" });

    expect(result.ok).toBe(false);
    expect(result.method).toBe("schtasks");
    expect(result.detail).toContain("spawn failed");
  });

  it("quotes the cmd /c script path when temp paths contain metacharacters", () => {
    const unref = vi.fn();
    const metacharTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw&(restart)-"));
    createdTmpDirs.add(metacharTmpDir);
    resolvePreferredRemoteClawTmpDirMock.mockReturnValue(metacharTmpDir);
    spawnMock.mockReturnValue({ unref });

    relaunchGatewayScheduledTask({ REMOTECLAW_PROFILE: "work" });

    expect(spawnMock).toHaveBeenCalledOnce();
    const spawnCall = requireFirstMockCall(spawnMock, "restart helper spawn");
    const commandArgs = spawnCall[1];
    if (!Array.isArray(commandArgs)) {
      throw new Error("expected cmd.exe argument array");
    }
    const commandArg = commandArgs[3];
    if (typeof commandArg !== "string") {
      throw new Error("expected quoted restart helper path");
    }
    expect(spawnCall[0]).toBe(resolveWindowsCmdExePath());
    expect(commandArgs).toStrictEqual(["/d", "/s", "/c", commandArg]);
    expect(commandArg.startsWith('"')).toBe(true);
    expect(commandArg.endsWith('"')).toBe(true);
    expect(commandArg).toContain("&");
    expect(spawnCall[2]).toStrictEqual({
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
  });

  it("includes startup fallback", () => {
    const taskScriptDir = fs.mkdtempSync(path.join(os.tmpdir(), "remoteclaw-state-"));
    createdTmpDirs.add(taskScriptDir);
    const taskScriptPath = path.join(taskScriptDir, "gateway.cmd");
    fs.writeFileSync(taskScriptPath, "@echo off\r\nrem placeholder\r\n", "utf8");
    resolveTaskScriptPathMock.mockReturnValue(taskScriptPath);

    spawnMock.mockImplementation((_file: string, args: string[]) => {
      createdScriptPaths.add(decodeCmdPathArg(args[3]));
      return { unref: vi.fn() };
    });

    const result = relaunchGatewayScheduledTask({
      REMOTECLAW_PROFILE: "work",
      SystemRoot: TEST_SYSTEM_ROOT,
    });

    expect(result.ok).toBe(true);
    const scriptPath = [...createdScriptPaths][0];
    const script = fs.readFileSync(scriptPath, "utf8");
    expect(script).toContain(`${PINNED_SCHTASKS} /Query /TN`);
    expect(script).toContain(":fallback");
    expect(script).toContain(`start "" /min cmd.exe /d /c`);
    expect(script).toContain(taskScriptPath);
  });
});
