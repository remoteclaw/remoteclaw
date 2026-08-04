// Pins the schtasks.exe path the DETACHED HANDOFF SCRIPT runs.
//
// `windows-system-paths.call-sites.test.ts` can see that this module calls a resolver;
// it cannot see what the emitted `handoff.cjs` does with the result, because the scan
// reads the module, not the script the module writes (#3112 §4). This suite closes that
// specific gap by reading the emitted artifacts back off disk.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(() => ({ pid: 24680, unref: vi.fn() })),
}));

vi.mock("node:child_process", async () => {
  const { mockNodeBuiltinModule } = await import("../../test/helpers/node-builtin-mocks.js");
  return mockNodeBuiltinModule(
    () => vi.importActual<typeof import("node:child_process")>("node:child_process"),
    { spawn: spawnMock as unknown as typeof import("node:child_process").spawn },
  );
});

const tempDirs = new Set<string>();

afterEach(async () => {
  spawnMock.mockClear();
  await Promise.all([...tempDirs].map((dir) => fs.rm(dir, { recursive: true, force: true })));
  tempDirs.clear();
});

type EmittedHandoff = {
  script: string;
  serviceRecovery: { kind?: string; taskName?: string; runner?: string } | undefined;
};

async function emitSchtasksHandoff(env: NodeJS.ProcessEnv): Promise<EmittedHandoff> {
  const { startManagedServiceUpdateHandoff } = await import("./update-managed-service-handoff.js");
  await startManagedServiceUpdateHandoff({
    root: os.tmpdir(),
    timeoutMs: 1_800_000,
    restartDelayMs: 500,
    parentPid: process.pid,
    execPath: "/usr/local/bin/node",
    argv1: "/opt/remoteclaw/remoteclaw.mjs",
    supervisor: "schtasks",
    env,
    meta: {
      sessionKey: "agent:test:webchat:dm:user-123",
      continuationMessage: "continue after restart",
    },
  });

  const [, args] = spawnMock.mock.calls[0] as unknown as [string, string[]];
  const scriptPath = args[0] ?? "";
  const paramsPath = args[1] ?? "";
  tempDirs.add(path.dirname(scriptPath));
  const params = JSON.parse(await fs.readFile(paramsPath, "utf-8")) as {
    serviceRecovery?: EmittedHandoff["serviceRecovery"];
  };
  return {
    script: await fs.readFile(scriptPath, "utf-8"),
    serviceRecovery: params.serviceRecovery,
  };
}

describe("managed service update handoff — Windows schtasks pinning", () => {
  it("carries an absolute %SystemRoot%-resolved runner into the emitted params", async () => {
    const { serviceRecovery } = await emitSchtasksHandoff({
      // A non-default root, so this literal cannot be satisfied by the C:\Windows fallback.
      SystemRoot: "D:\\WinNT",
      REMOTECLAW_WINDOWS_TASK_NAME: "RemoteClaw Test Gateway",
    });

    expect(serviceRecovery).toEqual({
      kind: "schtasks",
      taskName: "RemoteClaw Test Gateway",
      runner: "D:\\WinNT\\System32\\schtasks.exe",
    });
  });

  it("names no bare schtasks binary anywhere in the emitted script", async () => {
    const { script } = await emitSchtasksHandoff({
      SystemRoot: "D:\\WinNT",
      REMOTECLAW_WINDOWS_TASK_NAME: "RemoteClaw Test Gateway",
    });

    // The script must reach for the pinned value it was handed, never a name %PATH%
    // would have to resolve at run time. The binary NAME is what must be absent; the
    // bare word `"schtasks"` legitimately survives as the recovery-kind discriminant,
    // which is not an executable position.
    expect(script).toContain("runServiceCommand(recovery.runner,");
    expect(script).not.toContain('"schtasks.exe"');
    expect(script).not.toContain("'schtasks.exe'");
  });

  // The runner is written by the parent alongside the script, so it is always present in
  // practice. Fail closed anyway: silently degrading to a bare name is the whole defect.
  it("refuses to run a schtasks recovery with no pinned runner", async () => {
    const { script } = await emitSchtasksHandoff({
      SystemRoot: "D:\\WinNT",
      REMOTECLAW_WINDOWS_TASK_NAME: "RemoteClaw Test Gateway",
    });

    expect(script).toContain('typeof recovery.runner !== "string"');
    expect(script).toContain("gateway service recovery skipped");
  });

  it("falls back to the default root when SystemRoot is hostile", async () => {
    const { serviceRecovery } = await emitSchtasksHandoff({
      SystemRoot: "\\\\attacker\\share\\Windows",
      REMOTECLAW_WINDOWS_TASK_NAME: "RemoteClaw Test Gateway",
    });

    expect(serviceRecovery?.runner).toBe("C:\\Windows\\System32\\schtasks.exe");
  });
});
