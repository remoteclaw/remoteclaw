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
      }),
    );
  });
});
