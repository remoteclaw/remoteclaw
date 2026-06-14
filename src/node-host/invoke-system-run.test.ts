import { describe, expect, it, vi } from "vitest";
import { handleSystemRunInvoke } from "./invoke-system-run.js";

describe("handleSystemRunInvoke", () => {
  async function runSystemInvoke(params: {
    command?: string[];
    cwd?: string;
    needsScreenRecording?: boolean;
  }) {
    const runCommand = vi.fn(async () => ({
      success: true,
      stdout: "local-ok",
      stderr: "",
      timedOut: false,
      truncated: false,
      exitCode: 0,
      error: null,
    }));
    const sendInvokeResult = vi.fn(async () => {});
    const sendExecFinishedEvent = vi.fn(async () => {});
    const sendNodeEvent = vi.fn(async () => {});

    await handleSystemRunInvoke({
      client: {} as never,
      params: {
        command: params.command ?? ["echo", "ok"],
        cwd: params.cwd,
        sessionKey: "agent:main:main",
        needsScreenRecording: params.needsScreenRecording ?? false,
      },
      sanitizeEnv: () => undefined,
      runCommand,
      sendNodeEvent,
      buildExecEventPayload: (payload) => payload,
      sendInvokeResult,
      sendExecFinishedEvent,
    });

    return { runCommand, sendInvokeResult, sendExecFinishedEvent, sendNodeEvent };
  }

  it("executes commands directly via runCommand", async () => {
    const { runCommand, sendInvokeResult } = await runSystemInvoke({});

    expect(runCommand).toHaveBeenCalledTimes(1);
    expect(runCommand).toHaveBeenCalledWith(["echo", "ok"], undefined, undefined, undefined);
    expect(sendInvokeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: true,
        payloadJSON: expect.stringContaining("local-ok"),
      }),
    );
  });

  it("denies execution when screen recording permission is required", async () => {
    const { runCommand, sendInvokeResult, sendNodeEvent } = await runSystemInvoke({
      needsScreenRecording: true,
    });

    expect(runCommand).not.toHaveBeenCalled();
    expect(sendNodeEvent).toHaveBeenCalledWith(
      expect.anything(),
      "exec.denied",
      expect.objectContaining({
        reason: "permission:screenRecording",
      }),
    );
    expect(sendInvokeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "UNAVAILABLE",
          message: "PERMISSION_MISSING: screenRecording",
        }),
      }),
    );
  });

  it("rejects requests with no command", async () => {
    const runCommand = vi.fn(async () => ({
      success: true,
      stdout: "",
      stderr: "",
      timedOut: false,
      truncated: false,
      exitCode: 0,
      error: null,
    }));
    const sendInvokeResult = vi.fn(async () => {});

    await handleSystemRunInvoke({
      client: {} as never,
      params: { command: [] },
      sanitizeEnv: () => undefined,
      runCommand,
      sendNodeEvent: async () => {},
      buildExecEventPayload: (payload) => payload,
      sendInvokeResult,
      sendExecFinishedEvent: async () => {},
    });

    expect(runCommand).not.toHaveBeenCalled();
    expect(sendInvokeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({
          code: "INVALID_REQUEST",
          message: "command required",
        }),
        run: async () => {
          const invoke = await runSystemInvoke({
            preferMacAppExecHost: false,
            command: ["/bin/sh", "-lc", "./scripts/check_mail.sh --limit 5"],
            rawCommand: '/bin/sh -lc "./scripts/check_mail.sh --limit 5"',
            cwd: tempDir,
            security: "allowlist",
            ask: "on-miss",
            runCommand: vi.fn(async () => createLocalRunResult("shell-wrapper-inner-ok")),
          });

          expect(invoke.runCommand).toHaveBeenCalledTimes(1);
          expectInvokeOk(invoke.sendInvokeResult, {
            payloadContains: "shell-wrapper-inner-ok",
          });
        },
      });
    },
  );

  it("keeps cmd.exe transport wrappers approval-gated on Windows", async () => {
    const platformSpy = vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    try {
      for (const testCase of [
        {
          name: "direct cmd.exe",
          commandPrefix: ["cmd.exe", "/d", "/s", "/c"],
        },
        {
          name: "env cmd.exe",
          commandPrefix: ["env", "cmd.exe", "/d", "/s", "/c"],
        },
        {
          name: "env-assignment cmd.exe",
          commandPrefix: ["env", "FOO=bar", "cmd.exe", "/d", "/s", "/c"],
        },
      ]) {
        const tempDir = createFixtureDir("remoteclaw-cmd-wrapper-allow-");
        const scriptPath = path.join(tempDir, "check_mail.cmd");
        fs.writeFileSync(scriptPath, "@echo off\r\necho ok\r\n");
        const command = [...testCase.commandPrefix, `${scriptPath} --limit 5`];

        await withTempApprovalsHome({
          approvals: createAllowlistOnMissApprovals({
            agents: {
              main: {
                allowlist: [{ pattern: scriptPath }],
              },
            },
          }),
          run: async () => {
            const seenArgv: string[][] = [];
            const invoke = await runSystemInvoke({
              preferMacAppExecHost: false,
              command,
              cwd: tempDir,
              security: "allowlist",
              ask: "on-miss",
              isCmdExeInvocation: (argv) => {
                seenArgv.push([...argv]);
                const token = argv[0]?.trim();
                if (!token) {
                  return false;
                }
                const base = path.win32.basename(token).toLowerCase();
                return base === "cmd.exe" || base === "cmd";
              },
            });

            expect(seenArgv, testCase.name).toContainEqual([
              "cmd.exe",
              "/d",
              "/s",
              "/c",
              `${scriptPath} --limit 5`,
            ]);
            expect(invoke.runCommand, testCase.name).not.toHaveBeenCalled();
            expectApprovalRequiredDenied({
              sendNodeEvent: invoke.sendNodeEvent,
              sendInvokeResult: invoke.sendInvokeResult,
            });
          },
        });
      }
    } finally {
      platformSpy.mockRestore();
    }
  });

  it("reuses exact-command durable trust for shell-wrapper reruns", async () => {
    if (process.platform === "win32") {
      return;
    }

    const tempDir = createFixtureDir("remoteclaw-shell-wrapper-allow-");
    const prepared = buildSystemRunApprovalPlan({
      command: ["/bin/sh", "-lc", "cd ."],
      cwd: tempDir,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) {
      throw new Error("unreachable");
    }

    await withTempApprovalsHome({
      approvals: {
        version: 1,
        defaults: { security: "allowlist", ask: "on-miss", askFallback: "full" },
        agents: {
          main: {
            allowlist: [
              {
                pattern: `=command:${crypto
                  .createHash("sha256")
                  .update(prepared.plan.commandText)
                  .digest("hex")
                  .slice(0, 16)}`,
                source: "allow-always",
              },
            ],
          },
        },
      },
      run: async () => {
        const rerun = await runSystemInvoke({
          preferMacAppExecHost: false,
          command: prepared.plan.argv,
          rawCommand: prepared.plan.commandText,
          systemRunPlan: prepared.plan,
          cwd: prepared.plan.cwd ?? tempDir,
          security: "allowlist",
          ask: "on-miss",
          runCommand: vi.fn(async () => createLocalRunResult("shell-wrapper-reused")),
        });

        expect(rerun.runCommand).toHaveBeenCalledTimes(1);
        expectInvokeOk(rerun.sendInvokeResult, { payloadContains: "shell-wrapper-reused" });
      },
    });
  });
});
